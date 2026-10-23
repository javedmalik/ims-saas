import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

function n(value: unknown) {
  return Number(value ?? 0);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateRange(from: Date | undefined, to: Date | undefined) {
  return from || to
    ? {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      }
    : undefined;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session.user.role, "VIEW_REPORTS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = startDate(req.nextUrl.searchParams.get("from"));
  const to = endDate(req.nextUrl.searchParams.get("to"));
  const view = req.nextUrl.searchParams.get("view") || "hsn-gst";
  const search = req.nextUrl.searchParams.get("search")?.trim() || "";

  if (view === "hsn-gst") {
    return hsnGstReport(session.user.branchId, from, to, search);
  }

  if (view === "payments") {
    return paymentCollectionReport(session.user.branchId, from, to);
  }

  if (view === "user-sales") {
    return userWiseSalesReport(session.user.branchId, from, to);
  }

  if (view === "branch-comparison") {
    return branchComparisonReport(session.user.businessId, from, to);
  }

  return NextResponse.json(
    { error: "Unsupported report view" },
    { status: 400 },
  );
}

async function hsnGstReport(
  branchId: number,
  from: Date | undefined,
  to: Date | undefined,
  search: string,
) {
  const billRange = dateRange(from, to);
  const returnRange = dateRange(from, to);

  const [saleItems, returnItems] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          isCancelled: false,
          ...(billRange ? { billDateTime: billRange } : {}),
        },

        ...(search
          ? {
              batch: {
                product: {
                  OR: [
                    { name: { contains: search } },
                    { sku: { contains: search } },
                    { hsnCode: { contains: search } },
                  ],
                },
              },
            }
          : {}),
      },

      include: {
        sale: {
          select: {
            isInterstate: true,
          },
        },

        batch: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                hsnCode: true,
                unit: true,
              },
            },
          },
        },
      },
    }),

    prisma.saleReturnItem.findMany({
      where: {
        saleReturn: {
          branchId,
          ...(returnRange ? { returnDate: returnRange } : {}),
        },

        ...(search
          ? {
              batch: {
                product: {
                  OR: [
                    { name: { contains: search } },
                    { sku: { contains: search } },
                    { hsnCode: { contains: search } },
                  ],
                },
              },
            }
          : {}),
      },

      include: {
        saleItem: {
          include: {
            sale: {
              select: {
                isInterstate: true,
              },
            },
          },
        },

        batch: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                hsnCode: true,
                unit: true,
              },
            },
          },
        },
      },
    }),
  ]);

  type Row = {
    key: string;
    hsnCode: string;
    product: string;
    unit: string;
    taxPercent: number;
    quantity: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    netValue: number;
    creditNoteQty: number;
    creditNoteTaxable: number;
  };

  const groups = new Map<string, Row>();

  function getRow(
    productId: number,
    hsnCode: string,
    product: string,
    unit: string,
    taxPercent: number,
  ) {
    const key = `${productId}|${taxPercent}`;

    const existing = groups.get(key);

    if (existing) {
      return existing;
    }

    const row: Row = {
      key,
      hsnCode: hsnCode || "UNCLASSIFIED",
      product,
      unit,
      taxPercent,
      quantity: 0,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      netValue: 0,
      creditNoteQty: 0,
      creditNoteTaxable: 0,
    };

    groups.set(key, row);
    return row;
  }

  for (const item of saleItems as any[]) {
    const product = item.batch.product;
    const tax = n(item.taxAmount);
    const taxable = round2(n(item.lineTotal) - tax);
    const taxPercent = n(item.taxPercent);

    const row = getRow(
      product.id,
      product.hsnCode || "",
      product.name,
      product.unit,
      taxPercent,
    );

    row.quantity += Number(item.qty || 0);
    row.taxableValue += taxable;
    row.totalTax += tax;
    row.netValue += n(item.lineTotal);

    if (item.sale.isInterstate) {
      row.igst += tax;
    } else {
      const cgst = round2(tax / 2);
      row.cgst += cgst;
      row.sgst += round2(tax - cgst);
    }
  }

  for (const item of returnItems as any[]) {
    const product = item.batch.product;
    const tax = n(item.taxAmount);
    const taxable = n(item.taxableAmount);
    const taxPercent = n(item.saleItem.taxPercent);

    const row = getRow(
      product.id,
      product.hsnCode || "",
      product.name,
      product.unit,
      taxPercent,
    );

    row.quantity -= Number(item.qty || 0);
    row.taxableValue -= taxable;
    row.totalTax -= tax;
    row.netValue -= n(item.lineTotal);
    row.creditNoteQty += Number(item.qty || 0);
    row.creditNoteTaxable += taxable;

    if (item.saleItem.sale.isInterstate) {
      row.igst -= tax;
    } else {
      const cgst = round2(tax / 2);
      row.cgst -= cgst;
      row.sgst -= round2(tax - cgst);
    }
  }

  const rows = Array.from(groups.values())
    .map((row) => ({
      ...row,
      quantity: round2(row.quantity),
      taxableValue: round2(row.taxableValue),
      cgst: round2(row.cgst),
      sgst: round2(row.sgst),
      igst: round2(row.igst),
      totalTax: round2(row.totalTax),
      netValue: round2(row.netValue),
      creditNoteQty: round2(row.creditNoteQty),
      creditNoteTaxable: round2(row.creditNoteTaxable),
    }))
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));

  return NextResponse.json({
    type: "hsn-gst",
    rows,
    summary: {
      quantity: round2(rows.reduce((sum, row) => sum + row.quantity, 0)),
      taxableValue: round2(
        rows.reduce((sum, row) => sum + row.taxableValue, 0),
      ),
      cgst: round2(rows.reduce((sum, row) => sum + row.cgst, 0)),
      sgst: round2(rows.reduce((sum, row) => sum + row.sgst, 0)),
      igst: round2(rows.reduce((sum, row) => sum + row.igst, 0)),
      totalTax: round2(rows.reduce((sum, row) => sum + row.totalTax, 0)),
      netValue: round2(rows.reduce((sum, row) => sum + row.netValue, 0)),
      creditNoteQty: round2(
        rows.reduce((sum, row) => sum + row.creditNoteQty, 0),
      ),
      creditNoteTaxable: round2(
        rows.reduce((sum, row) => sum + row.creditNoteTaxable, 0),
      ),
    },
  });
}

