"use client";

import { useEffect, useMemo, useState } from "react";

import { Download, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { PrintHeader } from "@/components/print/print-header";
import { AdvancedProfitReportLink } from "@/components/reports/advanced-profit-report-link";
import { InventoryAnalysisReportLink } from "@/components/reports/inventory-analysis-report-link";
import { AdvancedOperationsReportLink } from "@/components/reports/advanced-operations-report-link";

type ReportType =
  | "sales"
  | "purchases"
  | "stock"
  | "gst"
  | "customer-outstanding"
  | "customer-ledger"
  | "expiry"
  | "supplier-summary";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const date = new Date();

  date.setDate(1);

  return date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>("sales");

  const [from, setFrom] = useState(monthStart());

  const [to, setTo] = useState(today());

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState("ALL");

  const [paymentMode, setPaymentMode] = useState("ALL");

  const [sortBy, setSortBy] = useState("date");

  const [sortOrder, setSortOrder] = useState("desc");

  const [customerId, setCustomerId] = useState("");

  const [supplierId, setSupplierId] = useState("");

  const [expiryDays, setExpiryDays] = useState("90");

  const [customers, setCustomers] = useState<any[]>([]);

  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [data, setData] = useState<any>({
    rows: [],
    summary: {},
  });

  const [branding, setBranding] = useState<any>({
    logoUrl: "",
    legalName: "",
    tradeName: "",
    branchName: "",
    address: "",
    gstin: "",
    phone: "",
    email: "",
  });

  const [loading, setLoading] = useState(false);

  /*
  =========================================================
  LOAD MASTER DATA
  =========================================================
  */

  useEffect(() => {
    async function load() {
      const [brandingResponse, customerResponse, supplierResponse] =
        await Promise.all([
          fetch("/api/branding", {
            cache: "no-store",
          }),

          fetch("/api/customers", {
            cache: "no-store",
          }),

          fetch("/api/suppliers", {
            cache: "no-store",
          }),
        ]);

      if (brandingResponse.ok) {
        setBranding(await brandingResponse.json());
      }

      if (customerResponse.ok) {
        setCustomers(await customerResponse.json());
      }

      if (supplierResponse.ok) {
        setSuppliers(await supplierResponse.json());
      }
    }

    load();
  }, []);

  /*
  =========================================================
  RESET FILTERS WHEN REPORT CHANGES
  =========================================================
  */

  useEffect(() => {
    setSearch("");
    setStatus("ALL");

    setPaymentMode("ALL");

    setCustomerId("");
    setSupplierId("");

    if (type === "stock") {
      setSortBy("name");
    } else if (type === "customer-outstanding") {
      setSortBy("name");
    } else if (type === "supplier-summary") {
      setSortBy("name");
    } else if (type === "expiry") {
      setSortBy("expiry");
    } else {
      setSortBy("date");
    }
  }, [type]);

  /*
  =========================================================
  LOAD REPORT
  =========================================================
  */

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);

      const params = new URLSearchParams();

      params.set("search", search);

      params.set("status", status);

      params.set("paymentMode", paymentMode);

      params.set("sortBy", sortBy);

      params.set("sortOrder", sortOrder);

      if (
        type !== "stock" &&
        type !== "customer-outstanding" &&
        type !== "expiry"
      ) {
        params.set("from", from);

        params.set("to", to);
      }

      if (type === "customer-ledger") {
        params.set("from", from);

        params.set("to", to);

        if (customerId) {
          params.set("customerId", customerId);
        }
      }

      if (type === "supplier-summary") {
        if (supplierId) {
          params.set("supplierId", supplierId);
        }
      }

      if (type === "expiry") {
        params.set("days", expiryDays);
      }

      const response = await fetch(
        `/api/reports/${type}?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      if (response.ok) {
        setData(await response.json());
      } else {
        setData({
          rows: [],
          summary: {},
        });
      }

      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [
    type,
    from,
    to,
    search,
    status,
    paymentMode,
    sortBy,
    sortOrder,
    customerId,
    supplierId,
    expiryDays,
  ]);

  /*
  =========================================================
  REPORT TITLES
  =========================================================
  */

  const reportTitle = useMemo(() => {
    switch (type) {
      case "sales":
        return "Sales Report";

      case "purchases":
        return "Purchase Report";

      case "stock":
        return "Stock Report";

      case "gst":
        return "GST Summary";

      case "customer-outstanding":
        return "Customer Outstanding Report";

      case "customer-ledger":
        return "Customer Ledger";

      case "expiry":
        return "Expiry / Near-Expiry Report";

      case "supplier-summary":
        return "Supplier Purchase Summary";

      default:
        return "Report";
    }
  }, [type]);

  function exportCsv() {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) return;
    const keys = Object.keys(rows[0]).filter(
      (key) => !["id"].includes(key) && typeof rows[0][key] !== "object",
    );
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      keys.map(escape).join(","),
      ...rows.map((row: any) => keys.map((key) => escape(row[key])).join(",")),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-${from || "all"}-${to || "all"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const reportSubtitle = useMemo(() => {
    if (type === "stock") {
      return `Generated ${new Date().toLocaleString("en-IN")}`;
    }

    if (type === "customer-outstanding") {
      return `Generated ${new Date().toLocaleString("en-IN")}`;
    }

    if (type === "expiry") {
      return `${expiryDays} day expiry window`;
    }

    if (type === "customer-ledger") {
      const customer = customers.find((item) => item.id === Number(customerId));

      return `${customer?.name || "Select customer"} • ${from} to ${to}`;
    }

    return `${from} to ${to}`;
  }, [type, from, to, expiryDays, customerId, customers]);

  return (
    <div className="space-y-6">
      {/* PRINT HEADER */}

      <div className="print-only">
        <PrintHeader
          {...branding}
          title={reportTitle}
          subtitle={reportSubtitle}
        />
      </div>

      {/* PAGE HEADER */}

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-no-print
      >
        <div>
          <h2 className="text-xl font-semibold">Reports</h2>

          <p className="text-sm text-muted-foreground">
            Sales, purchase, stock, GST, outstanding, ledger, expiry and
            supplier reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <AdvancedProfitReportLink />
          <InventoryAnalysisReportLink />
          <AdvancedOperationsReportLink />
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!data.rows?.length}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

      {/* REPORT TYPE */}

      <Card data-no-print>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-2">
            <ReportButton
              active={type === "sales"}
              onClick={() => setType("sales")}
            >
              Sales
            </ReportButton>

            <ReportButton
              active={type === "purchases"}
              onClick={() => setType("purchases")}
            >
              Purchases
            </ReportButton>

            <ReportButton
              active={type === "stock"}
              onClick={() => setType("stock")}
            >
              Stock
            </ReportButton>

            <ReportButton
              active={type === "gst"}
              onClick={() => setType("gst")}
            >
              GST Summary
            </ReportButton>

            <ReportButton
              active={type === "customer-outstanding"}
              onClick={() => setType("customer-outstanding")}
            >
              Customer Outstanding
            </ReportButton>

            <ReportButton
              active={type === "customer-ledger"}
              onClick={() => setType("customer-ledger")}
            >
              Customer Ledger
            </ReportButton>

            <ReportButton
              active={type === "expiry"}
              onClick={() => setType("expiry")}
            >
              Expiry
            </ReportButton>

            <ReportButton
              active={type === "supplier-summary"}
              onClick={() => setType("supplier-summary")}
            >
              Supplier Summary
            </ReportButton>
          </div>
        </CardContent>
      </Card>

      {/* FILTERS */}

      <Card data-no-print>
        <CardContent className="pt-5">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <ReportFilters
              type={type}
              from={from}
              setFrom={setFrom}
              to={to}
              setTo={setTo}
              search={search}
              setSearch={setSearch}
              status={status}
              setStatus={setStatus}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              customerId={customerId}
              setCustomerId={setCustomerId}
              supplierId={supplierId}
              setSupplierId={setSupplierId}
              expiryDays={expiryDays}
              setExpiryDays={setExpiryDays}
              customers={customers}
              suppliers={suppliers}
            />
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY */}

      <SummaryCards type={type} summary={data.summary || {}} />

      {/* REPORT TABLE */}

      <Card className="print-page">
        <CardContent className="pt-5">
          {loading ? (
            <div className="flex items-center gap-2" data-no-print>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <ReportTable type={type} rows={data.rows || []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/*
=========================================================
BUTTON
=========================================================
*/

function ReportButton({
  active,
  onClick,
  children,
}: {
  active: boolean;

  onClick: () => void;

  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/*
=========================================================
FILTER COMPONENT
=========================================================
*/

function ReportFilters(props: any) {
  const {
    type,

    from,
    setFrom,

    to,
    setTo,

    search,
    setSearch,

    status,
    setStatus,

    paymentMode,
    setPaymentMode,

    sortBy,
    setSortBy,

    sortOrder,
    setSortOrder,

    customerId,
    setCustomerId,

    supplierId,
    setSupplierId,

    expiryDays,
    setExpiryDays,

    customers,
    suppliers,
  } = props;

  const showDates = !["stock", "customer-outstanding", "expiry"].includes(type);

  const showSearch = !["gst", "customer-ledger"].includes(type);

  return (
    <>
      {showDates && (
        <>
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
        </>
      )}

      {type === "customer-ledger" && (
        <div className="md:col-span-2">
          <Label>Customer</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Select customer</option>

            {customers.map((customer: any) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}

                {customer.mobile ? ` - ${customer.mobile}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "supplier-summary" && (
        <div>
          <Label>Supplier</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">All suppliers</option>

            {suppliers.map((supplier: any) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "expiry" && (
        <div>
          <Label>Expiry Window</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={expiryDays}
            onChange={(event) => setExpiryDays(event.target.value)}
          >
            <option value="30">30 Days</option>

            <option value="60">60 Days</option>

            <option value="90">90 Days</option>

            <option value="180">180 Days</option>

            <option value="365">1 Year</option>
          </select>
        </div>
      )}

      {showSearch && (
        <div>
          <Label>Search</Label>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
          />
        </div>
      )}

      {(type === "sales" || type === "purchases") && (
        <div>
          <Label>Payment</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value)}
          >
            <option value="ALL">All</option>

            <option value="CASH">Cash</option>

            <option value="UPI">UPI</option>

            <option value="CARD">Card</option>

            <option value="BANK_TRANSFER">Bank</option>

            <option value="CREDIT">Credit</option>
          </select>
        </div>
      )}

      {(type === "sales" || type === "purchases") && (
        <div>
          <Label>Status</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All</option>

            <option value="POSTED">Posted</option>

            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      )}

      {type === "stock" && (
        <div>
          <Label>Status</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All</option>

            <option value="OK">Normal</option>

            <option value="LOW">Low</option>

            <option value="OUT">Out</option>

            <option value="EXPIRING">Expiring</option>
          </select>
        </div>
      )}

      {type === "customer-outstanding" && (
        <div>
          <Label>Status</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All</option>

            <option value="DUE">Outstanding</option>

            <option value="CLEAR">Clear</option>
          </select>
        </div>
      )}

      {type === "expiry" && (
        <div>
          <Label>Status</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All</option>

            <option value="EXPIRING">Near Expiry</option>

            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      )}

      {!["gst", "customer-ledger"].includes(type) && (
        <>
          <div>
            <Label>Sort By</Label>

            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="date">Date</option>

              <option value="name">Name</option>

              <option value="amount">Amount</option>

              <option value="due">Due</option>

              <option value="qty">Quantity</option>

              <option value="value">Value</option>

              <option value="expiry">Expiry</option>
            </select>
          </div>

          <div>
            <Label>Order</Label>

            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            >
              <option value="desc">Descending</option>

              <option value="asc">Ascending</option>
            </select>
          </div>
        </>
      )}
    </>
  );
}

