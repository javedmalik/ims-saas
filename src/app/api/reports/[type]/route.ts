import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { can } from "@/lib/rbac";

type Context = {
  params: {
    type: string;
  };
};

function num(value: unknown) {
  return Number(value ?? 0);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getStartDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getEndDate(value: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T23:59:59.999`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export async function GET(req: NextRequest, { params }: Context) {
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

  const type = params.type;

  const search = req.nextUrl.searchParams.get("search")?.trim() || "";

  const from = getStartDate(req.nextUrl.searchParams.get("from"));

  const to = getEndDate(req.nextUrl.searchParams.get("to"));

  const status = req.nextUrl.searchParams.get("status") || "ALL";

  const paymentMode = req.nextUrl.searchParams.get("paymentMode") || "ALL";

  const sortBy = req.nextUrl.searchParams.get("sortBy") || "date";

  const sortOrder =
    req.nextUrl.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  /*
  =========================================================
  SALES REPORT
  =========================================================
  */

  if (type === "sales") {
    const orderBy =
      sortBy === "amount"
        ? {
            netAmount: sortOrder,
          }
        : sortBy === "bill"
          ? {
              billNo: sortOrder,
            }
          : {
              billDateTime: sortOrder,
            };

    const rows = await prisma.sale.findMany({
      where: {
        branchId: session.user.branchId,

        ...(from || to
          ? {
              billDateTime: {
                ...(from
                  ? {
                      gte: from,
                    }
                  : {}),

                ...(to
                  ? {
                      lte: to,
                    }
                  : {}),
              },
            }
          : {}),

        ...(status === "POSTED"
          ? {
              isCancelled: false,
            }
          : status === "CANCELLED"
            ? {
                isCancelled: true,
              }
            : {}),

        ...(paymentMode !== "ALL"
          ? {
              payments: {
                some: {
                  mode: paymentMode,
                },
              },
            }
          : {}),

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

                {
                  customer: {
                    mobile: {
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

        _count: {
          select: {
            items: true,
          },
        },
      },

      orderBy: orderBy as any,

      take: 5000,
    });

    const data = rows.map((row) => ({
      id: row.id.toString(),

      date: row.billDateTime,

      number: row.billNo,

      party: row.customer?.name || "Walk-in",

      mobile: row.customer?.mobile || "",

      items: row._count.items,

      paymentMode: row.paymentMode,

      gross: num(row.grossAmount),

      discount: num(row.totalDiscount),

      tax: num(row.totalCgst) + num(row.totalSgst) + num(row.totalIgst),

      net: num(row.netAmount),

      received: num(row.receivedAmount),

      due: num(row.dueAmount),

      status: row.isCancelled ? "CANCELLED" : "POSTED",
    }));

    const active = data.filter((row) => row.status !== "CANCELLED");

    return NextResponse.json({
      type: "sales",

      rows: data,

      summary: {
        count: active.length,

        gross: round(active.reduce((total, row) => total + row.gross, 0)),

        discount: round(active.reduce((total, row) => total + row.discount, 0)),

        tax: round(active.reduce((total, row) => total + row.tax, 0)),

        net: round(active.reduce((total, row) => total + row.net, 0)),

        received: round(active.reduce((total, row) => total + row.received, 0)),

        due: round(active.reduce((total, row) => total + row.due, 0)),
      },
    });
  }

  /*
  =========================================================
  PURCHASE REPORT
  =========================================================
  */

  if (type === "purchases") {
    const orderBy =
      sortBy === "amount"
        ? {
            netAmount: sortOrder,
          }
        : sortBy === "invoice"
          ? {
              invoiceNo: sortOrder,
            }
          : {
              invoiceDate: sortOrder,
            };

    const rows = await prisma.purchase.findMany({
      where: {
        branchId: session.user.branchId,

        ...(from || to
          ? {
              invoiceDate: {
                ...(from
                  ? {
                      gte: from,
                    }
                  : {}),

                ...(to
                  ? {
                      lte: to,
                    }
                  : {}),
              },
            }
          : {}),

        ...(status === "POSTED"
          ? {
              isCancelled: false,
            }
          : status === "CANCELLED"
            ? {
                isCancelled: true,
              }
            : {}),

        ...(paymentMode !== "ALL"
          ? {
              payments: {
                some: {
                  mode: paymentMode,
                },
              },
            }
          : {}),

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
            name: true,
          },
        },

        _count: {
          select: {
            items: true,
          },
        },
      },

      orderBy: orderBy as any,

      take: 5000,
    });

    const data = rows.map((row) => ({
      id: row.id.toString(),

      date: row.invoiceDate,

      number: row.grnNo || row.invoiceNo,

      supplierInvoice: row.invoiceNo,

      party: row.supplier.name,

      items: row._count.items,

      paymentMode: row.paymentMode,

      gross: num(row.grossAmount),

      discount: num(row.totalDiscount),

      tax: num(row.totalTax),

      net: num(row.netAmount),

      paid: num(row.paidAmount),

      due: num(row.dueAmount),

      status: row.isCancelled ? "CANCELLED" : "POSTED",
    }));

    const active = data.filter((row) => row.status !== "CANCELLED");

    return NextResponse.json({
      type: "purchases",

      rows: data,

      summary: {
        count: active.length,

        gross: round(active.reduce((total, row) => total + row.gross, 0)),

        discount: round(active.reduce((total, row) => total + row.discount, 0)),

        tax: round(active.reduce((total, row) => total + row.tax, 0)),

        net: round(active.reduce((total, row) => total + row.net, 0)),

        paid: round(active.reduce((total, row) => total + row.paid, 0)),

        due: round(active.reduce((total, row) => total + row.due, 0)),
      },
    });
  }

  /*
  =========================================================
  STOCK REPORT
  =========================================================
  */

  if (type === "stock") {
    const today = new Date();

    const expiryLimit = new Date();

    expiryLimit.setDate(expiryLimit.getDate() + 90);

    const rows = await prisma.productBatch.findMany({
      where: {
        branchId: session.user.branchId,

        ...(search
          ? {
              OR: [
                {
                  batchNo: {
                    contains: search,
                  },
                },

                {
                  product: {
                    name: {
                      contains: search,
                    },
                  },
                },

                {
                  product: {
                    sku: {
                      contains: search,
                    },
                  },
                },

                {
                  product: {
                    category: {
                      contains: search,
                    },
                  },
                },
              ],
            }
          : {}),
      },

      include: {
        product: true,
      },

      take: 10000,
    });

    let data = rows.map((row) => ({
      id: row.id,

      product: row.product.name,

      sku: row.product.sku || "",

      category: row.product.category || "",

      batchNo: row.batchNo,

      expiryDate: row.expiryDate,

      currentQty: row.currentQty,

      reorderLevel: row.product.reorderLevel,

      costPrice: num(row.costPrice),

      sellPrice: num(row.sellPrice),

      value: round(num(row.costPrice) * row.currentQty),

      status:
        row.currentQty <= 0
          ? "OUT"
          : row.currentQty <= row.product.reorderLevel
            ? "LOW"
            : row.expiryDate &&
                row.expiryDate >= today &&
                row.expiryDate <= expiryLimit
              ? "EXPIRING"
              : "OK",
    }));

    if (status !== "ALL") {
      data = data.filter((row) => row.status === status);
    }

    data.sort((a, b) => {
      let result = 0;

      if (sortBy === "qty") {
        result = a.currentQty - b.currentQty;
      } else if (sortBy === "value") {
        result = a.value - b.value;
      } else {
        result = a.product.localeCompare(b.product);
      }

      return sortOrder === "asc" ? result : -result;
    });

    return NextResponse.json({
      type: "stock",

      rows: data,

      summary: {
        batches: data.length,

        quantity: data.reduce((total, row) => total + row.currentQty, 0),

        value: round(data.reduce((total, row) => total + row.value, 0)),

        low: data.filter((row) => row.status === "LOW").length,

        out: data.filter((row) => row.status === "OUT").length,

        expiring: data.filter((row) => row.status === "EXPIRING").length,
      },
    });
  }

  /*
  =========================================================
  GST SUMMARY REPORT
  =========================================================
  */

  if (type === "gst") {
    const branch = await prisma.branch.findUnique({
      where: {
        id: session.user.branchId,
      },
    });

    if (!branch) {
      return NextResponse.json(
        {
          error: "Branch not found",
        },
        {
          status: 404,
        },
      );
    }

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId: session.user.branchId,

          isCancelled: false,

          ...(from || to
            ? {
                billDateTime: {
                  ...(from
                    ? {
                        gte: from,
                      }
                    : {}),

                  ...(to
                    ? {
                        lte: to,
                      }
                    : {}),
                },
              }
            : {}),
        },
      },

      include: {
        sale: {
          select: {
            totalIgst: true,
          },
        },
      },
    });

    const purchaseItems = await prisma.purchaseItem.findMany({
      where: {
        purchase: {
          branchId: session.user.branchId,

          isCancelled: false,

          ...(from || to
            ? {
                invoiceDate: {
                  ...(from
                    ? {
                        gte: from,
                      }
                    : {}),

                  ...(to
                    ? {
                        lte: to,
                      }
                    : {}),
                },
              }
            : {}),
        },
      },

      include: {
        purchase: {
          include: {
            supplier: {
              select: {
                state: true,
                stateCode: true,
              },
            },
          },
        },
      },
    });

    type GstRow = {
      taxRate: number;

      outputTaxable: number;

      outputCgst: number;

      outputSgst: number;

      outputIgst: number;

      inputTaxable: number;

      inputCgst: number;

      inputSgst: number;

      inputIgst: number;
    };

    const map = new Map<number, GstRow>();

    function getRow(taxRate: number) {
      if (!map.has(taxRate)) {
        map.set(taxRate, {
          taxRate,

          outputTaxable: 0,

          outputCgst: 0,

          outputSgst: 0,

          outputIgst: 0,

          inputTaxable: 0,

          inputCgst: 0,

          inputSgst: 0,

          inputIgst: 0,
        });
      }

      return map.get(taxRate)!;
    }

    for (const item of saleItems) {
      const rate = num(item.taxPercent);

      const tax = num(item.taxAmount);

      const taxable = num(item.lineTotal) - tax;

      const row = getRow(rate);

      row.outputTaxable += taxable;

      const interstate = num(item.sale.totalIgst) > 0;

      if (interstate) {
        row.outputIgst += tax;
      } else {
        row.outputCgst += tax / 2;

        row.outputSgst += tax / 2;
      }
    }

    for (const item of purchaseItems) {
      const rate = num(item.taxPercent);

      const tax = num(item.taxAmount);

      const taxable = num(item.lineTotal) - tax;

      const row = getRow(rate);

      row.inputTaxable += taxable;

      const supplierStateCode = item.purchase.supplier.stateCode?.trim();
      const branchStateCode = branch.stateCode?.trim();
      const supplierState = normalize(item.purchase.supplier.state);
      const branchState = normalize(branch.state);
      const interstate = supplierStateCode && branchStateCode
        ? supplierStateCode !== branchStateCode
        : !!supplierState && !!branchState && supplierState !== branchState;

      if (interstate) {
        row.inputIgst += tax;
      } else {
        row.inputCgst += tax / 2;

        row.inputSgst += tax / 2;
      }
    }

    const rows = Array.from(map.values())
      .map((row) => {
        const outputTax = row.outputCgst + row.outputSgst + row.outputIgst;

        const inputTax = row.inputCgst + row.inputSgst + row.inputIgst;

        return {
          taxRate: row.taxRate,

          outputTaxable: round(row.outputTaxable),

          outputCgst: round(row.outputCgst),

          outputSgst: round(row.outputSgst),

          outputIgst: round(row.outputIgst),

          outputTax: round(outputTax),

          inputTaxable: round(row.inputTaxable),

          inputCgst: round(row.inputCgst),

          inputSgst: round(row.inputSgst),

          inputIgst: round(row.inputIgst),

          inputTax: round(inputTax),

          netTax: round(outputTax - inputTax),
        };
      })
      .sort((a, b) => a.taxRate - b.taxRate);

    return NextResponse.json({
      type: "gst",

      rows,

      summary: {
        outputTaxable: round(
          rows.reduce((total, row) => total + row.outputTaxable, 0),
        ),

        outputTax: round(rows.reduce((total, row) => total + row.outputTax, 0)),

        inputTaxable: round(
          rows.reduce((total, row) => total + row.inputTaxable, 0),
        ),

        inputTax: round(rows.reduce((total, row) => total + row.inputTax, 0)),

        netTax: round(rows.reduce((total, row) => total + row.netTax, 0)),
      },
    });
  }

  /*
  =========================================================
  CUSTOMER OUTSTANDING REPORT
  =========================================================
  */

  if (type === "customer-outstanding") {
    const customers = await prisma.customer.findMany({
      where: {
        businessId: session.user.businessId,

        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                  },
                },

                {
                  mobile: {
                    contains: search,
                  },
                },

                {
                  taxId: {
                    contains: search,
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: {
        name: "asc",
      },
    });

    let rows = customers.map((customer) => ({
      id: customer.id,

      name: customer.name,

      mobile: customer.mobile || "",

      gstin: customer.taxId || "",

      state: customer.state || "",

      dueAmount: num(customer.dueAmount),

      status: num(customer.dueAmount) > 0 ? "DUE" : "CLEAR",
    }));

    if (status === "DUE") {
      rows = rows.filter((row) => row.dueAmount > 0);
    }

    if (status === "CLEAR") {
      rows = rows.filter((row) => row.dueAmount <= 0);
    }

    rows.sort((a, b) => {
      let result = 0;

      if (sortBy === "amount") {
        result = a.dueAmount - b.dueAmount;
      } else {
        result = a.name.localeCompare(b.name);
      }

      return sortOrder === "asc" ? result : -result;
    });

    return NextResponse.json({
      type: "customer-outstanding",

      rows,

      summary: {
        customers: rows.length,

        dueCustomers: rows.filter((row) => row.dueAmount > 0).length,

        totalDue: round(rows.reduce((total, row) => total + row.dueAmount, 0)),
      },
    });
  }

  /*
  =========================================================
  CUSTOMER LEDGER REPORT
  =========================================================
  */

  if (type === "customer-ledger") {
    const customerId = Number(req.nextUrl.searchParams.get("customerId") || 0);

    if (!customerId) {
      return NextResponse.json({
        type: "customer-ledger",

        rows: [],

        summary: {
          openingBalance: 0,

          totalDebit: 0,

          totalCredit: 0,

          closingBalance: 0,
        },
      });
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,

        businessId: session.user.businessId,
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Customer not found",
        },
        {
          status: 404,
        },
      );
    }

    let openingBalance = 0;

    if (from) {
      const previous = await prisma.customerLedgerEntry.findMany({
        where: {
          branchId: session.user.branchId,

          customerId,

          txnDate: {
            lt: from,
          },
        },

        select: {
          debit: true,
          credit: true,
        },
      });

      openingBalance = previous.reduce(
        (balance, entry) => balance + num(entry.debit) - num(entry.credit),
        0,
      );
    }

    const ledger = await prisma.customerLedgerEntry.findMany({
      where: {
        branchId: session.user.branchId,

        customerId,

        ...(from || to
          ? {
              txnDate: {
                ...(from
                  ? {
                      gte: from,
                    }
                  : {}),

                ...(to
                  ? {
                      lte: to,
                    }
                  : {}),
              },
            }
          : {}),
      },

      include: {
        sale: {
          select: {
            billNo: true,
          },
        },
      },

      orderBy: {
        txnDate: "asc",
      },
    });

    let running = openingBalance;

    const rows = ledger.map((entry) => {
      running += num(entry.debit) - num(entry.credit);

      return {
        id: entry.id,

        date: entry.txnDate,

        reference: entry.sale?.billNo || "-",

        note: entry.note || "",

        debit: num(entry.debit),

        credit: num(entry.credit),

        balance: round(running),
      };
    });

    const totalDebit = rows.reduce((total, row) => total + row.debit, 0);

    const totalCredit = rows.reduce((total, row) => total + row.credit, 0);

    return NextResponse.json({
      type: "customer-ledger",

      customer: {
        id: customer.id,

        name: customer.name,

        mobile: customer.mobile,

        gstin: customer.taxId,
      },

      rows,

      summary: {
        openingBalance: round(openingBalance),

        totalDebit: round(totalDebit),

        totalCredit: round(totalCredit),

        closingBalance: round(openingBalance + totalDebit - totalCredit),
      },
    });
  }

  /*
  =========================================================
  EXPIRY / NEAR EXPIRY REPORT
  =========================================================
  */

  if (type === "expiry") {
    const days = Math.max(
      1,
      Math.min(730, Number(req.nextUrl.searchParams.get("days") || 90)),
    );

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const limit = new Date(today);

    limit.setDate(limit.getDate() + days);

    const rows = await prisma.productBatch.findMany({
      where: {
        branchId: session.user.branchId,

        expiryDate: {
          not: null,
        },

        ...(search
          ? {
              OR: [
                {
                  batchNo: {
                    contains: search,
                  },
                },

                {
                  product: {
                    name: {
                      contains: search,
                    },
                  },
                },

                {
                  product: {
                    sku: {
                      contains: search,
                    },
                  },
                },
              ],
            }
          : {}),
      },

      include: {
        product: true,
      },
    });

    let data = rows
      .filter((batch) => {
        if (!batch.expiryDate) {
          return false;
        }

        if (status === "EXPIRED") {
          return batch.expiryDate < today;
        }

        if (status === "EXPIRING") {
          return batch.expiryDate >= today && batch.expiryDate <= limit;
        }

        return batch.expiryDate <= limit;
      })
      .map((batch) => {
        const expiry = batch.expiryDate!;

        const difference = Math.ceil(
          (expiry.getTime() - today.getTime()) / 86400000,
        );

        return {
          id: batch.id,

          product: batch.product.name,

          sku: batch.product.sku || "",

          batchNo: batch.batchNo,

          expiryDate: expiry,

          daysLeft: difference,

          currentQty: batch.currentQty,

          costPrice: num(batch.costPrice),

          stockValue: round(batch.currentQty * num(batch.costPrice)),

          status: difference < 0 ? "EXPIRED" : "EXPIRING",
        };
      });

    data.sort((a, b) => {
      if (sortBy === "qty") {
        return sortOrder === "asc"
          ? a.currentQty - b.currentQty
          : b.currentQty - a.currentQty;
      }

      return sortOrder === "asc"
        ? a.daysLeft - b.daysLeft
        : b.daysLeft - a.daysLeft;
    });

    return NextResponse.json({
      type: "expiry",

      rows: data,

      summary: {
        batches: data.length,

        expired: data.filter((row) => row.status === "EXPIRED").length,

        expiring: data.filter((row) => row.status === "EXPIRING").length,

        quantity: data.reduce((total, row) => total + row.currentQty, 0),

        stockValue: round(
          data.reduce((total, row) => total + row.stockValue, 0),
        ),
      },
    });
  }

  /*
  =========================================================
  SUPPLIER PURCHASE SUMMARY
  =========================================================
  */

  if (type === "supplier-summary") {
    const supplierId = Number(req.nextUrl.searchParams.get("supplierId") || 0);

    const purchases = await prisma.purchase.findMany({
      where: {
        branchId: session.user.branchId,

        isCancelled: false,

        ...(supplierId
          ? {
              supplierId,
            }
          : {}),

        ...(from || to
          ? {
              invoiceDate: {
                ...(from
                  ? {
                      gte: from,
                    }
                  : {}),

                ...(to
                  ? {
                      lte: to,
                    }
                  : {}),
              },
            }
          : {}),

        ...(search
          ? {
              supplier: {
                name: {
                  contains: search,
                },
              },
            }
          : {}),
      },

      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            mobile: true,
            taxId: true,
          },
        },
      },
    });

    type SupplierRow = {
      supplierId: number;

      supplier: string;

      mobile: string;

      gstin: string;

      purchases: number;

      gross: number;

      discount: number;

      tax: number;

      net: number;

      paid: number;

      due: number;
    };

    const supplierMap = new Map<number, SupplierRow>();

    for (const purchase of purchases) {
      let row = supplierMap.get(purchase.supplierId);

      if (!row) {
        row = {
          supplierId: purchase.supplierId,

          supplier: purchase.supplier.name,

          mobile: purchase.supplier.mobile || "",

          gstin: purchase.supplier.taxId || "",

          purchases: 0,

          gross: 0,

          discount: 0,

          tax: 0,

          net: 0,

          paid: 0,

          due: 0,
        };

        supplierMap.set(purchase.supplierId, row);
      }

      row.purchases += 1;

      row.gross += num(purchase.grossAmount);

      row.discount += num(purchase.totalDiscount);

      row.tax += num(purchase.totalTax);

      row.net += num(purchase.netAmount);

      row.paid += num(purchase.paidAmount);

      row.due += num(purchase.dueAmount);
    }

    const rows = Array.from(supplierMap.values()).map((row) => ({
      ...row,

      gross: round(row.gross),

      discount: round(row.discount),

      tax: round(row.tax),

      net: round(row.net),

      paid: round(row.paid),

      due: round(row.due),
    }));

    rows.sort((a, b) => {
      let result = 0;

      if (sortBy === "amount") {
        result = a.net - b.net;
      } else if (sortBy === "due") {
        result = a.due - b.due;
      } else {
        result = a.supplier.localeCompare(b.supplier);
      }

      return sortOrder === "asc" ? result : -result;
    });

    return NextResponse.json({
      type: "supplier-summary",

      rows,

      summary: {
        suppliers: rows.length,

        purchases: rows.reduce((total, row) => total + row.purchases, 0),

        net: round(rows.reduce((total, row) => total + row.net, 0)),

        paid: round(rows.reduce((total, row) => total + row.paid, 0)),

        due: round(rows.reduce((total, row) => total + row.due, 0)),
      },
    });
  }

  return NextResponse.json(
    {
      error: "Unknown report type",
    },
    {
      status: 404,
    },
  );
}