async function paymentCollectionReport(
  branchId: number,
  from: Date | undefined,
  to: Date | undefined,
) {
  const saleRange = dateRange(from, to);
  const receiptRange = dateRange(from, to);
  const returnRange = dateRange(from, to);

  const [salePayments, receipts, refunds] = await Promise.all([
    prisma.salePayment.findMany({
      where: {
        branchId,
        ...(saleRange ? { createdAt: saleRange } : {}),
        mode: {
          not: "CREDIT",
        },
        sale: {
          isCancelled: false,
        },
      },

      include: {
        sale: {
          select: {
            id: true,
            billNo: true,
            billDateTime: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    }),

    prisma.customerReceipt.findMany({
      where: {
        branchId,
        ...(receiptRange ? { receiptDate: receiptRange } : {}),
      },

      include: {
        customer: {
          select: {
            name: true,
          },
        },
      },

      orderBy: {
        receiptDate: "desc",
      },
    }),

    prisma.saleReturn.findMany({
      where: {
        branchId,
        refundAmount: {
          gt: 0,
        },
        ...(returnRange ? { returnDate: returnRange } : {}),
      },

      include: {
        sale: {
          select: {
            billNo: true,
          },
        },
      },

      orderBy: {
        returnDate: "desc",
      },
    }),
  ]);

  const details: any[] = [];

  for (const payment of salePayments as any[]) {
    details.push({
      id: `SALE-${payment.id.toString()}`,
      date: payment.createdAt,
      source: "SALE",
      reference: payment.sale.billNo,
      party: "",
      mode: payment.mode,
      amount: round2(n(payment.amount)),
      direction: "IN",
      netAmount: round2(n(payment.amount)),
      note: payment.reference || "",
    });
  }

  for (const receipt of receipts as any[]) {
    details.push({
      id: `RECEIPT-${receipt.id.toString()}`,
      date: receipt.receiptDate,
      source: "CUSTOMER_RECEIPT",
      reference: receipt.receiptNo,
      party: receipt.customer.name,
      mode: receipt.mode,
      amount: round2(n(receipt.amount)),
      direction: "IN",
      netAmount: round2(n(receipt.amount)),
      note: receipt.reference || receipt.note || "",
    });
  }

  for (const refund of refunds as any[]) {
    details.push({
      id: `REFUND-${refund.id.toString()}`,
      date: refund.returnDate,
      source: "SALES_RETURN_REFUND",
      reference: refund.returnNo,
      party: "",
      mode: refund.refundMode || "UNSPECIFIED",
      amount: round2(n(refund.refundAmount)),
      direction: "OUT",
      netAmount: -round2(n(refund.refundAmount)),
      note: `Against ${refund.sale.billNo}`,
    });
  }

  details.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  type ModeSummary = {
    mode: string;
    saleCollections: number;
    customerReceipts: number;
    refunds: number;
    netCollection: number;
  };

  const modes = new Map<string, ModeSummary>();

  for (const row of details) {
    const mode = row.mode || "UNSPECIFIED";
    const current = modes.get(mode) || {
      mode,
      saleCollections: 0,
      customerReceipts: 0,
      refunds: 0,
      netCollection: 0,
    };

    if (row.source === "SALE") {
      current.saleCollections += row.amount;
    } else if (row.source === "CUSTOMER_RECEIPT") {
      current.customerReceipts += row.amount;
    } else {
      current.refunds += row.amount;
    }

    current.netCollection += row.netAmount;
    modes.set(mode, current);
  }

  const rows = Array.from(modes.values())
    .map((row) => ({
      ...row,
      saleCollections: round2(row.saleCollections),
      customerReceipts: round2(row.customerReceipts),
      refunds: round2(row.refunds),
      netCollection: round2(row.netCollection),
    }))
    .sort((a, b) => b.netCollection - a.netCollection);

  return NextResponse.json({
    type: "payments",
    rows,
    details,
    summary: {
      saleCollections: round2(
        rows.reduce((sum, row) => sum + row.saleCollections, 0),
      ),
      customerReceipts: round2(
        rows.reduce((sum, row) => sum + row.customerReceipts, 0),
      ),
      refunds: round2(rows.reduce((sum, row) => sum + row.refunds, 0)),
      netCollection: round2(
        rows.reduce((sum, row) => sum + row.netCollection, 0),
      ),
      transactions: details.length,
    },
  });
}

async function userWiseSalesReport(
  branchId: number,
  from: Date | undefined,
  to: Date | undefined,
) {
  const billRange = dateRange(from, to);
  const returnRange = dateRange(from, to);

  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId,
        isCancelled: false,
        ...(billRange ? { billDateTime: billRange } : {}),
      },

      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
            role: true,
          },
        },
      },
    }),

    prisma.saleReturn.findMany({
      where: {
        branchId,
        ...(returnRange ? { returnDate: returnRange } : {}),
      },

      include: {
        sale: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  ]);

  type UserRow = {
    userId: number;
    user: string;
    username: string;
    role: string;
    invoices: number;
    grossAmount: number;
    discount: number;
    taxableSales: number;
    gst: number;
    netSales: number;
    creditNotes: number;
    creditNoteValue: number;
    finalNetSales: number;
    receivedAmount: number;
    creditAmount: number;
  };

  const groups = new Map<number, UserRow>();

  for (const sale of sales as any[]) {
    const userId = sale.createdBy.id;

    const row = groups.get(userId) || {
      userId,
      user: sale.createdBy.fullName || sale.createdBy.username,
      username: sale.createdBy.username,
      role: sale.createdBy.role,
      invoices: 0,
      grossAmount: 0,
      discount: 0,
      taxableSales: 0,
      gst: 0,
      netSales: 0,
      creditNotes: 0,
      creditNoteValue: 0,
      finalNetSales: 0,
      receivedAmount: 0,
      creditAmount: 0,
    };

    row.invoices += 1;
    row.grossAmount += n(sale.grossAmount);
    row.discount += n(sale.totalDiscount);
    row.taxableSales += n(sale.taxableAmount);
    row.gst += n(sale.totalCgst) + n(sale.totalSgst) + n(sale.totalIgst);
    row.netSales += n(sale.netAmount);
    row.receivedAmount += n(sale.receivedAmount);
    row.creditAmount += n(sale.dueAmount);

    groups.set(userId, row);
  }

  for (const creditNote of returns as any[]) {
    const userId = creditNote.sale.createdById;
    const row = groups.get(userId);

    if (!row) {
      /*
       * Return can be inside the selected period while the original
       * invoice was outside it. Keep it visible under the original
       * salesperson instead of dropping the adjustment.
       */
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          username: true,
          role: true,
        },
      });

      if (!user) continue;

      groups.set(userId, {
        userId,
        user: user.fullName || user.username,
        username: user.username,
        role: user.role,
        invoices: 0,
        grossAmount: 0,
        discount: 0,
        taxableSales: 0,
        gst: 0,
        netSales: 0,
        creditNotes: 1,
        creditNoteValue: n(creditNote.netAmount),
        finalNetSales: 0,
        receivedAmount: 0,
        creditAmount: 0,
      });

      continue;
    }

    row.creditNotes += 1;
    row.creditNoteValue += n(creditNote.netAmount);
  }

  const rows = Array.from(groups.values())
    .map((row) => ({
      ...row,
      grossAmount: round2(row.grossAmount),
      discount: round2(row.discount),
      taxableSales: round2(row.taxableSales),
      gst: round2(row.gst),
      netSales: round2(row.netSales),
      creditNoteValue: round2(row.creditNoteValue),
      finalNetSales: round2(row.netSales - row.creditNoteValue),
      receivedAmount: round2(row.receivedAmount),
      creditAmount: round2(row.creditAmount),
      averageBill:
        row.invoices > 0
          ? round2((row.netSales - row.creditNoteValue) / row.invoices)
          : 0,
    }))
    .sort((a, b) => b.finalNetSales - a.finalNetSales);

  return NextResponse.json({
    type: "user-sales",
    rows,
    summary: {
      users: rows.length,
      invoices: rows.reduce((sum, row) => sum + row.invoices, 0),
      netSales: round2(rows.reduce((sum, row) => sum + row.netSales, 0)),
      creditNotes: rows.reduce((sum, row) => sum + row.creditNotes, 0),
      creditNoteValue: round2(
        rows.reduce((sum, row) => sum + row.creditNoteValue, 0),
      ),
      finalNetSales: round2(
        rows.reduce((sum, row) => sum + row.finalNetSales, 0),
      ),
      receivedAmount: round2(
        rows.reduce((sum, row) => sum + row.receivedAmount, 0),
      ),
      creditAmount: round2(
        rows.reduce((sum, row) => sum + row.creditAmount, 0),
      ),
    },
  });
}

