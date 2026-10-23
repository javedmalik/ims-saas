import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

function parseDateStart(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!can(session.user.role, "OPERATE_FINANCE")) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const supplierId = Number(
    req.nextUrl.searchParams.get("supplierId") || 0,
  );

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json(
      { error: "Valid supplierId is required" },
      { status: 400 },
    );
  }

  const from = parseDateStart(
    req.nextUrl.searchParams.get("from"),
  );

  const to = parseDateEnd(
    req.nextUrl.searchParams.get("to"),
  );

  if (from && to && from > to) {
    return NextResponse.json(
      { error: "From date cannot be after To date" },
      { status: 400 },
    );
  }

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      businessId: session.user.businessId,
    },
  });

  if (!supplier) {
    return NextResponse.json(
      { error: "Supplier not found" },
      { status: 404 },
    );
  }

  const branchId = session.user.branchId;

  const periodWhere = {
    branchId,
    supplierId,
    ...(from || to
      ? {
          txnDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [
    entries,
    openingEntries,
    purchaseTotals,
    supplierPaymentTotals,
    purchaseReturnTotals,
  ] = await Promise.all([
    prisma.supplierLedgerEntry.findMany({
      where: periodWhere,
      orderBy: [
        { txnDate: "asc" },
        { id: "asc" },
      ],
      take: 2000,
    }),

    from
      ? prisma.supplierLedgerEntry.findMany({
          where: {
            branchId,
            supplierId,
            txnDate: {
              lt: from,
            },
          },
          select: {
            debit: true,
            credit: true,
          },
        })
      : Promise.resolve([]),

    prisma.purchase.aggregate({
      where: {
        branchId,
        supplierId,
        isCancelled: false,
      },
      _sum: {
        netAmount: true,
        paidAmount: true,
        dueAmount: true,
      },
    }),

    prisma.supplierPayment.aggregate({
      where: {
        branchId,
        supplierId,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.purchaseReturn.aggregate({
      where: {
        branchId,
        supplierId,
      },
      _sum: {
        netAmount: true,
      },
    }),
  ]);

  const openingBalance = openingEntries.reduce(
    (balance, entry) =>
      balance +
      Number(entry.credit) -
      Number(entry.debit),
    0,
  );

  let runningBalance = openingBalance;

  const purchaseIds: bigint[] = [];
  const paymentIds: bigint[] = [];
  const returnIds: bigint[] = [];

  for (const entry of entries) {
    if (!entry.referenceId) continue;

    try {
      const id = BigInt(entry.referenceId);

      if (entry.referenceType === "Purchase") {
        purchaseIds.push(id);
      } else if (
        entry.referenceType === "SupplierPayment"
      ) {
        paymentIds.push(id);
      } else if (
        entry.referenceType === "PurchaseReturn"
      ) {
        returnIds.push(id);
      }
    } catch {
      // Keep unknown/non-numeric references as-is.
    }
  }

  const [
    purchaseRefs,
    paymentRefs,
    returnRefs,
  ] = await Promise.all([
    purchaseIds.length
      ? prisma.purchase.findMany({
          where: {
            id: {
              in: purchaseIds,
            },
            branchId,
            supplierId,
          },
          select: {
            id: true,
            invoiceNo: true,
            grnNo: true,
          },
        })
      : Promise.resolve([]),

    paymentIds.length
      ? prisma.supplierPayment.findMany({
          where: {
            id: {
              in: paymentIds,
            },
            branchId,
            supplierId,
          },
          select: {
            id: true,
            paymentNo: true,
          },
        })
      : Promise.resolve([]),

    returnIds.length
      ? prisma.purchaseReturn.findMany({
          where: {
            id: {
              in: returnIds,
            },
            branchId,
            supplierId,
          },
          select: {
            id: true,
            returnNo: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const referenceNumbers = new Map<string, string>();

  for (const row of purchaseRefs) {
    referenceNumbers.set(
      `Purchase:${row.id.toString()}`,
      row.grnNo || row.invoiceNo,
    );
  }

  for (const row of paymentRefs) {
    referenceNumbers.set(
      `SupplierPayment:${row.id.toString()}`,
      row.paymentNo,
    );
  }

  for (const row of returnRefs) {
    referenceNumbers.set(
      `PurchaseReturn:${row.id.toString()}`,
      row.returnNo,
    );
  }

  let periodDebit = 0;
  let periodCredit = 0;

  const rows = entries.map((entry) => {
    const debit = Number(entry.debit);
    const credit = Number(entry.credit);

    periodDebit += debit;
    periodCredit += credit;

    runningBalance += credit - debit;

    const key =
      entry.referenceType && entry.referenceId
        ? `${entry.referenceType}:${entry.referenceId}`
        : "";

    return {
      id: entry.id.toString(),
      txnDate: entry.txnDate,
      entryType: entry.entryType,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      referenceNo:
        referenceNumbers.get(key) ||
        entry.referenceId ||
        null,
      debit,
      credit,
      runningBalance,
      note: entry.note,
    };
  });

  const totalPurchases = Number(
    purchaseTotals._sum.netAmount ?? 0,
  );

  const paidAtPurchase = Number(
    purchaseTotals._sum.paidAmount ?? 0,
  );

  const purchaseDueRaised = Number(
    purchaseTotals._sum.dueAmount ?? 0,
  );

  const supplierPayments = Number(
    supplierPaymentTotals._sum.amount ?? 0,
  );

  const purchaseReturns = Number(
    purchaseReturnTotals._sum.netAmount ?? 0,
  );

  const currentOutstanding = Math.max(
    0,
    purchaseDueRaised -
      supplierPayments -
      purchaseReturns,
  );

  return NextResponse.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      mobile: supplier.mobile,
      phone: supplier.phone,
      taxId: supplier.taxId,
      addressLine1: supplier.addressLine1,
      addressLine2: supplier.addressLine2,
      city: supplier.city,
      state: supplier.state,
      stateCode: supplier.stateCode,
      pincode: supplier.pincode,
    },

    branchId,

    period: {
      from:
        req.nextUrl.searchParams.get("from") ||
        null,
      to:
        req.nextUrl.searchParams.get("to") ||
        null,
    },

    summary: {
      openingBalance,
      periodDebit,
      periodCredit,
      closingBalance: runningBalance,

      totalPurchases,
      paidAtPurchase,
      purchaseDueRaised,
      supplierPayments,
      purchaseReturns,
      currentOutstanding,
    },

    entries: rows,
  });
}
