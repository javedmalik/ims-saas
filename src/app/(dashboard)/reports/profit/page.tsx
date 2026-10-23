"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintHeader } from "@/components/print/print-header";

type ViewType = "item" | "category" | "detail";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function ProfitReportsPage() {
  const [view, setView] = useState<ViewType>("item");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState("");
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(setBranding);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ from, to, view, search });
        const response = await fetch(`/api/reports/profit?${params.toString()}`, {
          cache: "no-store",
        });
        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error || "Unable to load profit report");
        }

        setData(body);
      } catch (err) {
        setData({ rows: [], summary: {} });
        setError(
          err instanceof Error ? err.message : "Unable to load profit report",
        );
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [from, to, view, search]);

  const title = useMemo(() => {
    if (view === "category") return "Category-wise Profit Report";
    if (view === "detail") return "Sale Item Profit Detail";
    return "Item-wise Profit Report";
  }, [view]);

  function exportCsv() {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) return;

    const keys = Object.keys(rows[0]).filter(
      (key) => key !== "id" && key !== "saleId",
    );

    const csv = [
      keys.map(csvCell).join(","),
      ...rows.map((row: any) =>
        keys.map((key) => csvCell(row[key])).join(","),
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-${view}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = data.summary || {};

  return (
    <div className="space-y-6">
      <div className="print-only">
        {branding && (
          <PrintHeader
            {...branding}
            title={title}
            subtitle={`${from} to ${to}`}
          />
        )}
      </div>

      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-no-print
      >
        <div>
          <h2 className="text-xl font-semibold">Profit Reports</h2>
          <p className="text-sm text-muted-foreground">
            Gross profit = taxable sales excluding GST − frozen cost of goods sold.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!data.rows?.length}
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>

          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card data-no-print>
        <CardContent className="flex flex-wrap gap-2 pt-5">
          <Button
            variant={view === "item" ? "default" : "outline"}
            onClick={() => setView("item")}
          >
            Item Profit
          </Button>

          <Button
            variant={view === "category" ? "default" : "outline"}
            onClick={() => setView("category")}
          >
            Category Profit
          </Button>

          <Button
            variant={view === "detail" ? "default" : "outline"}
            onClick={() => setView("detail")}
          >
            Sale Detail
          </Button>
        </CardContent>
      </Card>

      <Card data-no-print>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-3">
          <div>
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div>
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Product, SKU or category"
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
        <Summary label="Taxable Sales" value={money(summary.taxableSales)} />
        <Summary label="COGS" value={money(summary.cogs)} />
        <Summary label="Gross Profit" value={money(summary.grossProfit)} />
        <Summary
          label="Gross Margin"
          value={`${Number(summary.grossMarginPercent ?? 0).toFixed(2)}%`}
        />
      </div>

      {(summary.missingCostLines > 0 || summary.missingCostQty > 0) && (
        <div className="rounded-md border p-4 text-sm">
          <strong>Historical cost warning:</strong>{" "}
          {summary.missingCostLines} sale line(s), covering{" "}
          {summary.missingCostQty} unit(s), do not have a frozen cost snapshot.
          Those rows are excluded from COGS and Gross Profit.
        </div>
      )}

      <Card className="print-page">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2" data-no-print>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : view === "detail" ? (
            <DetailTable rows={data.rows || []} />
          ) : (
            <GroupedTable view={view} rows={data.rows || []} />
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
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function GroupedTable({
  view,
  rows,
}: {
  view: "item" | "category";
  rows: any[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">
              {view === "category" ? "Category" : "Product"}
            </th>
            {view === "item" && (
              <>
                <th>SKU</th>
                <th>Category</th>
              </>
            )}
            <th className="text-right">Qty</th>
            <th className="text-right">Taxable Sales</th>
            <th className="text-right">GST</th>
            <th className="text-right">COGS</th>
            <th className="text-right">Gross Profit</th>
            <th className="text-right">Margin</th>
            <th className="text-right">Missing Cost Qty</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any, index: number) => (
            <tr className="border-b" key={row.key || index}>
              <td className="p-2 font-medium">{row.label}</td>
              {view === "item" && (
                <>
                  <td>{row.sku || "—"}</td>
                  <td>{row.category || "—"}</td>
                </>
              )}
              <td className="text-right">{row.qty}</td>
              <td className="text-right">{money(row.taxableSales)}</td>
              <td className="text-right">{money(row.tax)}</td>
              <td className="text-right">{money(row.cogs)}</td>
              <td className="text-right font-medium">
                {money(row.grossProfit)}
              </td>
              <td className="text-right">
                {Number(row.marginPercent || 0).toFixed(2)}%
              </td>
              <td className="text-right">{row.missingCostQty}</td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                className="py-10 text-center text-muted-foreground"
                colSpan={view === "item" ? 10 : 8}
              >
                No sales found for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Date</th>
            <th>Invoice</th>
            <th>Product</th>
            <th>Batch</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Taxable Sales</th>
            <th className="text-right">Cost / Unit</th>
            <th className="text-right">COGS</th>
            <th className="text-right">Profit</th>
            <th className="text-right">Margin</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any) => (
            <tr className="border-b" key={row.id}>
              <td className="p-2 whitespace-nowrap">
                {new Date(row.date).toLocaleDateString("en-IN")}
              </td>
              <td>{row.billNo}</td>
              <td>{row.product}</td>
              <td>{row.batchNo}</td>
              <td className="text-right">{row.qty}</td>
              <td className="text-right">{money(row.taxableSales)}</td>
              <td className="text-right">
                {row.costPriceAtSale === null
                  ? "—"
                  : money(row.costPriceAtSale)}
              </td>
              <td className="text-right">
                {row.cogs === null ? "—" : money(row.cogs)}
              </td>
              <td className="text-right font-medium">
                {row.grossProfit === null ? "—" : money(row.grossProfit)}
              </td>
              <td className="text-right">
                {row.marginPercent === null
                  ? "—"
                  : `${Number(row.marginPercent).toFixed(2)}%`}
              </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                colSpan={10}
                className="py-10 text-center text-muted-foreground"
              >
                No sales found for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