async function branchComparisonReport(
  businessId: number,
  from: Date | undefined,
  to: Date | undefined,
) {
  const billRange = dateRange(from, to);
  const returnRange = dateRange(from, to);

  const branches = await prisma.branch.findMany({
    where: {
      businessId,
      isActive: true,
    },

    select: {
      id: true,
      code: true,
      name: true,
    },

    orderBy: {
      name: "asc",
    },
  });

  const rows = await Promise.all(
    branches.map(async (branch: any) => {
      const [sales, returns, stock] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            branchId: branch.id,
            isCancelled: false,
            ...(billRange ? { billDateTime: billRange } : {}),
          },

          _count: {
            id: true,
          },

          _sum: {
            taxableAmount: true,
            totalCgst: true,
            totalSgst: true,
            totalIgst: true,
            netAmount: true,
            receivedAmount: true,
            dueAmount: true,
          },
        }),

        prisma.saleReturn.aggregate({
          where: {
            branchId: branch.id,
            ...(returnRange ? { returnDate: returnRange } : {}),
          },

          _count: {
            id: true,
          },

          _sum: {
            netAmount: true,
          },
        }),

        prisma.productBatch.findMany({
          where: {
            branchId: branch.id,
            currentQty: {
              gt: 0,
            },
          },

          select: {
            currentQty: true,
            costPrice: true,
          },
        }),
      ]);

      const gst =
        n(sales._sum.totalCgst) +
        n(sales._sum.totalSgst) +
        n(sales._sum.totalIgst);

      const stockQty = stock.reduce(
        (sum: number, batch: any) => sum + Number(batch.currentQty || 0),
        0,
      );

      const stockCostValue = round2(
        stock.reduce(
          (sum: number, batch: any) =>
            sum + Number(batch.currentQty || 0) * n(batch.costPrice),
          0,
        ),
      );

      const netSales = n(sales._sum.netAmount);
      const creditNoteValue = n(returns._sum.netAmount);

      return {
        branchId: branch.id,
        code: branch.code,
        branch: branch.name,

        invoices: sales._count.id,
        taxableSales: round2(n(sales._sum.taxableAmount)),
        gst: round2(gst),
        netSales: round2(netSales),

        creditNotes: returns._count.id,
        creditNoteValue: round2(creditNoteValue),

        finalNetSales: round2(netSales - creditNoteValue),

        receivedAmount: round2(n(sales._sum.receivedAmount)),

        creditAmount: round2(n(sales._sum.dueAmount)),

        averageBill:
          sales._count.id > 0
            ? round2((netSales - creditNoteValue) / sales._count.id)
            : 0,

        stockQty,
        stockCostValue,
      };
    }),
  );

  return NextResponse.json({
    type: "branch-comparison",
    rows: rows.sort((a: any, b: any) => b.finalNetSales - a.finalNetSales),
    summary: {
      branches: rows.length,
      invoices: rows.reduce((sum: number, row: any) => sum + row.invoices, 0),
      netSales: round2(rows.reduce((sum: number, row: any) => sum + row.netSales, 0)),
      creditNoteValue: round2(
        rows.reduce((sum: number, row: any) => sum + row.creditNoteValue, 0),
      ),
      finalNetSales: round2(
        rows.reduce((sum: number, row: any) => sum + row.finalNetSales, 0),
      ),
      receivedAmount: round2(
        rows.reduce((sum: number, row: any) => sum + row.receivedAmount, 0),
      ),
      creditAmount: round2(
        rows.reduce((sum: number, row: any) => sum + row.creditAmount, 0),
      ),
      stockQty: rows.reduce((sum: number, row: any) => sum + row.stockQty, 0),
      stockCostValue: round2(
        rows.reduce((sum: number, row: any) => sum + row.stockCostValue, 0),
      ),
    },
  });
}
