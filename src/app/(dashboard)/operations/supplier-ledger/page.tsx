"use client";

import {
  useCallback,
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

type SupplierOption = {
  id: number;
  name: string;
  outstanding: number;
};

type LedgerEntry = {
  id: string;
  txnDate: string;
  entryType: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceNo: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  note: string | null;
};

type Branding = {
  logoUrl: string;
  legalName: string;
  tradeName: string;
  branchName: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
};

type LedgerResponse = {
  supplier: {
    id: number;
    name: string;
    contactPerson: string | null;
    mobile: string | null;
    phone: string | null;
    taxId: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    pincode: string | null;
  };

  period: {
    from: string | null;
    to: string | null;
  };

  summary: {
    openingBalance: number;
    periodDebit: number;
    periodCredit: number;
    closingBalance: number;

    totalPurchases: number;
    paidAtPurchase: number;
    purchaseDueRaised: number;
    supplierPayments: number;
    purchaseReturns: number;
    currentOutstanding: number;
  };

  entries: LedgerEntry[];
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

function entryLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
}

function csvCell(value: unknown) {
  const text = String(value ?? "");

  return `"${text.replaceAll('"', '""')}"`;
}

export default function SupplierLedgerPage() {
  const [suppliers, setSuppliers] =
    useState<SupplierOption[]>([]);

  const [supplierId, setSupplierId] =
    useState("");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
    useState("");

  const [data, setData] =
    useState<LedgerResponse | null>(null);

  const [branding, setBranding] =
    useState<Branding | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const loadSuppliers = useCallback(
    async () => {
      const response = await fetch(
        "/api/supplier-payments",
        {
          cache: "no-store",
        },
      );

      const body = await response.json();

      if (!response.ok) {
        setError(
          body.error ||
            "Unable to load suppliers",
        );
        return;
      }

      setSuppliers(body);
    },
    [],
  );

  useEffect(() => {
    loadSuppliers();

    fetch("/api/branding", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (body) {
          setBranding(body);
        }
      });

    const initialSupplierId =
      new URLSearchParams(
        window.location.search,
      ).get("supplierId");

    if (initialSupplierId) {
      setSupplierId(
        initialSupplierId,
      );
    }
  }, [loadSuppliers]);

  const loadLedger = useCallback(
    async () => {
      if (!supplierId) {
        setData(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams({
            supplierId,
          });

        if (from) {
          params.set("from", from);
        }

        if (to) {
          params.set("to", to);
        }

        const response = await fetch(
          `/api/supplier-ledger?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        const body = await response.json();

        if (!response.ok) {
          throw new Error(
            body.error ||
              "Unable to load supplier ledger",
          );
        }

        setData(body);
      } catch (err) {
        setData(null);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load supplier ledger",
        );
      } finally {
        setLoading(false);
      }
    },
    [supplierId, from, to],
  );

  useEffect(() => {
    if (supplierId) {
      loadLedger();
    }
  }, [supplierId, loadLedger]);

  const supplierAddress = useMemo(() => {
    if (!data) return "";

    return [
      data.supplier.addressLine1,
      data.supplier.addressLine2,
      data.supplier.city,
      data.supplier.state,
      data.supplier.pincode,
    ]
      .filter(Boolean)
      .join(", ");
  }, [data]);

  function exportCsv() {
    if (!data) return;

    const lines: string[] = [];

    lines.push(
      [
        "Supplier Ledger",
        data.supplier.name,
      ]
        .map(csvCell)
        .join(","),
    );

    lines.push(
      [
        "Period",
        data.period.from || "Beginning",
        data.period.to || "Current",
      ]
        .map(csvCell)
        .join(","),
    );

    lines.push("");

    lines.push(
      [
        "Date",
        "Type",
        "Reference",
        "Note",
        "Debit",
        "Credit",
        "Running Balance",
      ]
        .map(csvCell)
        .join(","),
    );

    for (const entry of data.entries) {
      lines.push(
        [
          new Date(
            entry.txnDate,
          ).toLocaleString("en-IN"),
          entryLabel(entry.entryType),
          entry.referenceNo || "",
          entry.note || "",
          entry.debit.toFixed(2),
          entry.credit.toFixed(2),
          entry.runningBalance.toFixed(2),
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const blob = new Blob(
      [lines.join("\n")],
      {
        type: "text/csv;charset=utf-8",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download = `supplier-ledger-${data.supplier.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.csv`;

    anchor.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            Supplier Ledger
          </h2>

          <p className="text-sm text-muted-foreground">
            Purchases on credit, supplier
            payments, purchase returns and
            running payable balance for the
            current branch.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadLedger}
            disabled={
              !supplierId || loading
            }
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={exportCsv}
            disabled={!data}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>

          <Button
            type="button"
            onClick={() =>
              window.print()
            }
            disabled={!data}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <CardContent className="grid gap-4 pt-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Supplier</Label>

            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={supplierId}
              onChange={(event) =>
                setSupplierId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Select supplier...
              </option>

              {suppliers.map(
                (supplier) => (
                  <option
                    key={supplier.id}
                    value={supplier.id}
                  >
                    {supplier.name} — Payable{" "}
                    {money(
                      supplier.outstanding,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>From</Label>

            <Input
              type="date"
              value={from}
              onChange={(event) =>
                setFrom(
                  event.target.value,
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>To</Label>

            <Input
              type="date"
              value={to}
              onChange={(event) =>
                setTo(
                  event.target.value,
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="no-print rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && (
        <p className="no-print text-sm text-muted-foreground">
          Loading supplier ledger...
        </p>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select a supplier to view the
            ledger.
          </CardContent>
        </Card>
      )}

      {data && (
        <div
          id="supplier-ledger-report"
          className="space-y-6"
        >
          <div className="hidden print:block">
            {branding ? (
              <PrintHeader
                logoUrl={branding.logoUrl}
                legalName={branding.legalName}
                tradeName={branding.tradeName}
                branchName={branding.branchName}
                address={branding.address}
                gstin={branding.gstin}
                phone={branding.phone}
                email={branding.email}
                title="Supplier Ledger"
                subtitle={`${data.period.from || "Beginning"} to ${
                  data.period.to || "Current"
                }`}
              />
            ) : (
              <h1 className="text-2xl font-bold">
                Supplier Ledger
              </h1>
            )}

            <div className="mt-5 border-b pb-4 text-sm">
              <p className="font-semibold">
                Supplier: {data.supplier.name}
              </p>

              {supplierAddress && (
                <p>{supplierAddress}</p>
              )}

              {data.supplier.taxId && (
                <p>
                  GSTIN / Tax ID:{" "}
                  {data.supplier.taxId}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Current Payable"
              value={money(
                data.summary
                  .currentOutstanding,
              )}
            />

            <SummaryCard
              title="Total Purchases"
              value={money(
                data.summary
                  .totalPurchases,
              )}
            />

            <SummaryCard
              title="Supplier Payments"
              value={money(
                data.summary
                  .supplierPayments,
              )}
            />

            <SummaryCard
              title="Purchase Returns"
              value={money(
                data.summary
                  .purchaseReturns,
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="Opening Balance"
              value={money(
                data.summary
                  .openingBalance,
              )}
            />

            <SummaryCard
              title="Period Debit"
              value={money(
                data.summary.periodDebit,
              )}
            />

            <SummaryCard
              title="Period Credit"
              value={money(
                data.summary.periodCredit,
              )}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {data.supplier.name}
                  </CardTitle>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.supplier.mobile ||
                      data.supplier.phone ||
                      "No contact number"}
                    {data.supplier.taxId
                      ? ` • GSTIN ${data.supplier.taxId}`
                      : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase text-muted-foreground">
                    Closing Balance
                  </p>

                  <p className="text-xl font-semibold">
                    {money(
                      data.summary
                        .closingBalance,
                    )}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">
                        Date
                      </th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Particulars</th>
                      <th className="text-right">
                        Debit
                      </th>
                      <th className="text-right">
                        Credit
                      </th>
                      <th className="text-right">
                        Balance
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.summary
                      .openingBalance !==
                      0 && (
                      <tr className="border-b bg-muted/30">
                        <td className="p-2">
                          —
                        </td>
                        <td colSpan={3}>
                          Opening Balance
                        </td>
                        <td />
                        <td />
                        <td className="text-right font-medium">
                          {money(
                            data.summary
                              .openingBalance,
                          )}
                        </td>
                      </tr>
                    )}

                    {data.entries.map(
                      (entry) => (
                        <tr
                          className="border-b"
                          key={entry.id}
                        >
                          <td className="p-2 whitespace-nowrap">
                            {new Date(
                              entry.txnDate,
                            ).toLocaleString(
                              "en-IN",
                            )}
                          </td>

                          <td>
                            {entryLabel(
                              entry.entryType,
                            )}
                          </td>

                          <td>
                            {entry.referenceNo ||
                              "—"}
                          </td>

                          <td>
                            {entry.note ||
                              "—"}
                          </td>

                          <td className="text-right">
                            {entry.debit
                              ? money(
                                  entry.debit,
                                )
                              : "—"}
                          </td>

                          <td className="text-right">
                            {entry.credit
                              ? money(
                                  entry.credit,
                                )
                              : "—"}
                          </td>

                          <td className="text-right font-medium">
                            {money(
                              entry.runningBalance,
                            )}
                          </td>
                        </tr>
                      ),
                    )}

                    {!data.entries.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No supplier ledger
                          transactions for this
                          period.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td
                        className="p-2"
                        colSpan={4}
                      >
                        Period Total
                      </td>

                      <td className="text-right">
                        {money(
                          data.summary
                            .periodDebit,
                        )}
                      </td>

                      <td className="text-right">
                        {money(
                          data.summary
                            .periodCredit,
                        )}
                      </td>

                      <td className="text-right">
                        {money(
                          data.summary
                            .closingBalance,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-5 grid gap-2 border-t pt-4 text-sm md:grid-cols-2">
                <p>
                  <strong>
                    Paid with Purchase:
                  </strong>{" "}
                  {money(
                    data.summary
                      .paidAtPurchase,
                  )}
                </p>

                <p>
                  <strong>
                    Credit Payable Raised:
                  </strong>{" "}
                  {money(
                    data.summary
                      .purchaseDueRaised,
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }

          .no-print,
          aside,
          header {
            display: none !important;
          }

          main {
            padding: 0 !important;
          }

          #supplier-ledger-report {
            color: #000 !important;
          }

          #supplier-ledger-report
            .border,
          #supplier-ledger-report
            .border-b,
          #supplier-ledger-report
            .border-t,
          #supplier-ledger-report
            .border-t-2 {
            border-color: #000 !important;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        <p className="mt-1 text-xl font-semibold">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
