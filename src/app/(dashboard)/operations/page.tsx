"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab =
  | "receipts"
  | "supplier-payments"
  | "adjustments"
  | "transfers"
  | "sales-return"
  | "purchase-return"
  | "ledger";
type Customer = { id: number; name: string; dueAmount: number };
type Supplier = { id: number; name: string };
type Batch = {
  id: number;
  productId: number;
  name: string;
  batchNo: string;
  qty: number;
  sellPrice: number;
};
type Branch = { id: number; name: string; code: string; current: boolean };
const paymentModes = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>("receipts"),
    [customers, setCustomers] = useState<Customer[]>([]),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [branches, setBranches] = useState<Branch[]>([]),
    [sales, setSales] = useState<any[]>([]),
    [purchases, setPurchases] = useState<any[]>([]),
    [ledger, setLedger] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState({
    customerId: "",
    amount: "",
    mode: "CASH",
    reference: "",
    note: "",
  });
  const [spay, setSpay] = useState({
    supplierId: "",
    amount: "",
    mode: "BANK_TRANSFER",
    reference: "",
    note: "",
  });
  const [adjust, setAdjust] = useState({
    batchId: "",
    qtyChange: "",
    reason: "PHYSICAL_COUNT",
    note: "",
  });
  const [transfer, setTransfer] = useState({
    toBranchId: "",
    batchId: "",
    qty: "",
    note: "",
  });
  const [saleReturn, setSaleReturn] = useState({
    saleId: "",
    saleItemId: "",
    qty: "",
    reason: "Customer return",
    refundMode: "CASH",
    reference: "",
  });
  const [purchaseReturn, setPurchaseReturn] = useState({
    purchaseId: "",
    purchaseItemId: "",
    qty: "",
    reason: "Supplier return",
  });
  const [selectedSale, setSelectedSale] = useState<any | null>(null),
    [selectedPurchase, setSelectedPurchase] = useState<any | null>(null),
    [supplierOutstanding, setSupplierOutstanding] = useState(0),
    [lastReceipt, setLastReceipt] = useState<{
      id: string;
      receiptNo: string;
    } | null>(null),
    [lastSupplierPayment, setLastSupplierPayment] = useState<{
      id: string;
      paymentNo: string;
      supplierId: number;
    } | null>(null),
    [lastCreditNote, setLastCreditNote] = useState<{
      id: string;
      creditNoteNo: string;
    } | null>(null),
    [lastDebitNote, setLastDebitNote] = useState<{
      id: string;
      debitNoteNo: string;
    } | null>(null),
    [lastTransfer, setLastTransfer] = useState<{
      id: string;
      transferNo: string;
    } | null>(null);

  const loadMasters = useCallback(async () => {
    const [c, s, p, b, br] = await Promise.all([
      fetch("/api/customers", { cache: "no-store" }),
      fetch("/api/suppliers", { cache: "no-store" }),
      fetch("/api/pos", { cache: "no-store" }),
      fetch("/api/sales", { cache: "no-store" }),
      fetch("/api/session/branches", { cache: "no-store" }),
    ]);
    if (c.ok) setCustomers(await c.json());
    if (s.ok) setSuppliers(await s.json());
    if (p.ok) {
      const d = await p.json();
      setBatches(d.batches || []);
    }
    if (b.ok) setSales(await b.json());
    if (br.ok) setBranches(await br.json());
    const pr = await fetch("/api/purchases", { cache: "no-store" });
    if (pr.ok) setPurchases(await pr.json());
  }, []);
  useEffect(() => {
    loadMasters();
  }, [loadMasters]);
  useEffect(() => {
    if (tab === "ledger")
      fetch("/api/stock-ledger", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setLedger);
  }, [tab]);
  useEffect(() => {
    if (!spay.supplierId) {
      setSupplierOutstanding(0);
      return;
    }
    fetch(`/api/supplier-payments?supplierId=${spay.supplierId}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { outstanding: 0 }))
      .then((d) => setSupplierOutstanding(Number(d.outstanding || 0)));
  }, [spay.supplierId]);
  useEffect(() => {
    if (!saleReturn.saleId) {
      setSelectedSale(null);
      return;
    }
    fetch(`/api/sales/${saleReturn.saleId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSelectedSale);
  }, [saleReturn.saleId]);
  useEffect(() => {
    if (!purchaseReturn.purchaseId) {
      setSelectedPurchase(null);
      return;
    }
    fetch(`/api/purchases/${purchaseReturn.purchaseId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSelectedPurchase);
  }, [purchaseReturn.purchaseId]);

  async function post(url: string, body: any) {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Operation failed");
      setMessage(
        d.receiptNo ||
          d.paymentNo ||
          d.adjustmentNo ||
          d.transferNo ||
          d.returnNo
          ? `Saved successfully: ${d.receiptNo || d.paymentNo || d.adjustmentNo || d.transferNo || d.returnNo}`
          : "Saved successfully.",
      );
      await loadMasters();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      return null;
    } finally {
      setLoading(false);
    }
  }
  async function submitReceipt(e: FormEvent) {
    e.preventDefault();
    setLastTransfer(null);
    setLastSupplierPayment(null);
    setLastCreditNote(null);
    const d = await post("/api/customer-receipts", {
      ...receipt,
      customerId: Number(receipt.customerId),
      amount: Number(receipt.amount),
    });
    if (d) {
      setLastReceipt({ id: String(d.id), receiptNo: String(d.receiptNo) });
      setReceipt({
        customerId: "",
        amount: "",
        mode: "CASH",
        reference: "",
        note: "",
      });
    }
  }
  async function submitSupplierPayment(e: FormEvent) {
    e.preventDefault();
    setLastTransfer(null);
    setLastReceipt(null);
    setLastCreditNote(null);
    const d = await post("/api/supplier-payments", {
      ...spay,
      supplierId: Number(spay.supplierId),
      amount: Number(spay.amount),
    });
    if (d) {
      setLastSupplierPayment({
        id: String(d.id),
        paymentNo: String(d.paymentNo),
        supplierId: Number(d.supplierId),
      });
      setSpay({
        supplierId: "",
        amount: "",
        mode: "BANK_TRANSFER",
        reference: "",
        note: "",
      });
    }
  }
  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    setLastTransfer(null);
    setLastReceipt(null);
    setLastSupplierPayment(null);
    setLastCreditNote(null);
    if (
      await post("/api/stock-adjustments", {
        reason: adjust.reason,
        note: adjust.note,
        items: [
          {
            batchId: Number(adjust.batchId),
            qtyChange: Number(adjust.qtyChange),
          },
        ],
      })
    )
      setAdjust({
        batchId: "",
        qtyChange: "",
        reason: "PHYSICAL_COUNT",
        note: "",
      });
  }
  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    setLastReceipt(null);
    setLastSupplierPayment(null);
    setLastCreditNote(null);
    setLastDebitNote(null);
    const d = await post("/api/stock-transfers", {
      toBranchId: Number(transfer.toBranchId),
      note: transfer.note,
      items: [{ batchId: Number(transfer.batchId), qty: Number(transfer.qty) }],
    });
    if (d) {
      setLastTransfer({ id: String(d.id), transferNo: String(d.transferNo) });
      setTransfer({ toBranchId: "", batchId: "", qty: "", note: "" });
    }
  }
  async function submitSaleReturn(e: FormEvent) {
    e.preventDefault();
    setLastTransfer(null);
    setLastReceipt(null);
    setLastSupplierPayment(null);
    setLastDebitNote(null);
    const d = await post("/api/returns/sales", {
      saleId: saleReturn.saleId,
      reason: saleReturn.reason,
      refundMode: saleReturn.refundMode,
      reference: saleReturn.reference,
      items: [
        { saleItemId: saleReturn.saleItemId, qty: Number(saleReturn.qty) },
      ],
    });
    if (d) {
      setLastCreditNote({
        id: String(d.id),
        creditNoteNo: String(d.creditNoteNo || d.returnNo),
      });
      setSaleReturn({
        saleId: "",
        saleItemId: "",
        qty: "",
        reason: "Customer return",
        refundMode: "CASH",
        reference: "",
      });
    }
  }
  async function submitPurchaseReturn(e: FormEvent) {
    e.preventDefault();
    setLastTransfer(null);
    setLastReceipt(null);
    setLastSupplierPayment(null);
    setLastCreditNote(null);
    const d = await post("/api/returns/purchases", {
      purchaseId: purchaseReturn.purchaseId,
      reason: purchaseReturn.reason,
      items: [
        {
          purchaseItemId: purchaseReturn.purchaseItemId,
          qty: Number(purchaseReturn.qty),
        },
      ],
    });
    if (d) {
      setLastDebitNote({
        id: String(d.id),
        debitNoteNo: String(d.debitNoteNo || d.returnNo),
      });
      setPurchaseReturn({
        purchaseId: "",
        purchaseItemId: "",
        qty: "",
        reason: "Supplier return",
      });
    }
  }
  const tabs = useMemo(
    () =>
      [
        ["receipts", "Customer Receipt", Banknote],
        ["supplier-payments", "Supplier Payment", Banknote],
        ["adjustments", "Stock Adjustment", SlidersHorizontal],
        ["transfers", "Branch Transfer", ArrowLeftRight],
        ["sales-return", "Sales Return", RotateCcw],
        ["purchase-return", "Purchase Return", RotateCcw],
        ["ledger", "Stock Ledger", RefreshCw],
      ] as const,
    [],
  );
  const currentBranch = branches.find((x) => x.current);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Operations</h2>
        <p className="text-sm text-muted-foreground">
          Receipts, supplier settlements, returns and auditable stock movements
          for {currentBranch?.name || "current branch"}.
        </p>
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-secondary px-4 py-3 text-sm">
          <span>{message}</span>
          <div className="flex flex-wrap gap-2">
            {lastReceipt && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.open(
                    `/print/customer-receipts/${lastReceipt.id}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Print Receipt {lastReceipt.receiptNo}
              </Button>
            )}
            {lastSupplierPayment && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/print/supplier-payments/${lastSupplierPayment.id}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Print Payment {lastSupplierPayment.paymentNo}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/operations/supplier-ledger?supplierId=${lastSupplierPayment.supplierId}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  View Supplier Ledger
                </Button>
              </>
            )}
            {lastCreditNote && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.open(
                    `/print/credit-notes/${lastCreditNote.id}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Print Credit Note {lastCreditNote.creditNoteNo}
              </Button>
            )}
            {lastDebitNote && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.open(
                    `/print/debit-notes/${lastDebitNote.id}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Print Debit Note {lastDebitNote.debitNoteNo}
              </Button>
            )}
            {lastTransfer && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/print/stock-transfers/${lastTransfer.id}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Print Draft {lastTransfer.transferNo}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      "/operations/transfers",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Manage Transfers
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, l, I]) => (
          <Button
            key={k}
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k as Tab)}
          >
            <I className="h-4 w-4" />
            {l}
          </Button>
        ))}
      </div>

      {tab === "receipts" && (
        <FormCard title="Receive Customer Payment" onSubmit={submitReceipt}>
          <SelectField
            label="Customer"
            value={receipt.customerId}
            onChange={(v) => setReceipt({ ...receipt, customerId: v })}
            options={customers.map((x) => ({
              value: String(x.id),
              label: `${x.name} — Due ₹${Number(x.dueAmount).toFixed(2)}`,
            }))}
          />
          <Field label="Amount">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={receipt.amount}
              onChange={(e) =>
                setReceipt({ ...receipt, amount: e.target.value })
              }
            />
          </Field>
          <PaymentFields value={receipt} setValue={setReceipt} />
          <Field label="Note">
            <Input
              value={receipt.note}
              onChange={(e) => setReceipt({ ...receipt, note: e.target.value })}
            />
          </Field>
          <Submit loading={loading} />
        </FormCard>
      )}

      {tab === "supplier-payments" && (
        <>
          <FormCard title="Pay Supplier" onSubmit={submitSupplierPayment}>
            <SelectField
              label="Supplier"
              value={spay.supplierId}
              onChange={(v) => setSpay({ ...spay, supplierId: v })}
              options={suppliers.map((x) => ({
                value: String(x.id),
                label: x.name,
              }))}
            />
            <div className="rounded-md border p-3 text-sm">
              <span className="text-muted-foreground">Calculated payable</span>
              <div className="text-lg font-semibold">
                ₹{supplierOutstanding.toFixed(2)}
              </div>
            </div>
            <Field label="Amount">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={spay.amount}
                onChange={(e) => setSpay({ ...spay, amount: e.target.value })}
              />
            </Field>
            <PaymentFields value={spay} setValue={setSpay} />
            <Field label="Note">
              <Input
                value={spay.note}
                onChange={(e) => setSpay({ ...spay, note: e.target.value })}
              />
            </Field>
            <Submit loading={loading} />
          </FormCard>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={!spay.supplierId}
              onClick={() =>
                window.open(
                  `/operations/supplier-ledger?supplierId=${spay.supplierId}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Open Selected Supplier Ledger
            </Button>
          </div>
        </>
      )}

      {tab === "adjustments" && (
        <FormCard title="Stock Adjustment" onSubmit={submitAdjustment}>
          <SelectField
            label="Batch"
            value={adjust.batchId}
            onChange={(v) => setAdjust({ ...adjust, batchId: v })}
            options={batches.map((x) => ({
              value: String(x.id),
              label: `${x.name} / ${x.batchNo} — Qty ${x.qty}`,
            }))}
          />
          <Field label="Quantity change (+/-)">
            <Input
              type="number"
              required
              value={adjust.qtyChange}
              onChange={(e) =>
                setAdjust({ ...adjust, qtyChange: e.target.value })
              }
            />
          </Field>
          <SelectField
            label="Reason"
            value={adjust.reason}
            onChange={(v) => setAdjust({ ...adjust, reason: v })}
            options={[
              "PHYSICAL_COUNT",
              "DAMAGE",
              "EXPIRY",
              "BREAKAGE",
              "LOSS",
              "CORRECTION",
              "OTHER",
            ].map((x) => ({ value: x, label: x.replaceAll("_", " ") }))}
          />
          <Field label="Note">
            <Input
              value={adjust.note}
              onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
            />
          </Field>
          <Submit loading={loading} />
        </FormCard>
      )}

      {tab === "transfers" && (
        <>
          <FormCard
            title="Create Inter-Branch Transfer Draft"
            onSubmit={submitTransfer}
          >
            <SelectField
              label="Destination"
              value={transfer.toBranchId}
              onChange={(v) => setTransfer({ ...transfer, toBranchId: v })}
              options={branches
                .filter((x) => !x.current)
                .map((x) => ({
                  value: String(x.id),
                  label: `${x.name} (${x.code})`,
                }))}
            />
            <SelectField
              label="Batch"
              value={transfer.batchId}
              onChange={(v) => setTransfer({ ...transfer, batchId: v })}
              options={batches.map((x) => ({
                value: String(x.id),
                label: `${x.name} / ${x.batchNo} — Qty ${x.qty}`,
              }))}
            />
            <Field label="Quantity">
              <Input
                type="number"
                min="1"
                required
                value={transfer.qty}
                onChange={(e) =>
                  setTransfer({ ...transfer, qty: e.target.value })
                }
              />
            </Field>
            <Field label="Note">
              <Input
                value={transfer.note}
                onChange={(e) =>
                  setTransfer({ ...transfer, note: e.target.value })
                }
              />
            </Field>
            <Submit loading={loading} />
          </FormCard>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(
                  "/operations/transfers",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Open Transfer Queue
            </Button>
          </div>
        </>
      )}

      {tab === "sales-return" && (
        <FormCard
          title="Sales Return / Credit Note"
          onSubmit={submitSaleReturn}
        >
          <SelectField
            label="Invoice"
            value={saleReturn.saleId}
            onChange={(v) =>
              setSaleReturn({ ...saleReturn, saleId: v, saleItemId: "" })
            }
            options={sales
              .filter((x) => !x.isCancelled)
              .map((x) => ({
                value: String(x.id),
                label: `${x.billNo} — ${x.customer?.name || "Walk-in"} — ₹${Number(x.netAmount).toFixed(2)}`,
              }))}
          />
          <SelectField
            label="Item"
            value={saleReturn.saleItemId}
            onChange={(v) => setSaleReturn({ ...saleReturn, saleItemId: v })}
            options={(selectedSale?.items || []).map((x: any) => ({
              value: String(x.id),
              label: `${x.batch?.product?.name || "Item"} / ${x.batch?.batchNo || ""} — Sold ${x.qty}`,
            }))}
          />
          <Field label="Return Qty">
            <Input
              type="number"
              min="1"
              required
              value={saleReturn.qty}
              onChange={(e) =>
                setSaleReturn({ ...saleReturn, qty: e.target.value })
              }
            />
          </Field>
          <Field label="Reason">
            <Input
              required
              value={saleReturn.reason}
              onChange={(e) =>
                setSaleReturn({ ...saleReturn, reason: e.target.value })
              }
            />
          </Field>
          <SelectField
            label="Refund Mode"
            value={saleReturn.refundMode}
            onChange={(v) => setSaleReturn({ ...saleReturn, refundMode: v })}
            options={paymentModes.map((x) => ({
              value: x,
              label: x.replaceAll("_", " "),
            }))}
          />
          <Field label="Reference">
            <Input
              value={saleReturn.reference}
              onChange={(e) =>
                setSaleReturn({ ...saleReturn, reference: e.target.value })
              }
            />
          </Field>
          <Submit loading={loading} />
        </FormCard>
      )}

      {tab === "purchase-return" && (
        <FormCard
          title="Purchase Return / Debit Note"
          onSubmit={submitPurchaseReturn}
        >
          <SelectField
            label="Purchase"
            value={purchaseReturn.purchaseId}
            onChange={(v) =>
              setPurchaseReturn({
                ...purchaseReturn,
                purchaseId: v,
                purchaseItemId: "",
              })
            }
            options={purchases
              .filter((x) => !x.isCancelled)
              .map((x) => ({
                value: String(x.id),
                label: `${x.grnNo || x.invoiceNo} — ${x.supplier?.name || ""} — ₹${Number(x.netAmount).toFixed(2)}`,
              }))}
          />
          <SelectField
            label="Item"
            value={purchaseReturn.purchaseItemId}
            onChange={(v) =>
              setPurchaseReturn({ ...purchaseReturn, purchaseItemId: v })
            }
            options={(selectedPurchase?.items || []).map((x: any) => ({
              value: String(x.id),
              label: `${x.product?.name || "Item"} / ${x.batchNo} — Received ${x.qty + x.freeQty}`,
            }))}
          />
          <Field label="Return Qty">
            <Input
              type="number"
              min="1"
              required
              value={purchaseReturn.qty}
              onChange={(e) =>
                setPurchaseReturn({ ...purchaseReturn, qty: e.target.value })
              }
            />
          </Field>
          <Field label="Reason">
            <Input
              required
              value={purchaseReturn.reason}
              onChange={(e) =>
                setPurchaseReturn({ ...purchaseReturn, reason: e.target.value })
              }
            />
          </Field>
          <Submit loading={loading} />
        </FormCard>
      )}

      {tab === "ledger" && (
        <Card>
          <CardHeader>
            <CardTitle>Stock Movement Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Date</th>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Movement</th>
                    <th className="text-right">Change</th>
                    <th className="text-right">Balance</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((x) => (
                    <tr key={x.id} className="border-b">
                      <td className="p-2">
                        {new Date(x.txnDate).toLocaleString("en-IN")}
                      </td>
                      <td>{x.product}</td>
                      <td>{x.batchNo}</td>
                      <td>{x.movementType}</td>
                      <td className="text-right">
                        {x.qtyChange > 0 ? "+" : ""}
                        {x.qtyChange}
                      </td>
                      <td className="text-right">{x.balanceAfter}</td>
                      <td>
                        {x.referenceType || "—"} {x.referenceId || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ledger.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No ledger movements yet. New transactions and operations will
                  populate this ledger.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FormCard({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {children}
        </form>
      </CardContent>
    </Card>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select
        required
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
function PaymentFields({
  value,
  setValue,
}: {
  value: any;
  setValue: (v: any) => void;
}) {
  return (
    <>
      <SelectField
        label="Mode"
        value={value.mode}
        onChange={(v) => setValue({ ...value, mode: v })}
        options={paymentModes.map((x) => ({
          value: x,
          label: x.replaceAll("_", " "),
        }))}
      />
      <Field label="Reference">
        <Input
          value={value.reference}
          onChange={(e) => setValue({ ...value, reference: e.target.value })}
        />
      </Field>
    </>
  );
}
function Submit({ loading }: { loading: boolean }) {
  return (
    <div className="flex items-end">
      <Button disabled={loading} type="submit">
        {loading ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
