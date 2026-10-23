"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Download,
  Printer,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintHeader } from "@/components/print/print-header";

type ViewType =
  | "valuation"
  | "slow"
  | "dead";

type InventoryRow = {
  batchId: number;
  productId: number;

  product: string;
  sku: string;
  brand: string;
  category: string;
  unit: string;
  hsnCode: string;

  batchNo: string;
  expiryDate: string | null;
  expiryStatus: string;
  daysToExpiry: number | null;

  currentQty: number;
  reorderLevel: number;

  costPrice: number;
  sellPrice: number;
  mrp: number;

  costValue: number;
  sellingValue: number;
  mrpValue: number;
  potentialGrossProfit: number;
  potentialMarginPercent: number;

  lastSaleAt: string | null;
  neverSold: boolean;
  stockAgeDays: number;
  movementStatus: string;

  grossSoldQty: number;
  returnedQty: number;
  netSoldQty: number;
};

type ReportData = {
  type: string;
  rows: InventoryRow[];

  summary: {
    totalBatches?: number;
    totalQty?: number;
    costValue?: number;
    sellingValue?: number;
    mrpValue?: number;
    potentialGrossProfit?: number;

    slowBatches?: number;
    slowCostValue?: number;

    deadBatches?: number;
    deadCostValue?: number;

    expiredBatches?: number;
    expiredCostValue?: number;
    expiringSoonBatches?: number;

    neverSoldBatches?: number;

    slowDays?: number;
    deadDays?: number;
  };
};

function money(value: unknown) {
  return `₹${Number(value ?? 0).toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll(
    '"',
    '""',
  )}"`;
}

function date(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(
    "en-IN",
  );
}

function movementLabel(
  row: InventoryRow,
) {
  if (row.neverSold) {
    return `Never sold (${row.stockAgeDays} days in stock)`;
  }

  return `${row.stockAgeDays} days`;
}

