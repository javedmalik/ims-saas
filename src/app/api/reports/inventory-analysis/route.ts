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

function wholeNumber(
  value: string | null,
  fallback: number,
  min = 1,
  max = 3650,
) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(later: Date, earlier: Date) {
  const ms =
    startOfDay(later).getTime() -
    startOfDay(earlier).getTime();

  return Math.max(
    0,
    Math.floor(ms / 86_400_000),
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!can(session.user.role, "VIEW_REPORTS")) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const search =
    req.nextUrl.searchParams.get("search")?.trim() || "";

  const view =
    req.nextUrl.searchParams.get("view") || "valuation";

  const slowDays = wholeNumber(
    req.nextUrl.searchParams.get("slowDays"),
    60,
  );

  const deadDays = wholeNumber(
    req.nextUrl.searchParams.get("deadDays"),
    120,
  );

  if (deadDays <= slowDays) {
    return NextResponse.json(
      {
        error:
          "Dead-stock threshold must be greater than the slow-moving threshold",
      },
      { status: 400 },
    );
  }

  const today = new Date();

  const batches = await prisma.productBatch.findMany({
    where: {
      branchId: session.user.branchId,
      currentQty: {
        gt: 0,
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
              {
                product: {
                  category: {
                    contains: search,
                  },
                },
              },
              {
                product: {
                  brand: {
                    contains: search,
                  },
                },
              },
            ],
          }
        : {}),
    },

    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          brand: true,
          category: true,
          unit: true,
          hsnCode: true,
          reorderLevel: true,
        },
      },
    },

    orderBy: [
      {
        product: {
          name: "asc",
        },
      },
      {
        expiryDate: "asc",
      },
    ],
  });

  const batchIds = batches.map((batch: any) => batch.id);

  /*
   * We use non-cancelled sale items to determine the most recent
   * selling activity for each batch. This avoids treating cancelled
   * invoices as demand activity.
   */
  const saleItems =
    batchIds.length > 0
      ? await prisma.saleItem.findMany({
          where: {
            batchId: {
              in: batchIds,
            },

            sale: {
              branchId: session.user.branchId,
              isCancelled: false,
            },
          },

          select: {
            batchId: true,
            qty: true,

            sale: {
              select: {
                billDateTime: true,
              },
            },

            returnItems: {
              select: {
                qty: true,
              },
            },
          },
        })
      : [];

  const movementMap = new Map<
    number,
    {
      lastSaleAt: Date | null;
      grossSoldQty: number;
      returnedQty: number;
      netSoldQty: number;
    }
  >();

  for (const item of saleItems as any[]) {
    const existing =
      movementMap.get(item.batchId) || {
        lastSaleAt: null,
        grossSoldQty: 0,
        returnedQty: 0,
        netSoldQty: 0,
      };

    const saleDate = new Date(item.sale.billDateTime);

    if (
      !existing.lastSaleAt ||
      saleDate > existing.lastSaleAt
    ) {
      existing.lastSaleAt = saleDate;
    }

    const returnedQty = (item.returnItems as any[]).reduce(
      (sum: number, row: any) => sum + Number(row.qty || 0),
      0,
    );

    existing.grossSoldQty += Number(item.qty || 0);
    existing.returnedQty += returnedQty;
    existing.netSoldQty += Math.max(
      0,
      Number(item.qty || 0) - returnedQty,
    );

    movementMap.set(item.batchId, existing);
  }

  const rows = batches.map((batch: any) => {
    const movement =
      movementMap.get(batch.id) || {
        lastSaleAt: null,
        grossSoldQty: 0,
        returnedQty: 0,
        netSoldQty: 0,
      };

    /*
     * Never-sold stock is aged from the date the batch entered the system.
     * This prevents a brand-new batch from being labelled dead immediately.
     */
    const agingBase =
      movement.lastSaleAt || batch.createdAt;

    const daysSinceMovement =
      daysBetween(today, new Date(agingBase));

    const movementStatus =
      daysSinceMovement >= deadDays
        ? "DEAD"
        : daysSinceMovement >= slowDays
          ? "SLOW"
          : "ACTIVE";

    const currentQty = Number(batch.currentQty);
    const costPrice = n(batch.costPrice);
    const sellPrice = n(batch.sellPrice);
    const mrp = n(batch.mrp);

    const costValue = round2(
      currentQty * costPrice,
    );

    const sellingValue = round2(
      currentQty * sellPrice,
    );

    const mrpValue = round2(
      currentQty * mrp,
    );

    const potentialGrossProfit = round2(
      sellingValue - costValue,
    );

    const potentialMarginPercent =
      sellingValue > 0
        ? round2(
            (potentialGrossProfit / sellingValue) * 100,
          )
        : 0;

    const expiryDate =
      batch.expiryDate
        ? new Date(batch.expiryDate)
        : null;

    const daysToExpiry =
      expiryDate
        ? Math.ceil(
            (startOfDay(expiryDate).getTime() -
              startOfDay(today).getTime()) /
              86_400_000,
          )
        : null;

    const expiryStatus =
      daysToExpiry === null
        ? "NO_EXPIRY"
        : daysToExpiry < 0
          ? "EXPIRED"
          : daysToExpiry <= 90
            ? "EXPIRING_SOON"
            : "OK";

    return {
      batchId: batch.id,
      productId: batch.product.id,

      product: batch.product.name,
      sku: batch.product.sku || "",
      brand: batch.product.brand || "",
      category:
        batch.product.category || "Uncategorised",
      unit: batch.product.unit,
      hsnCode: batch.product.hsnCode || "",

      batchNo: batch.batchNo,
      expiryDate,
      expiryStatus,
      daysToExpiry,

      currentQty,
      reorderLevel: batch.product.reorderLevel,

      costPrice,
      sellPrice,
      mrp,

      costValue,
      sellingValue,
      mrpValue,
      potentialGrossProfit,
      potentialMarginPercent,

      lastSaleAt: movement.lastSaleAt,
      neverSold: !movement.lastSaleAt,
      stockAgeDays: daysSinceMovement,
      movementStatus,

      grossSoldQty: movement.grossSoldQty,
      returnedQty: movement.returnedQty,
      netSoldQty: movement.netSoldQty,
    };
  });

  const filteredRows =
    view === "slow"
      ? rows.filter(
          (row: any) => row.movementStatus === "SLOW",
        )
      : view === "dead"
        ? rows.filter(
            (row: any) => row.movementStatus === "DEAD",
          )
        : rows;

  const summary = {
    totalBatches: rows.length,

    totalQty: rows.reduce(
      (sum: number, row: any) => sum + row.currentQty,
      0,
    ),

    costValue: round2(
      rows.reduce(
        (sum: number, row: any) => sum + row.costValue,
        0,
      ),
    ),

    sellingValue: round2(
      rows.reduce(
        (sum: number, row: any) => sum + row.sellingValue,
        0,
      ),
    ),

    mrpValue: round2(
      rows.reduce(
        (sum: number, row: any) => sum + row.mrpValue,
        0,
      ),
    ),

    potentialGrossProfit: round2(
      rows.reduce(
        (sum: number, row: any) =>
          sum + row.potentialGrossProfit,
        0,
      ),
    ),

    slowBatches: rows.filter(
      (row: any) => row.movementStatus === "SLOW",
    ).length,

    slowCostValue: round2(
      rows
        .filter(
          (row: any) => row.movementStatus === "SLOW",
        )
        .reduce(
          (sum: number, row: any) => sum + row.costValue,
          0,
        ),
    ),

    deadBatches: rows.filter(
      (row: any) => row.movementStatus === "DEAD",
    ).length,

    deadCostValue: round2(
      rows
        .filter(
          (row: any) => row.movementStatus === "DEAD",
        )
        .reduce(
          (sum: number, row: any) => sum + row.costValue,
          0,
        ),
    ),

    expiredBatches: rows.filter(
      (row: any) => row.expiryStatus === "EXPIRED",
    ).length,

    expiredCostValue: round2(
      rows
        .filter(
          (row: any) => row.expiryStatus === "EXPIRED",
        )
        .reduce(
          (sum: number, row: any) => sum + row.costValue,
          0,
        ),
    ),

    expiringSoonBatches: rows.filter(
      (row: any) => row.expiryStatus === "EXPIRING_SOON",
    ).length,

    neverSoldBatches: rows.filter(
      (row: any) => row.neverSold,
    ).length,

    slowDays,
    deadDays,
  };

  return NextResponse.json({
    type:
      view === "slow"
        ? "slow-stock"
        : view === "dead"
          ? "dead-stock"
          : "stock-valuation",

    rows: filteredRows,
    summary,
  });
}
