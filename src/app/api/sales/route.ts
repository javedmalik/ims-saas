import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { saleSchema } from "@/lib/validations/transaction";

import { money, paymentLabel } from "@/lib/transaction-utils";

import { can } from "@/lib/rbac";
import { financialYearFor, financialYearShort } from "@/lib/financial-year";

function serializeSale(sale: any) {
  return {
    ...sale,

    id: sale.id.toString(),

    grossAmount: Number(sale.grossAmount),

    totalDiscount: Number(sale.totalDiscount),

    taxableAmount: Number(sale.taxableAmount),

    totalCgst: Number(sale.totalCgst),

    totalSgst: Number(sale.totalSgst),

    totalIgst: Number(sale.totalIgst),

    netAmount: Number(sale.netAmount),

    receivedAmount: Number(sale.receivedAmount),

    dueAmount: Number(sale.dueAmount),

    payments: sale.payments?.map((payment: any) => ({
      ...payment,

      id: payment.id.toString(),

      saleId: payment.saleId.toString(),

      amount: Number(payment.amount),
    })),
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "VIEW_REPORTS")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || "";

  const rows = await prisma.sale.findMany({
    where: {
      branchId: session.user.branchId,

      ...(search
        ? {
            OR: [
              {
                billNo: {
                  contains: search,
                },
              },

              {
                customer: {
                  name: {
                    contains: search,
                  },
                },
              },
            ],
          }
        : {}),
    },

    include: {
      customer: {
        select: {
          name: true,
          mobile: true,
        },
      },

      payments: true,

      _count: {
        select: {
          items: true,
        },
      },
    },

    orderBy: {
      billDateTime: "desc",
    },

    take: 300,
  });

  return NextResponse.json(rows.map(serializeSale));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MAKE_SALE")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const parsed = saleSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid sale",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  const branch = await prisma.branch.findUnique({
    where: { id: session.user.branchId },
    include: { business: { select: { financialYearStartMonth: true } } },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Branch not found",
      },
      {
        status: 400,
      },
    );
  }

  let customer: any = null;

  if (data.customerId) {
    customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,

        businessId: session.user.businessId,

        isActive: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Invalid customer",
        },
        {
          status: 400,
        },
      );
    }
  }

  const batchIds = [...new Set(data.items.map((item) => item.batchId))];

  const batches = await prisma.productBatch.findMany({
    where: {
      id: {
        in: batchIds,
      },

      branchId: session.user.branchId,
    },

    include: {
      product: true,
    },
  });

  if (batches.length !== batchIds.length) {
    return NextResponse.json(
      {
        error: "Invalid batch",
      },
      {
        status: 400,
      },
    );
  }

  for (const item of data.items) {
    const batch = batches.find((b: any) => b.id === item.batchId);

    if (batch?.expiryDate) {
      const expiry = new Date(batch.expiryDate);
      expiry.setHours(23, 59, 59, 999);
      if (expiry < new Date()) {
        return NextResponse.json({ error: `Expired batch cannot be sold: ${batch.product.name} / ${batch.batchNo}` }, { status: 400 });
      }
    }

    if (batch && !branch.allowNegativeStock && batch.currentQty < item.qty) {
      return NextResponse.json(
        {
          error: `Insufficient stock for ${batch.product.name} / ${batch.batchNo}`,
        },
        {
          status: 400,
        },
      );
    }
  }

  let grossAmount = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalTax = 0;

  const calculatedItems = data.items.map((item: any) => {
    const batch = batches.find((b: any) => b.id === item.batchId)!;

    const rate = item.rate ?? Number(batch.sellPrice);

    const taxPercent = Number(batch.product.defaultTaxPercent);

    const gross = money(rate * item.qty);

    const discountAmount = money((gross * item.discountPercent) / 100);

    const afterDiscount = money(gross - discountAmount);

    let taxable: number;
    let taxAmount: number;

    if (branch.pricesIncludeTax && taxPercent > 0) {
      taxable = money(afterDiscount / (1 + taxPercent / 100));

      taxAmount = money(afterDiscount - taxable);
    } else {
      taxable = afterDiscount;

      taxAmount = money((taxable * taxPercent) / 100);
    }

    grossAmount += gross;

    totalDiscount += discountAmount;

    taxableAmount += taxable;

    totalTax += taxAmount;

    return {
      input: item,

      batch,

      rate,

      taxPercent,

      discountAmount,

      taxAmount,

      costPriceAtSale: money(Number(batch.costPrice)),

      costAmount: money(Number(batch.costPrice) * item.qty),

      lineTotal: money(taxable + taxAmount),
    };
  });

  grossAmount = money(grossAmount);

  totalDiscount = money(totalDiscount);

  taxableAmount = money(taxableAmount);

  totalTax = money(totalTax);

  const netAmount = money(taxableAmount + totalTax);

  const tender = money(
    data.payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (Math.abs(tender - netAmount) > 0.02) {
    return NextResponse.json(
      {
        error: `Payments must equal bill total ₹${netAmount.toFixed(2)}.`,
      },
      {
        status: 400,
      },
    );
  }

  const creditAmount = money(
    data.payments
      .filter((payment) => payment.mode === "CREDIT")
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (creditAmount > 0 && !customer) {
    return NextResponse.json(
      {
        error: "Customer is required for credit sale",
      },
      {
        status: 400,
      },
    );
  }

  const receivedAmount = money(netAmount - creditAmount);

  const interstate = !!(
    customer?.stateCode &&
    branch.stateCode &&
    customer.stateCode !== branch.stateCode
  );

  const totalCgst = interstate ? 0 : money(totalTax / 2);

  const totalSgst = interstate ? 0 : money(totalTax - totalCgst);

  const totalIgst = interstate ? totalTax : 0;

  const created = await prisma.$transaction(async (tx: any) => {
    const billDate = new Date();
    const financialYear = financialYearFor(billDate, branch.business.financialYearStartMonth);
    const sequenceRow = await tx.documentSequence.upsert({
      where: { branchId_documentType_financialYear: { branchId: session.user.branchId, documentType: "SALE", financialYear } },
      create: { branchId: session.user.branchId, documentType: "SALE", financialYear, nextNumber: 1 },
      update: { nextNumber: { increment: 1 } },
    });
    const billNo = `${branch.invoicePrefix}/${financialYearShort(billDate, branch.business.financialYearStartMonth)}/${String(sequenceRow.nextNumber).padStart(6, "0")}`;

    const sale = await tx.sale.create({
      data: {
        branchId: session.user.branchId,

        billNo,

        customerId: data.customerId || null,

        grossAmount,

        totalDiscount,

        taxableAmount,

        totalCgst,

        totalSgst,

        totalIgst,

        placeOfSupplyStateCode: customer?.stateCode || branch.stateCode || null,

        isInterstate: interstate,

        financialYear,

        netAmount,

        paymentMode: paymentLabel(data.payments),

        receivedAmount,

        dueAmount: creditAmount,

        createdById: Number(session.user.id),
      },
    });

    for (const item of calculatedItems) {
      await tx.saleItem.create({
        data: {
          saleId: sale.id,

          batchId: item.batch.id,

          qty: item.input.qty,

          rate: item.rate,

          discountPercent: item.input.discountPercent,

          discountAmount: item.discountAmount,

          taxPercent: item.taxPercent,

          taxAmount: item.taxAmount,

          costPriceAtSale: item.costPriceAtSale,

            costAmount: item.costAmount,

            lineTotal: item.lineTotal,
        },
      });

      const updatedBatch = await tx.productBatch.update({
        where: { id: item.batch.id },
        data: { currentQty: { decrement: item.input.qty } },
      });

      await tx.stockLedgerEntry.create({
        data: {
          branchId: session.user.branchId,
          batchId: item.batch.id,
          movementType: "SALE",
          referenceType: "Sale",
          referenceId: sale.id.toString(),
          qtyChange: -item.input.qty,
          balanceAfter: updatedBatch.currentQty,
          note: billNo,
        },
      });
    }

    for (const payment of data.payments) {
      await tx.salePayment.create({
        data: {
          saleId: sale.id,

          branchId: session.user.branchId,

          mode: payment.mode,

          amount: payment.amount,

          reference: payment.reference || null,
        },
      });
    }

    if (customer && creditAmount > 0) {
      await tx.customer.update({
        where: {
          id: customer.id,
        },

        data: {
          dueAmount: {
            increment: creditAmount,
          },
        },
      });

      await tx.customerLedgerEntry.create({
        data: {
          branchId: session.user.branchId,

          customerId: customer.id,

          saleId: sale.id,

          debit: creditAmount,

          credit: 0,

          note: `Credit sale ${billNo}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,

        branchId: session.user.branchId,

        userId: Number(session.user.id),

        action: "SALE_CREATE",

        entityType: "Sale",

        entityId: sale.id.toString(),

        metadata: JSON.stringify({
          billNo,
          netAmount,
        }),
      },
    });

    return sale;
  });

  return NextResponse.json(
    {
      id: created.id.toString(),

      billNo: created.billNo,

      netAmount,
    },
    {
      status: 201,
    },
  );
}