export default function InventoryAnalysisPage() {
  const [view, setView] =
    useState<ViewType>("valuation");

  const [search, setSearch] =
    useState("");

  const [slowDays, setSlowDays] =
    useState("60");

  const [deadDays, setDeadDays] =
    useState("120");

  const [data, setData] =
    useState<ReportData>({
      type: "stock-valuation",
      rows: [],
      summary: {},
    });

  const [branding, setBranding] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    fetch("/api/branding", {
      cache: "no-store",
    })
      .then(async (response) =>
        response.ok
          ? response.json()
          : null,
      )
      .then(setBranding);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams({
            view,
            search,
            slowDays,
            deadDays,
          });

        const response = await fetch(
          `/api/reports/inventory-analysis?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        const body =
          await response.json();

        if (!response.ok) {
          throw new Error(
            body.error ||
              "Unable to load inventory report",
          );
        }

        setData(body);
      } catch (err) {
        setData({
          type: "stock-valuation",
          rows: [],
          summary: {},
        });

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load inventory report",
        );
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [
    view,
    search,
    slowDays,
    deadDays,
  ]);

  const title = useMemo(() => {
    if (view === "slow") {
      return "Slow Moving Stock Report";
    }

    if (view === "dead") {
      return "Dead Stock Report";
    }

    return "Stock Valuation Report";
  }, [view]);

  const subtitle = useMemo(() => {
    if (view === "slow") {
      return `No sale activity for ${slowDays}–${Math.max(
        Number(deadDays) - 1,
        Number(slowDays),
      )} days`;
    }

    if (view === "dead") {
      return `No sale activity for ${deadDays}+ days`;
    }

    return "Current on-hand inventory valuation";
  }, [
    view,
    slowDays,
    deadDays,
  ]);

  function exportCsv() {
    if (!data.rows.length) {
      return;
    }

    const columns = [
      "product",
      "sku",
      "brand",
      "category",
      "hsnCode",
      "batchNo",
      "expiryDate",
      "expiryStatus",
      "currentQty",
      "unit",
      "costPrice",
      "costValue",
      "sellPrice",
      "sellingValue",
      "mrp",
      "mrpValue",
      "potentialGrossProfit",
      "potentialMarginPercent",
      "lastSaleAt",
      "stockAgeDays",
      "movementStatus",
      "netSoldQty",
    ] as const;

    const csv = [
      columns.map(csvCell).join(","),

      ...data.rows.map((row) =>
        columns
          .map((column) =>
            csvCell(
              column === "expiryDate"
                ? date(row.expiryDate)
                : column === "lastSaleAt"
                  ? date(row.lastSaleAt)
                  : row[column],
            ),
          )
          .join(","),
      ),
    ].join("\r\n");

    const blob = new Blob(
      ["\uFEFF", csv],
      {
        type:
          "text/csv;charset=utf-8",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      `inventory-${view}.csv`;

    anchor.click();

    URL.revokeObjectURL(url);
  }

  const summary =
    data.summary || {};

  return (
    <div className="space-y-6">
      <div className="print-only">
        {branding && (
          <PrintHeader
            {...branding}
            title={title}
            subtitle={subtitle}
          />
        )}
      </div>

      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-no-print
      >
        <div>
          <h2 className="text-xl font-semibold">
            Inventory Analysis
          </h2>

          <p className="text-sm text-muted-foreground">
            Stock valuation, slow-moving
            inventory and dead-stock
            analysis for the current
            branch.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={
              !data.rows.length
            }
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>

          <Button
            onClick={() =>
              window.print()
            }
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card data-no-print>
        <CardContent className="flex flex-wrap gap-2 pt-5">
          <Button
            variant={
              view === "valuation"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setView("valuation")
            }
          >
            Stock Valuation
          </Button>

          <Button
            variant={
              view === "slow"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setView("slow")
            }
          >
            Slow Moving
          </Button>

          <Button
            variant={
              view === "dead"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setView("dead")
            }
          >
            Dead Stock
          </Button>
        </CardContent>
      </Card>

      <Card data-no-print>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-3">
          <div>
            <Label>
              Search
            </Label>

            <Input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Product, SKU, brand, category or batch"
            />
          </div>

          <div>
            <Label>
              Slow Moving After
              (Days)
            </Label>

            <Input
              type="number"
              min="1"
              max="3650"
              value={slowDays}
              onChange={(event) =>
                setSlowDays(
                  event.target.value,
                )
              }
            />
          </div>

          <div>
            <Label>
              Dead Stock After
              (Days)
            </Label>

            <Input
              type="number"
              min="2"
              max="3650"
              value={deadDays}
              onChange={(event) =>
                setDeadDays(
                  event.target.value,
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Stock Cost Value"
          value={money(
            summary.costValue,
          )}
        />

        <Summary
          label="Potential Selling Value"
          value={money(
            summary.sellingValue,
          )}
        />

        <Summary
          label="Slow Stock Value"
          value={money(
            summary.slowCostValue,
          )}
        />

        <Summary
          label="Dead Stock Value"
          value={money(
            summary.deadCostValue,
          )}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="On-hand Qty"
          value={String(
            summary.totalQty ?? 0,
          )}
        />

        <Summary
          label="Slow Batches"
          value={String(
            summary.slowBatches ?? 0,
          )}
        />

        <Summary
          label="Dead Batches"
          value={String(
            summary.deadBatches ?? 0,
          )}
        />

        <Summary
          label="Never Sold Batches"
          value={String(
            summary.neverSoldBatches ??
              0,
          )}
        />
      </div>

      {(summary.expiredBatches ??
        0) > 0 && (
        <div className="rounded-md border p-4 text-sm">
          <strong>
            Expired inventory:
          </strong>{" "}
          {summary.expiredBatches} batch(es)
          with cost value{" "}
          {money(
            summary.expiredCostValue,
          )}
          .
        </div>
      )}

      <Card className="print-page">
        <CardHeader>
          <CardTitle>
            {title}
          </CardTitle>

          <p className="text-sm text-muted-foreground">
            {subtitle}
          </p>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div
              className="flex items-center gap-2"
              data-no-print
            >
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <InventoryTable
              rows={data.rows}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">
          {label}
        </p>

        <p className="mt-1 text-xl font-semibold">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function InventoryTable({
  rows,
}: {
  rows: InventoryRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">
              Product
            </th>
            <th>SKU</th>
            <th>Category</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th className="text-right">
              Qty
            </th>
            <th>Unit</th>
            <th className="text-right">
              Cost
            </th>
            <th className="text-right">
              Cost Value
            </th>
            <th className="text-right">
              Sell Price
            </th>
            <th className="text-right">
              Selling Value
            </th>
            <th>Last Sale</th>
            <th className="text-right">
              Age
            </th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(
            (
              row: InventoryRow,
            ) => (
              <tr
                className="border-b"
                key={row.batchId}
              >
                <td className="p-2 font-medium">
                  {row.product}

                  {row.brand && (
                    <div className="text-xs text-muted-foreground">
                      {row.brand}
                    </div>
                  )}
                </td>

                <td>
                  {row.sku || "—"}
                </td>

                <td>
                  {row.category}
                </td>

                <td>
                  {row.batchNo}
                </td>

                <td>
                  {date(
                    row.expiryDate,
                  )}

                  {row.expiryStatus ===
                    "EXPIRED" && (
                    <div className="text-xs font-medium">
                      Expired
                    </div>
                  )}

                  {row.expiryStatus ===
                    "EXPIRING_SOON" && (
                    <div className="text-xs">
                      {row.daysToExpiry} days
                    </div>
                  )}
                </td>

                <td className="text-right">
                  {row.currentQty}
                </td>

                <td>
                  {row.unit}
                </td>

                <td className="text-right">
                  {money(
                    row.costPrice,
                  )}
                </td>

                <td className="text-right font-medium">
                  {money(
                    row.costValue,
                  )}
                </td>

                <td className="text-right">
                  {money(
                    row.sellPrice,
                  )}
                </td>

                <td className="text-right">
                  {money(
                    row.sellingValue,
                  )}
                </td>

                <td>
                  {date(
                    row.lastSaleAt,
                  )}

                  {row.neverSold && (
                    <div className="text-xs text-muted-foreground">
                      Never sold
                    </div>
                  )}
                </td>

                <td className="text-right">
                  {movementLabel(
                    row,
                  )}
                </td>

                <td>
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {
                      row.movementStatus
                    }
                  </span>
                </td>
              </tr>
            ),
          )}

          {!rows.length && (
            <tr>
              <td
                colSpan={14}
                className="py-10 text-center text-muted-foreground"
              >
                No matching stock found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
