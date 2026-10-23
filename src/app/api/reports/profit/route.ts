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
  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  const view = req.nextUrl.searchParams.get("view") || "item";

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        branchId: session.user.branchId,
        isCancelled: false,
        ...(from || to
          ? {
              billDateTime: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      ...(search
        ? {
            batch: {
              product: {
                OR: [
                  { name: { contains: search } },
                  { sku: { contains: search } },
                  { category: { contains: search } },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      sale: {
        select: {
          id: true,
          billNo: true,
          billDateTime: true,
        },
      },
      batch: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              category: true,
              unit: true,
            },
          },
        },
      },
      returnItems: {
        select: {
          qty: true,
          taxableAmount: true,
          taxAmount: true,
          lineTotal: true,
        },
      },
    },
    orderBy: {
      sale: {
        billDateTime: "desc",
      },
    },
    take: 10000,
  });

  const detailRows = items
    .map((item: any) => {
      const soldTax = n(item.taxAmount);
      const soldTaxable = round2(n(item.lineTotal) - soldTax);

      const returnedQty = item.returnItems.reduce(
        (sum: number, returnItem: any) => sum + returnItem.qty,
        0,
      );

      const returnedTaxable = round2(
        item.returnItems.reduce(
          (sum: number, returnItem: any) => sum + n(returnItem.taxableAmount),
          0,
        ),
      );

      const returnedTax = round2(
        item.returnItems.reduce(
          (sum: number, returnItem: any) => sum + n(returnItem.taxAmount),
          0,
        ),
      );

      const returnedTotal = round2(
        item.returnItems.reduce(
          (sum: number, returnItem: any) => sum + n(returnItem.lineTotal),
          0,
        ),
      );

      const netQty = Math.max(0, item.qty - returnedQty);
      const taxableSales = round2(Math.max(0, soldTaxable - returnedTaxable));
      const tax = round2(Math.max(0, soldTax - returnedTax));
      const netWithTax = round2(Math.max(0, n(item.lineTotal) - returnedTotal));

      const hasCost =
        item.costPriceAtSale !== null && item.costAmount !== null;

      const costPriceAtSale =
        item.costPriceAtSale === null ? null : n(item.costPriceAtSale);

      const cogs =
        hasCost && costPriceAtSale !== null
          ? round2(costPriceAtSale * netQty)
          : null;

      const grossProfit =
        cogs === null ? null : round2(taxableSales - cogs);

      const marginPercent =
        grossProfit === null || taxableSales <= 0
          ? null
          : round2((grossProfit / taxableSales) * 100);

      return {
        id: item.id.toString(),
        saleId: item.sale.id.toString(),
        date: item.sale.billDateTime,
        billNo: item.sale.billNo,
        productId: item.batch.product.id,
        product: item.batch.product.name,
        sku: item.batch.product.sku || "",
        category: item.batch.product.category || "Uncategorised",
        unit: item.batch.product.unit,
        batchNo: item.batch.batchNo,
        soldQty: item.qty,
        returnedQty,
        qty: netQty,
        soldTaxable,
        returnedTaxable,
        taxableSales,
        soldTax,
        returnedTax,
        tax,
        netWithTax,
        costPriceAtSale,
        cogs,
        grossProfit,
        marginPercent,
        costStatus: hasCost ? "EXACT_SNAPSHOT" : "MISSING",
      };
    })
    .filter((row: any) => row.qty > 0 || row.taxableSales > 0 || row.tax > 0);

  const knownRows = detailRows.filter((row: any) => row.cogs !== null);

  const taxableSales = round2(
    detailRows.reduce((sum: number, row: any) => sum + row.taxableSales, 0),
  );

  const tax = round2(
    detailRows.reduce((sum: number, row: any) => sum + row.tax, 0),
  );

  const knownCostTaxable = round2(
    knownRows.reduce((sum: number, row: any) => sum + row.taxableSales, 0),
  );

  const cogs = round2(
    knownRows.reduce((sum: number, row: any) => sum + Number(row.cogs), 0),
  );

  const grossProfit = round2(knownCostTaxable - cogs);
  const grossMarginPercent =
    knownCostTaxable > 0
      ? round2((grossProfit / knownCostTaxable) * 100)
      : 0;

  const missingCostLines = detailRows.filter((row: any) => row.cogs === null).length;
  const missingCostQty = detailRows
    .filter((row: any) => row.cogs === null)
    .reduce((sum: number, row: any) => sum + row.qty, 0);

  const summary = {
    lines: detailRows.length,
    quantity: detailRows.reduce((sum: number, row: any) => sum + row.qty, 0),
    taxableSales,
    tax,
    knownCostTaxable,
    cogs,
    grossProfit,
    grossMarginPercent,
    missingCostLines,
    missingCostQty,
    returnedQty: detailRows.reduce((sum: number, row: any) => sum + row.returnedQty, 0),
    returnedTaxable: round2(
      detailRows.reduce((sum: number, row: any) => sum + row.returnedTaxable, 0),
    ),
    returnedTax: round2(
      detailRows.reduce((sum: number, row: any) => sum + row.returnedTax, 0),
    ),
  };

  if (view === "detail") {
    return NextResponse.json({
      type: "profit-detail",
      rows: detailRows,
      summary,
    });
  }

  type Group = {
    key: string;
    label: string;
    sku: string;
    category: string;
    qty: number;
    returnedQty: number;
    taxableSales: number;
    tax: number;
    cogs: number;
    grossProfit: number;
    missingCostQty: number;
  };

  const groups = new Map<string, Group>();

  for (const row of detailRows) {
    const key = view === "category" ? row.category : String(row.productId);

    const current =
      groups.get(key) ||
      ({
        key,
        label: view === "category" ? row.category : row.product,
        sku: view === "item" ? row.sku : "",
        category: view === "item" ? row.category : "",
        qty: 0,
        returnedQty: 0,
        taxableSales: 0,
        tax: 0,
        cogs: 0,
        grossProfit: 0,
        missingCostQty: 0,
      } satisfies Group);

    current.qty += row.qty;
    current.returnedQty += row.returnedQty;
    current.taxableSales += row.taxableSales;
    current.tax += row.tax;

    if (row.cogs === null) {
      current.missingCostQty += row.qty;
    } else {
      current.cogs += row.cogs;
      current.grossProfit += row.grossProfit || 0;
    }

    groups.set(key, current);
  }

  const rows = Array.from(groups.values())
    .map((row) => ({
      ...row,
      taxableSales: round2(row.taxableSales),
      tax: round2(row.tax),
      cogs: round2(row.cogs),
      grossProfit: round2(row.grossProfit),
      marginPercent:
        row.taxableSales > 0
          ? round2((row.grossProfit / row.taxableSales) * 100)
          : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  return NextResponse.json({
    type: view === "category" ? "profit-category" : "profit-item",
    rows,
    summary,
  });
}
