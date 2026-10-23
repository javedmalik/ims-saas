"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Pencil, Plus, Search, Trash2, X, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

type EditLine = {
  batchId: string;
  qty: string;
  rate: string;
  discountPercent: string;
};

export default function SalesPage() {
  const [rows, setRows] = useState<any[]>([]);

  const [query, setQuery] = useState("");

  const [posData, setPosData] = useState<any>({
    customers: [],
    batches: [],
    branch: {},
  });

  const [editId, setEditId] = useState<string | null>(null);

  const [editBillNo, setEditBillNo] = useState("");

  const [customerId, setCustomerId] = useState("");

  const [lines, setLines] = useState<EditLine[]>([]);

  const [extraBatches, setExtraBatches] = useState<any[]>([]);

  const [cash, setCash] = useState("0");

  const [upi, setUpi] = useState("0");

  const [card, setCard] = useState("0");

  const [bank, setBank] = useState("0");

  const [credit, setCredit] = useState("0");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/sales?search=${encodeURIComponent(query)}`,
      {
        cache: "no-store",
      },
    );

    if (response.ok) {
      setRows(await response.json());
    }
  }, [query]);

  async function loadPosData() {
    const response = await fetch("/api/pos", {
      cache: "no-store",
    });

    if (response.ok) {
      setPosData(await response.json());
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 200);

    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    loadPosData();
  }, []);

  const posted = rows.filter((sale) => !sale.isCancelled);

  const salesTotal = useMemo(
    () => posted.reduce((total, sale) => total + sale.netAmount, 0),
    [posted],
  );

  const dueTotal = useMemo(
    () => posted.reduce((total, sale) => total + sale.dueAmount, 0),
    [posted],
  );

  const availableBatches = useMemo(() => {
    const map = new Map<number, any>();

    for (const batch of posData.batches || []) {
      map.set(batch.id, batch);
    }

    for (const batch of extraBatches) {
      map.set(batch.id, batch);
    }

    return Array.from(map.values());
  }, [posData.batches, extraBatches]);

  const estimatedTotal = useMemo(() => {
    return lines.reduce((total, line) => {
      const batch = availableBatches.find(
        (item) => item.id === Number(line.batchId),
      );

      const taxPercent = Number(batch?.taxPercent ?? 0);

      const gross = Number(line.rate) * Number(line.qty);

      const afterDiscount = gross * (1 - Number(line.discountPercent) / 100);

      if (posData.branch?.pricesIncludeTax) {
        return total + afterDiscount;
      }

      return total + afterDiscount * (1 + taxPercent / 100);
    }, 0);
  }, [lines, availableBatches, posData.branch]);

  function paymentAmount(payments: any[], mode: string) {
    return String(
      payments
        .filter((payment) => payment.mode === mode)
        .reduce((total, payment) => total + Number(payment.amount), 0),
    );
  }

  async function editSale(id: string) {
    setError("");

    const response = await fetch(`/api/sales/${id}`, {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Unable to load sale");

      return;
    }

    setEditId(id);

    setEditBillNo(data.billNo);

    setCustomerId(data.customerId ? String(data.customerId) : "");

    const historicalBatches = data.items.map((item: any) => ({
      id: item.batch.id,

      productId: item.batch.productId,

      name: item.batch.product.name,

      sku: item.batch.product.sku,

      unit: item.batch.product.unit,

      batchNo: item.batch.batchNo,

      expiryDate: item.batch.expiryDate,

      qty: item.batch.currentQty + item.qty,

      mrp: item.batch.mrp,

      sellPrice: item.batch.sellPrice,

      taxPercent: Number(item.batch.product.defaultTaxPercent),
    }));

    setExtraBatches(historicalBatches);

    setLines(
      data.items.map((item: any) => ({
        batchId: String(item.batchId),

        qty: String(item.qty),

        rate: String(item.rate),

        discountPercent: String(item.discountPercent),
      })),
    );

    setCash(paymentAmount(data.payments, "CASH"));

    setUpi(paymentAmount(data.payments, "UPI"));

    setCard(paymentAmount(data.payments, "CARD"));

    setBank(paymentAmount(data.payments, "BANK_TRANSFER"));

    setCredit(paymentAmount(data.payments, "CREDIT"));

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeEditor() {
    setEditId(null);
    setEditBillNo("");

    setCustomerId("");

    setLines([]);

    setExtraBatches([]);

    setCash("0");
    setUpi("0");
    setCard("0");
    setBank("0");
    setCredit("0");

    setError("");
  }

  function updateLine(index: number, key: keyof EditLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: value,
            }
          : line,
      ),
    );
  }

  function chooseBatch(index: number, batchId: string) {
    const batch = availableBatches.find((item) => item.id === Number(batchId));

    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,

              batchId,

              rate: String(batch?.sellPrice ?? 0),
            }
          : line,
      ),
    );
  }

  async function updateSale(event: FormEvent) {
    event.preventDefault();

    if (!editId) {
      return;
    }

    setSaving(true);
    setError("");

    const payments = [
      {
        mode: "CASH",
        amount: Number(cash),
      },

      {
        mode: "UPI",
        amount: Number(upi),
      },

      {
        mode: "CARD",
        amount: Number(card),
      },

      {
        mode: "BANK_TRANSFER",
        amount: Number(bank),
      },

      {
        mode: "CREDIT",
        amount: Number(credit),
      },
    ].filter((payment) => payment.amount > 0);

    const response = await fetch(`/api/sales/${editId}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        customerId: customerId ? Number(customerId) : null,

        items: lines.map((line) => ({
          batchId: Number(line.batchId),

          qty: Number(line.qty),

          rate: Number(line.rate),

          discountPercent: Number(line.discountPercent),
        })),

        payments,
      }),
    });

    const data = await response.json();

    setSaving(false);

    if (!response.ok) {
      setError(data.error || "Unable to update sale");

      return;
    }

    closeEditor();

    await Promise.all([load(), loadPosData()]);
  }

  async function cancelSale(id: string) {
    const reason = prompt("Cancellation reason?");

    if (!reason) {
      return;
    }

    const response = await fetch(`/api/sales/${id}`, {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "cancel",

        reason,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Unable to cancel sale");

      return;
    }

    await Promise.all([load(), loadPosData()]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Sales & Billing History</h2>

        <p className="text-sm text-muted-foreground">
          View, edit and cancel sales while maintaining stock, GST, payments and
          customer ledger integrity.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {editId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Edit Sale — {editBillNo}</CardTitle>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeEditor}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={updateSale} className="space-y-5">
              <div>
                <Label>Customer</Label>

                <select
                  className="h-10 w-full max-w-md rounded-md border bg-background px-3"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Walk-in Customer</option>

                  {posData.customers.map((customer: any) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.mobile ? ` - ${customer.mobile}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th>Item / Batch</th>

                      <th>Qty</th>

                      <th>Rate</th>

                      <th>Discount %</th>

                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index}>
                        <td>
                          <select
                            required
                            className="h-9 w-80 rounded border bg-background px-2"
                            value={line.batchId}
                            onChange={(event) =>
                              chooseBatch(index, event.target.value)
                            }
                          >
                            <option value="">Select batch</option>

                            {availableBatches.map((batch) => (
                              <option key={batch.id} value={batch.id}>
                                {batch.name} — {batch.batchNo} — Stock{" "}
                                {batch.qty}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <Input
                            required
                            type="number"
                            min="1"
                            className="w-24"
                            value={line.qty}
                            onChange={(event) =>
                              updateLine(index, "qty", event.target.value)
                            }
                          />
                        </td>

                        <td>
                          <Input
                            required
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-28"
                            value={line.rate}
                            onChange={(event) =>
                              updateLine(index, "rate", event.target.value)
                            }
                          />
                        </td>

                        <td>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="w-24"
                            value={line.discountPercent}
                            onChange={(event) =>
                              updateLine(
                                index,
                                "discountPercent",
                                event.target.value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((current) =>
                                current.filter(
                                  (_, lineIndex) => lineIndex !== index,
                                ),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      batchId: "",
                      qty: "1",
                      rate: "0",
                      discountPercent: "0",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>

              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <Label>Cash</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                  />
                </div>

                <div>
                  <Label>UPI</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={upi}
                    onChange={(event) => setUpi(event.target.value)}
                  />
                </div>

                <div>
                  <Label>Card</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={card}
                    onChange={(event) => setCard(event.target.value)}
                  />
                </div>

                <div>
                  <Label>Bank</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bank}
                    onChange={(event) => setBank(event.target.value)}
                  />
                </div>

                <div>
                  <Label>Credit</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={credit}
                    onChange={(event) => setCredit(event.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-md bg-secondary p-3">
                <div className="text-sm text-muted-foreground">
                  Estimated Bill Total
                </div>

                <div className="text-2xl font-semibold">
                  ₹{estimatedTotal.toFixed(2)}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Updating..." : "Update Sale"}
                </Button>

                <Button type="button" variant="outline" onClick={closeEditor}>
                  Cancel Edit
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Posted Bills</CardTitle>
          </CardHeader>

          <CardContent className="text-2xl font-semibold">
            {posted.length}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Sales</CardTitle>
          </CardHeader>

          <CardContent className="text-2xl font-semibold">
            ₹{salesTotal.toFixed(2)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credit Outstanding</CardTitle>
          </CardHeader>

          <CardContent className="text-2xl font-semibold">
            ₹{dueTotal.toFixed(2)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4" />

            <Input
              className="pl-9"
              placeholder="Search bill number or customer"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Bill</th>

                  <th>Date</th>

                  <th>Customer</th>

                  <th>Items</th>

                  <th>Payment</th>

                  <th className="text-right">GST</th>

                  <th className="text-right">Net</th>

                  <th className="text-right">Received</th>

                  <th className="text-right">Due</th>

                  <th>Status</th>

                  <th className="text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((sale) => (
                  <tr className="border-b" key={sale.id}>
                    <td className="p-2 font-medium">{sale.billNo}</td>

                    <td>{new Date(sale.billDateTime).toLocaleString()}</td>

                    <td>{sale.customer?.name || "Walk-in"}</td>

                    <td>{sale._count.items}</td>

                    <td>{sale.paymentMode}</td>

                    <td className="text-right">
                      ₹
                      {(
                        sale.totalCgst +
                        sale.totalSgst +
                        sale.totalIgst
                      ).toFixed(2)}
                    </td>

                    <td className="text-right">₹{sale.netAmount.toFixed(2)}</td>

                    <td className="text-right">
                      ₹{sale.receivedAmount.toFixed(2)}
                    </td>

                    <td className="text-right">₹{sale.dueAmount.toFixed(2)}</td>

                    <td>{sale.isCancelled ? "Cancelled" : "Posted"}</td>

                    <td>
                      {!sale.isCancelled && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editSale(sale.id)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(`/print/sales/${sale.id}`, "_blank")
                            }
                          >
                            <Printer className="mr-1 h-4 w-4" />
                            Print
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelSale(sale.id)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
