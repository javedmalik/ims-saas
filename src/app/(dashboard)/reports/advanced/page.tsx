"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintHeader } from "@/components/print/print-header";

type ViewType = "hsn-gst" | "payments" | "user-sales" | "branch-comparison";

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

export default function AdvancedReportsPage() {
  const [view, setView] = useState<ViewType>("hsn-gst");

  const [from, setFrom] = useState(monthStart());

  const [to, setTo] = useState(today());

  const [search, setSearch] = useState("");

  const [data, setData] = useState<any>({
    rows: [],
    summary: {},
  });

  const [branding, setBranding] = useState<any>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/branding", {
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(setBranding);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          view,
          from,
          to,
          search: view === "hsn-gst" ? search : "",
        });

        const response = await fetch(
          `/api/reports/advanced?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error || "Unable to load report");
        }

        setData(body);
      } catch (err) {
        setData({
          rows: [],
          summary: {},
        });

        setError(err instanceof Error ? err.message : "Unable to load report");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [view, from, to, search]);

  const title = useMemo(() => {
    if (view === "payments") {
      return "Payment Collection Report";
    }

    if (view === "user-sales") {
      return "User-wise Sales Report";
    }

    if (view === "branch-comparison") {
      return "Branch Comparison Report";
    }

    return "HSN GST Summary";
  }, [view]);

  function exportCsv() {
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (!rows.length) return;

    const keys = Object.keys(rows[0]);

    const csv = [
      keys.map(csvCell).join(","),

      ...rows.map((row: any) => keys.map((key) => csvCell(row[key])).join(",")),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = `${view}-${from}-${to}.csv`;

    a.click();

    URL.revokeObjectURL(url);
  }

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
          <h2 className="text-xl font-semibold">Advanced Reports</h2>

          <p className="text-sm text-muted-foreground">
            GST, collections, salesperson performance and multi-branch
            comparison.
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
            variant={view === "hsn-gst" ? "default" : "outline"}
            onClick={() => setView("hsn-gst")}
          >
            HSN GST
          </Button>

          <Button
            variant={view === "payments" ? "default" : "outline"}
            onClick={() => setView("payments")}
          >
            Payment Collection
          </Button>

          <Button
            variant={view === "user-sales" ? "default" : "outline"}
            onClick={() => setView("user-sales")}
          >
            User-wise Sales
          </Button>

          <Button
            variant={view === "branch-comparison" ? "default" : "outline"}
            onClick={() => setView("branch-comparison")}
          >
            Branch Comparison
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
            <Label>HSN / Product Search</Label>

            <Input
              value={search}
              disabled={view !== "hsn-gst"}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="HSN, product or SKU"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <SummaryCards view={view} summary={data.summary || {}} />

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
          ) : view === "payments" ? (
            <PaymentTable rows={data.rows || []} />
          ) : view === "user-sales" ? (
            <UserSalesTable rows={data.rows || []} />
          ) : view === "branch-comparison" ? (
            <BranchTable rows={data.rows || []} />
          ) : (
            <HsnTable rows={data.rows || []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCards({ view, summary }: { view: ViewType; summary: any }) {
  if (view === "payments") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Sale Collections"
          value={money(summary.saleCollections)}
        />

        <Summary
          label="Customer Receipts"
          value={money(summary.customerReceipts)}
        />

        <Summary label="Refunds" value={money(summary.refunds)} />

        <Summary label="Net Collection" value={money(summary.netCollection)} />
      </div>
    );
  }

  if (view === "user-sales") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Invoices" value={String(summary.invoices ?? 0)} />

        <Summary label="Net Sales" value={money(summary.netSales)} />

        <Summary label="Credit Notes" value={money(summary.creditNoteValue)} />

        <Summary label="Final Net Sales" value={money(summary.finalNetSales)} />
      </div>
    );
  }

  if (view === "branch-comparison") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Branches" value={String(summary.branches ?? 0)} />

        <Summary label="Final Net Sales" value={money(summary.finalNetSales)} />

        <Summary
          label="Stock Cost Value"
          value={money(summary.stockCostValue)}
        />

        <Summary
          label="Credit Outstanding"
          value={money(summary.creditAmount)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Summary label="Taxable Value" value={money(summary.taxableValue)} />

      <Summary
        label="CGST + SGST"
        value={money(Number(summary.cgst ?? 0) + Number(summary.sgst ?? 0))}
      />

      <Summary label="IGST" value={money(summary.igst)} />

      <Summary label="Net GST" value={money(summary.totalTax)} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>

        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function HsnTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">HSN</th>
            <th>Product</th>
            <th>Unit</th>
            <th className="text-right">GST %</th>
            <th className="text-right">Net Qty</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">CGST</th>
            <th className="text-right">SGST</th>
            <th className="text-right">IGST</th>
            <th className="text-right">Total GST</th>
            <th className="text-right">Net Value</th>
            <th className="text-right">CN Qty</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any) => (
            <tr className="border-b" key={row.key}>
              <td className="p-2">{row.hsnCode}</td>
              <td>{row.product}</td>
              <td>{row.unit}</td>
              <td className="text-right">
                {Number(row.taxPercent).toFixed(2)}%
              </td>
              <td className="text-right">{row.quantity}</td>
              <td className="text-right">{money(row.taxableValue)}</td>
              <td className="text-right">{money(row.cgst)}</td>
              <td className="text-right">{money(row.sgst)}</td>
              <td className="text-right">{money(row.igst)}</td>
              <td className="text-right">{money(row.totalTax)}</td>
              <td className="text-right">{money(row.netValue)}</td>
              <td className="text-right">{row.creditNoteQty}</td>
            </tr>
          ))}

          {!rows.length && <Empty colSpan={12} />}
        </tbody>
      </table>
    </div>
  );
}

function PaymentTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Mode</th>
            <th className="text-right">Sale Collections</th>
            <th className="text-right">Customer Receipts</th>
            <th className="text-right">Refunds</th>
            <th className="text-right">Net Collection</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any) => (
            <tr className="border-b" key={row.mode}>
              <td className="p-2 font-medium">{row.mode}</td>

              <td className="text-right">{money(row.saleCollections)}</td>

              <td className="text-right">{money(row.customerReceipts)}</td>

              <td className="text-right">{money(row.refunds)}</td>

              <td className="text-right font-medium">
                {money(row.netCollection)}
              </td>
            </tr>
          ))}

          {!rows.length && <Empty colSpan={5} />}
        </tbody>
      </table>
    </div>
  );
}

function UserSalesTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">User</th>
            <th>Role</th>
            <th className="text-right">Invoices</th>
            <th className="text-right">Gross</th>
            <th className="text-right">Discount</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">GST</th>
            <th className="text-right">Net Sales</th>
            <th className="text-right">Credit Notes</th>
            <th className="text-right">Final Net Sales</th>
            <th className="text-right">Avg Bill</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any) => (
            <tr className="border-b" key={row.userId}>
              <td className="p-2">
                <div className="font-medium">{row.user}</div>
                <div className="text-xs text-muted-foreground">
                  {row.username}
                </div>
              </td>

              <td>{row.role}</td>

              <td className="text-right">{row.invoices}</td>

              <td className="text-right">{money(row.grossAmount)}</td>

              <td className="text-right">{money(row.discount)}</td>

              <td className="text-right">{money(row.taxableSales)}</td>

              <td className="text-right">{money(row.gst)}</td>

              <td className="text-right">{money(row.netSales)}</td>

              <td className="text-right">{money(row.creditNoteValue)}</td>

              <td className="text-right font-medium">
                {money(row.finalNetSales)}
              </td>

              <td className="text-right">{money(row.averageBill)}</td>
            </tr>
          ))}

          {!rows.length && <Empty colSpan={11} />}
        </tbody>
      </table>
    </div>
  );
}

function BranchTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Branch</th>
            <th className="text-right">Invoices</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">GST</th>
            <th className="text-right">Net Sales</th>
            <th className="text-right">Credit Notes</th>
            <th className="text-right">Final Net Sales</th>
            <th className="text-right">Avg Bill</th>
            <th className="text-right">Stock Qty</th>
            <th className="text-right">Stock Cost</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row: any) => (
            <tr className="border-b" key={row.branchId}>
              <td className="p-2">
                <div className="font-medium">{row.branch}</div>
                <div className="text-xs text-muted-foreground">{row.code}</div>
              </td>

              <td className="text-right">{row.invoices}</td>

              <td className="text-right">{money(row.taxableSales)}</td>

              <td className="text-right">{money(row.gst)}</td>

              <td className="text-right">{money(row.netSales)}</td>

              <td className="text-right">{money(row.creditNoteValue)}</td>

              <td className="text-right font-medium">
                {money(row.finalNetSales)}
              </td>

              <td className="text-right">{money(row.averageBill)}</td>

              <td className="text-right">{row.stockQty}</td>

              <td className="text-right">{money(row.stockCostValue)}</td>
            </tr>
          ))}

          {!rows.length && <Empty colSpan={10} />}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-muted-foreground">
        No matching data found.
      </td>
    </tr>
  );
}
