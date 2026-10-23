import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { purchaseSchema } from "@/lib/validations/transaction";

import { money, paymentLabel } from "@/lib/transaction-utils";

import { can } from "@/lib/rbac";
import { financialYearFor, financialYearShort } from "@/lib/financial-year";

function serializePurchase(purchase: any) {
  return {
    ...purchase,

    id: purchase.id.toString(),

    grossAmount: Number(purchase.grossAmount),

    totalDiscount: Number(purchase.totalDiscount),

    taxableAmount: Number(purchase.taxableAmount),

    totalTax: Number(purchase.totalTax),

    netAmount: Number(purchase.netAmount),

    paidAmount: Number(purchase.paidAmount),

    dueAmount: Number(purchase.dueAmount),

    payments: purchase.payments?.map((payment: any) => ({
      ...payment,

      id: payment.id.toString(),

      purchaseId: payment.purchaseId.toString(),

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

  if (
    !session.user.tenantId ||
    !session.user.businessId ||
    !session.user.branchId
  ) {
    return NextResponse.json(
      {
        error: "Invalid session context",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MANAGE_PURCHASES")) {
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

  const rows = await prisma.purchase.findMany({
    where: {
      branchId: session.user.branchId,

      ...(search
        ? {
            OR: [
              {
                invoiceNo: {
                  contains: search,
                },
              },

              {
                supplier: {
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
      supplier: {
        select: {
          id: true,
          name: true,
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
      invoiceDate: "desc",
    },

    take: 300,
  });

  return NextResponse.json(rows.map(serializePurchase));
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

  if (
    !session.user.tenantId ||
    !session.user.businessId ||
    !session.user.branchId
  ) {
    return NextResponse.json(
      {
        error: "Invalid session context",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MANAGE_PURCHASES")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const parsed = purchaseSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid purchase data",

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
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: data.supplierId,

      businessId: session.user.businessId,

      isActive: true,
    },
  });

  if (!supplier) {
    return NextResponse.json(
      {
        error: "Invalid supplier",
      },
      {
        status: 400,
      },
    );
  }

  const duplicateInvoice = await prisma.purchase.findFirst({
    where: { branchId: session.user.branchId, supplierId: data.supplierId, invoiceNo: data.invoiceNo, isCancelled: false },
    select: { id: true },
  });
  if (duplicateInvoice) return NextResponse.json({ error: "This supplier invoice number already exists in the current branch." }, { status: 409 });

  const productIds = [...new Set(data.items.map((item) => item.productId))];

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },

      businessId: session.user.businessId,

      isActive: true,
    },

    select: {
      id: true,
      name: true,
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      {
        error: "One or more products are invalid",
      },
      {
        status: 400,
      },
    );
  }

  let grossAmount = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalTax = 0;

  const calculatedItems = data.items.map((item) => {
    const gross = money(item.costPrice * item.qty);

    const discountAmount = money((gross * item.discountPercent) / 100);

    const taxable = money(gross - discountAmount);

    const taxAmount = money((taxable * item.taxPercent) / 100);

    const lineTotal = money(taxable + taxAmount);

    grossAmount += gross;

    totalDiscount += discountAmount;

    taxableAmount += taxable;

    totalTax += taxAmount;

    return {
      ...item,

      discountAmount,

      taxAmount,

      lineTotal,
    };
  });

  grossAmount = money(grossAmount);

  totalDiscount = money(totalDiscount);

  taxableAmount = money(taxableAmount);

  totalTax = money(totalTax);

  const netAmount = money(taxableAmount + totalTax);

  const paidAmount = money(
    data.payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (paidAmount > netAmount + 0.01) {
    return NextResponse.json(
      {
        error: `Payment amount cannot exceed purchase total ₹${netAmount.toFixed(
          2,
        )}`,
      },
      {
        status: 400,
      },
    );
  }

  const dueAmount = money(netAmount - paidAmount);
  const interstate = !!(supplier.stateCode && branch.stateCode && supplier.stateCode !== branch.stateCode);
  const totalCgst = interstate ? 0 : money(totalTax / 2);
  const totalSgst = interstate ? 0 : money(totalTax - totalCgst);
  const totalIgst = interstate ? totalTax : 0;

  try {
    const created = await prisma.$transaction(async (tx) => {
      /*
       * Generate internal purchase number.
       *
       * Supplier invoice number stays in
       * invoiceNo.
       */

      const invoiceDate = new Date(data.invoiceDate);
      const financialYear = financialYearFor(invoiceDate, branch.business.financialYearStartMonth);
      const sequenceRow = await tx.documentSequence.upsert({
        where: { branchId_documentType_financialYear: { branchId: session.user.branchId, documentType: "PURCHASE", financialYear } },
        create: { branchId: session.user.branchId, documentType: "PURCHASE", financialYear, nextNumber: 1 },
        update: { nextNumber: { increment: 1 } },
      });
      const grnNo = `${branch.purchasePrefix}/${financialYearShort(invoiceDate, branch.business.financialYearStartMonth)}/${String(sequenceRow.nextNumber).padStart(6, "0")}`;

      const purchase = await tx.purchase.create({
        data: {
          branchId: session.user.branchId,

          supplierId: data.supplierId,

          invoiceNo: data.invoiceNo,

          grnNo,

          invoiceDate,

          grossAmount,

          totalDiscount,

          taxableAmount,

          totalTax,

          totalCgst,

          totalSgst,

          totalIgst,

          placeOfSupplyStateCode: supplier.stateCode || branch.stateCode || null,

          isInterstate: interstate,

          netAmount,

          paymentMode: data.payments.length
            ? paymentLabel(data.payments)
            : "CREDIT",

          paidAmount,

          dueAmount,

          isCancelled: false,

          createdById: Number(session.user.id),
        },
      });

      for (const item of calculatedItems) {
        let batch = await tx.productBatch.findFirst({
          where: {
            branchId: session.user.branchId,

            productId: item.productId,

            batchNo: item.batchNo,
          },
        });

        const receivedQty = item.qty + item.freeQty;

        if (!batch) {
          batch = await tx.productBatch.create({
            data: {
              branchId: session.user.branchId,

              productId: item.productId,

              batchNo: item.batchNo,

              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,

              mrp: item.mrp,

              costPrice: item.costPrice,

              sellPrice: item.sellPrice,

              openingQty: receivedQty,

              currentQty: receivedQty,
            },
          });
        } else {
          batch = await tx.productBatch.update({
            where: {
              id: batch.id,
            },

            data: {
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,

              mrp: item.mrp,

              costPrice: item.costPrice,

              sellPrice: item.sellPrice,

              currentQty: {
                increment: receivedQty,
              },
            },
          });
        }

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,

            productId: item.productId,

            batchId: batch.id,

            batchNo: item.batchNo,

            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,

            qty: item.qty,

            freeQty: item.freeQty,

            mrp: item.mrp,

            costPrice: item.costPrice,

            sellPrice: item.sellPrice,

            discountPercent: item.discountPercent,

            discountAmount: item.discountAmount,

            taxPercent: item.taxPercent,

            taxAmount: item.taxAmount,

            lineTotal: item.lineTotal,
          },
        });

        await tx.stockLedgerEntry.create({
          data: {
            branchId: session.user.branchId,
            batchId: batch.id,
            movementType: "PURCHASE",
            referenceType: "Purchase",
            referenceId: purchase.id.toString(),
            qtyChange: receivedQty,
            balanceAfter: batch.currentQty,
            note: grnNo,
          },
        });
      }

      for (const payment of data.payments) {
        await tx.purchasePayment.create({
          data: {
            purchaseId: purchase.id,

            branchId: session.user.branchId,

            mode: payment.mode,

            amount: payment.amount,

            reference: payment.reference || null,
          },
        });
      }

      if (dueAmount > 0) {
        await tx.supplierLedgerEntry.create({
          data: {
            branchId: session.user.branchId,
            supplierId: data.supplierId,
            entryType: "PURCHASE",
            referenceType: "Purchase",
            referenceId: purchase.id.toString(),
            debit: 0,
            credit: dueAmount,
            note: `Purchase ${grnNo} / ${data.invoiceNo}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,

          branchId: session.user.branchId,

          userId: Number(session.user.id),

          action: "PURCHASE_CREATE",

          entityType: "Purchase",

          entityId: purchase.id.toString(),

          metadata: JSON.stringify({
            supplierId: data.supplierId,

            invoiceNo: data.invoiceNo,

            grossAmount,

            totalDiscount,

            totalTax,

            netAmount,

            paidAmount,

            dueAmount,
          }),
        },
      });

      return purchase;
    });

    return NextResponse.json(
      {
        id: created.id.toString(),

        invoiceNo: created.invoiceNo,

        grnNo: created.grnNo,

        netAmount,

        paidAmount,

        dueAmount,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("PURCHASE_CREATE_ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create purchase",
      },
      {
        status: 400,
      },
    );
  }
}