/*
=========================================================
SUMMARY CARDS
=========================================================
*/

function SummaryCards({
  type,
  summary,
}: {
  type: ReportType;

  summary: any;
}) {
  let cards: [string, string | number][] = [];

  switch (type) {
    case "gst":
      cards = [
        ["Output Taxable", `₹${money(summary.outputTaxable)}`],

        ["Output GST", `₹${money(summary.outputTax)}`],

        ["Input Taxable", `₹${money(summary.inputTaxable)}`],

        ["Input GST", `₹${money(summary.inputTax)}`],

        ["Net GST", `₹${money(summary.netTax)}`],
      ];

      break;

    case "customer-outstanding":
      cards = [
        ["Customers", summary.customers || 0],

        ["Outstanding Customers", summary.dueCustomers || 0],

        ["Total Outstanding", `₹${money(summary.totalDue)}`],
      ];

      break;

    case "customer-ledger":
      cards = [
        ["Opening", `₹${money(summary.openingBalance)}`],

        ["Debit", `₹${money(summary.totalDebit)}`],

        ["Credit", `₹${money(summary.totalCredit)}`],

        ["Closing", `₹${money(summary.closingBalance)}`],
      ];

      break;

    case "expiry":
      cards = [
        ["Batches", summary.batches || 0],

        ["Expired", summary.expired || 0],

        ["Near Expiry", summary.expiring || 0],

        ["Qty", summary.quantity || 0],

        ["Stock Value", `₹${money(summary.stockValue)}`],
      ];

      break;

    case "supplier-summary":
      cards = [
        ["Suppliers", summary.suppliers || 0],

        ["Purchases", summary.purchases || 0],

        ["Net Purchases", `₹${money(summary.net)}`],

        ["Paid", `₹${money(summary.paid)}`],

        ["Due", `₹${money(summary.due)}`],
      ];

      break;

    case "stock":
      cards = [
        ["Batches", summary.batches || 0],

        ["Quantity", summary.quantity || 0],

        ["Stock Value", `₹${money(summary.value)}`],

        ["Low", summary.low || 0],

        ["Out", summary.out || 0],

        ["Expiring", summary.expiring || 0],
      ];

      break;

    default:
      cards = [
        ["Transactions", summary.count || 0],

        ["Gross", `₹${money(summary.gross)}`],

        ["Discount", `₹${money(summary.discount)}`],

        ["GST", `₹${money(summary.tax)}`],

        ["Net", `₹${money(summary.net)}`],

        ["Due", `₹${money(summary.due)}`],
      ];
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{label}</p>

            <p className="mt-1 text-lg font-semibold">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/*
=========================================================
TABLE SWITCH
=========================================================
*/

function ReportTable({ type, rows }: { type: ReportType; rows: any[] }) {
  if (type === "gst") {
    return <GstTable rows={rows} />;
  }

  if (type === "customer-outstanding") {
    return <OutstandingTable rows={rows} />;
  }

  if (type === "customer-ledger") {
    return <LedgerTable rows={rows} />;
  }

  if (type === "expiry") {
    return <ExpiryTable rows={rows} />;
  }

  if (type === "supplier-summary") {
    return <SupplierTable rows={rows} />;
  }

  if (type === "stock") {
    return <StockTable rows={rows} />;
  }

  return <TransactionTable rows={rows} type={type} />;
}

/*
=========================================================
TRANSACTION TABLE
=========================================================
*/

function TransactionTable({ rows, type }: { rows: any[]; type: ReportType }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-xs">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Date</th>

            <th className="p-2 text-left">Number</th>

            <th className="p-2 text-left">Party</th>

            <th>Items</th>

            <th>Payment</th>

            <th className="text-right">Gross</th>

            <th className="text-right">Discount</th>

            <th className="text-right">GST</th>

            <th className="text-right">Net</th>

            <th className="text-right">Due</th>

            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2">
                {new Date(row.date).toLocaleDateString("en-IN")}
              </td>

              <td className="p-2">{row.number}</td>

              <td className="p-2">{row.party}</td>

              <td className="text-center">{row.items}</td>

              <td className="text-center">{row.paymentMode}</td>

              <td className="text-right">₹{money(row.gross)}</td>

              <td className="text-right">₹{money(row.discount)}</td>

              <td className="text-right">₹{money(row.tax)}</td>

              <td className="text-right">₹{money(row.net)}</td>

              <td className="text-right">₹{money(row.due)}</td>

              <td className="text-center">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
=========================================================
GST TABLE
=========================================================
*/

function GstTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-xs">
        <thead>
          <tr className="border-b">
            <th>GST %</th>

            <th className="text-right">Output Taxable</th>

            <th className="text-right">Output CGST</th>

            <th className="text-right">Output SGST</th>

            <th className="text-right">Output IGST</th>

            <th className="text-right">Input Taxable</th>

            <th className="text-right">Input CGST</th>

            <th className="text-right">Input SGST</th>

            <th className="text-right">Input IGST</th>

            <th className="text-right">Net GST</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.taxRate} className="border-b">
              <td className="p-2 text-center font-medium">{row.taxRate}%</td>

              <td className="text-right">₹{money(row.outputTaxable)}</td>

              <td className="text-right">₹{money(row.outputCgst)}</td>

              <td className="text-right">₹{money(row.outputSgst)}</td>

              <td className="text-right">₹{money(row.outputIgst)}</td>

              <td className="text-right">₹{money(row.inputTaxable)}</td>

              <td className="text-right">₹{money(row.inputCgst)}</td>

              <td className="text-right">₹{money(row.inputSgst)}</td>

              <td className="text-right">₹{money(row.inputIgst)}</td>

              <td className="text-right font-semibold">₹{money(row.netTax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
=========================================================
OUTSTANDING TABLE
=========================================================
*/

function OutstandingTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b">
          <th className="p-2 text-left">Customer</th>

          <th>Mobile</th>

          <th>GSTIN</th>

          <th>State</th>

          <th className="text-right">Outstanding</th>

          <th>Status</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b">
            <td className="p-2 font-medium">{row.name}</td>

            <td className="text-center">{row.mobile || "-"}</td>

            <td className="text-center">{row.gstin || "-"}</td>

            <td className="text-center">{row.state || "-"}</td>

            <td className="text-right">₹{money(row.dueAmount)}</td>

            <td className="text-center">{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/*
=========================================================
LEDGER TABLE
=========================================================
*/

function LedgerTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b">
          <th className="p-2 text-left">Date</th>

          <th>Reference</th>

          <th className="text-left">Particulars</th>

          <th className="text-right">Debit</th>

          <th className="text-right">Credit</th>

          <th className="text-right">Balance</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b">
            <td className="p-2">
              {new Date(row.date).toLocaleString("en-IN")}
            </td>

            <td className="text-center">{row.reference}</td>

            <td>{row.note}</td>

            <td className="text-right">₹{money(row.debit)}</td>

            <td className="text-right">₹{money(row.credit)}</td>

            <td className="text-right font-medium">₹{money(row.balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/*
=========================================================
EXPIRY TABLE
=========================================================
*/

function ExpiryTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Product</th>

            <th>SKU</th>

            <th>Batch</th>

            <th>Expiry</th>

            <th className="text-right">Days Left</th>

            <th className="text-right">Qty</th>

            <th className="text-right">Stock Value</th>

            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 font-medium">{row.product}</td>

              <td className="text-center">{row.sku || "-"}</td>

              <td className="text-center">{row.batchNo}</td>

              <td className="text-center">
                {new Date(row.expiryDate).toLocaleDateString("en-IN")}
              </td>

              <td className="text-right">{row.daysLeft}</td>

              <td className="text-right">{row.currentQty}</td>

              <td className="text-right">₹{money(row.stockValue)}</td>

              <td className="text-center">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
=========================================================
SUPPLIER SUMMARY TABLE
=========================================================
*/

function SupplierTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-xs">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Supplier</th>

            <th>Mobile</th>

            <th>GSTIN</th>

            <th className="text-right">Purchases</th>

            <th className="text-right">Gross</th>

            <th className="text-right">Discount</th>

            <th className="text-right">GST</th>

            <th className="text-right">Net</th>

            <th className="text-right">Paid</th>

            <th className="text-right">Due</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.supplierId} className="border-b">
              <td className="p-2 font-medium">{row.supplier}</td>

              <td className="text-center">{row.mobile || "-"}</td>

              <td className="text-center">{row.gstin || "-"}</td>

              <td className="text-right">{row.purchases}</td>

              <td className="text-right">₹{money(row.gross)}</td>

              <td className="text-right">₹{money(row.discount)}</td>

              <td className="text-right">₹{money(row.tax)}</td>

              <td className="text-right">₹{money(row.net)}</td>

              <td className="text-right">₹{money(row.paid)}</td>

              <td className="text-right font-medium">₹{money(row.due)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
=========================================================
STOCK TABLE
=========================================================
*/

function StockTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left">Product</th>

            <th>SKU</th>

            <th>Batch</th>

            <th>Expiry</th>

            <th className="text-right">Qty</th>

            <th className="text-right">Cost</th>

            <th className="text-right">Value</th>

            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 font-medium">{row.product}</td>

              <td className="text-center">{row.sku || "-"}</td>

              <td className="text-center">{row.batchNo}</td>

              <td className="text-center">
                {row.expiryDate
                  ? new Date(row.expiryDate).toLocaleDateString("en-IN")
                  : "-"}
              </td>

              <td className="text-right">{row.currentQty}</td>

              <td className="text-right">₹{money(row.costPrice)}</td>

              <td className="text-right">₹{money(row.value)}</td>

              <td className="text-center">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
