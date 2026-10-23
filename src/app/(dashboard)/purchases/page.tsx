"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Pencil, Plus, Printer, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

type Line = {
  productId: string;
  batchNo: string;
  expiryDate: string;

  qty: string;
  freeQty: string;

  mrp: string;
  costPrice: string;
  sellPrice: string;

  discountPercent: string;
  taxPercent: string;
};

function blankLine(): Line {
  return {
    productId: "",
    batchNo: "",
    expiryDate: "",

    qty: "1",
    freeQty: "0",

    mrp: "0",
    costPrice: "0",
    sellPrice: "0",

    discountPercent: "0",
    taxPercent: "0",
  };
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<any[]>([]);

  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [products, setProducts] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");

  const [invoiceNo, setInvoiceNo] = useState("");

  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const [cash, setCash] = useState("0");

  const [upi, setUpi] = useState("0");

  const [card, setCard] = useState("0");

  const [bank, setBank] = useState("0");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  async function load() {
    const [purchasesResponse, suppliersResponse, productsResponse] =
      await Promise.all([
        fetch("/api/purchases", {
          cache: "no-store",
        }),

        fetch("/api/suppliers", {
          cache: "no-store",
        }),

        fetch("/api/products?status=active", {
          cache: "no-store",
        }),
      ]);

    if (purchasesResponse.ok) {
      setRows(await purchasesResponse.json());
    }

    if (suppliersResponse.ok) {
      setSuppliers(await suppliersResponse.json());
    }

    if (productsResponse.ok) {
      setProducts(await productsResponse.json());
    }
  }

  useEffect(() => {
    load();
  }, []);

  const estimatedTotal = useMemo(() => {
    return lines.reduce((total, line) => {
      const gross = Number(line.costPrice) * Number(line.qty);

      const discount = (gross * Number(line.discountPercent)) / 100;

      const taxable = gross - discount;

      const tax = (taxable * Number(line.taxPercent)) / 100;

      return total + taxable + tax;
    }, 0);
  }, [lines]);

  function updateLine(index: number, key: keyof Line, value: string) {
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

  function chooseProduct(index: number, value: string) {
    const product = products.find((item) => item.id === Number(value));

    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,

              productId: value,

              taxPercent: String(product?.defaultTaxPercent ?? 0),
            }
          : line,
      ),
    );
  }

  function resetForm() {
    setEditId(null);

    setSupplierId("");

    setInvoiceNo("");

    setInvoiceDate(new Date().toISOString().slice(0, 10));

    setLines([blankLine()]);

    setCash("0");
    setUpi("0");
    setCard("0");
    setBank("0");

    setError("");
  }

  function newPurchase() {
    resetForm();

    setShowForm(true);
  }

  async function editPurchase(id: string) {
    setError("");

    const response = await fetch(`/api/purchases/${id}`, {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Unable to load purchase");

      return;
    }

    setEditId(id);

    setSupplierId(String(data.supplierId));

    setInvoiceNo(data.invoiceNo);

    setInvoiceDate(new Date(data.invoiceDate).toISOString().slice(0, 10));

    setLines(
      data.items.map((item: any) => ({
        productId: String(item.productId),

        batchNo: item.batchNo,

        expiryDate: item.expiryDate
          ? new Date(item.expiryDate).toISOString().slice(0, 10)
          : "",

        qty: String(item.qty),

        freeQty: String(item.freeQty),

        mrp: String(item.mrp),

        costPrice: String(item.costPrice),

        sellPrice: String(item.sellPrice),

        discountPercent: String(item.discountPercent),

        taxPercent: String(item.taxPercent),
      })),
    );

    function payment(mode: string) {
      return String(
        data.payments
          .filter((payment: any) => payment.mode === mode)
          .reduce(
            (sum: number, payment: any) => sum + Number(payment.amount),
            0,
          ),
      );
    }

    setCash(payment("CASH"));

    setUpi(payment("UPI"));

    setCard(payment("CARD"));

    setBank(payment("BANK_TRANSFER"));

    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();

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
    ].filter((payment) => payment.amount > 0);

    const payload = {
      supplierId: Number(supplierId),

      invoiceNo,

      invoiceDate,

      items: lines.map((line) => ({
        productId: Number(line.productId),

        batchNo: line.batchNo,

        expiryDate: line.expiryDate || null,

        qty: Number(line.qty),

        freeQty: Number(line.freeQty),

        mrp: Number(line.mrp),

        costPrice: Number(line.costPrice),

        sellPrice: Number(line.sellPrice),

        discountPercent: Number(line.discountPercent),

        taxPercent: Number(line.taxPercent),
      })),

      payments,
    };

    const response = await fetch(
      editId ? `/api/purchases/${editId}` : "/api/purchases",

      {
        method: editId ? "PUT" : "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();

    setSaving(false);

    if (!response.ok) {
      setError(data.error || "Unable to save purchase");

      return;
    }

    resetForm();

    setShowForm(false);

    await load();
  }

  async function cancelPurchase(id: string) {
    const reason = prompt("Cancellation reason?");

    if (!reason) {
      return;
    }

    const response = await fetch(`/api/purchases/${id}`, {
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
      alert(data.error || "Unable to cancel purchase");

      return;
    }

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Purchase & GRN</h2>

          <p className="text-sm text-muted-foreground">
            Receive and edit stock batches, expiry, GST and split payments.
          </p>
        </div>

        <Button onClick={newPurchase}>
          <Plus className="mr-2 h-4 w-4" />
          New Purchase
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {editId ? "Edit Purchase / GRN" : "New Purchase / GRN"}
              </CardTitle>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={save} className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Supplier *</Label>

                  <select
                    required
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    <option value="">Select supplier</option>

                    {suppliers
                      .filter((supplier) => supplier.isActive)
                      .map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <Label>Supplier Invoice *</Label>

                  <Input
                    required
                    value={invoiceNo}
                    onChange={(event) => setInvoiceNo(event.target.value)}
                  />
                </div>

                <div>
                  <Label>Invoice Date</Label>

                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead>
                    <tr className="border-b">
                      <th>Product</th>

                      <th>Batch</th>

                      <th>Expiry</th>

                      <th>Qty</th>

                      <th>Free</th>

                      <th>Cost</th>

                      <th>MRP</th>

                      <th>Sell</th>

                      <th>Disc%</th>

                      <th>GST%</th>

                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index}>
                        <td>
                          <select
                            required
                            className="h-9 w-52 rounded border bg-background"
                            value={line.productId}
                            onChange={(event) =>
                              chooseProduct(index, event.target.value)
                            }
                          >
                            <option value="">Select</option>

                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <Input
                            required
                            className="w-28"
                            value={line.batchNo}
                            onChange={(event) =>
                              updateLine(index, "batchNo", event.target.value)
                            }
                          />
                        </td>

                        <td>
                          <Input
                            type="date"
                            className="w-36"
                            value={line.expiryDate}
                            onChange={(event) =>
                              updateLine(
                                index,
                                "expiryDate",
                                event.target.value,
                              )
                            }
                          />
                        </td>

                        {(
                          [
                            "qty",
                            "freeQty",
                            "costPrice",
                            "mrp",
                            "sellPrice",
                            "discountPercent",
                            "taxPercent",
                          ] as (keyof Line)[]
                        ).map((key) => (
                          <td key={key}>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-20"
                              value={line[key]}
                              onChange={(event) =>
                                updateLine(index, key, event.target.value)
                              }
                            />
                          </td>
                        ))}

                        <td>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
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
                onClick={() => setLines((current) => [...current, blankLine()])}
              >
                Add Line
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
                  <Label>Bank Transfer</Label>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bank}
                    onChange={(event) => setBank(event.target.value)}
                  />
                </div>

                <div className="self-end text-lg font-semibold">
                  Total ₹{estimatedTotal.toFixed(2)}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editId
                      ? "Update Purchase"
                      : "Post Purchase"}
                </Button>

                {editId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();

                      setShowForm(false);
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Date</th>

                  <th>GRN</th>

                  <th>Supplier Invoice</th>

                  <th>Supplier</th>

                  <th>Items</th>

                  <th className="text-right">Net</th>

                  <th className="text-right">Paid</th>

                  <th className="text-right">Due</th>

                  <th>Status</th>

                  <th className="text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((purchase) => (
                  <tr className="border-b" key={purchase.id}>
                    <td className="p-2">
                      {new Date(purchase.invoiceDate).toLocaleDateString()}
                    </td>

                    <td className="font-medium">{purchase.grnNo || "—"}</td>

                    <td>{purchase.invoiceNo}</td>

                    <td>{purchase.supplier.name}</td>

                    <td>{purchase._count.items}</td>

                    <td className="text-right">
                      ₹{purchase.netAmount.toFixed(2)}
                    </td>

                    <td className="text-right">
                      ₹{purchase.paidAmount.toFixed(2)}
                    </td>

                    <td className="text-right">
                      ₹{purchase.dueAmount.toFixed(2)}
                    </td>

                    <td>{purchase.isCancelled ? "Cancelled" : "Posted"}</td>

                    <td>
                      {!purchase.isCancelled && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editPurchase(purchase.id)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                `/print/purchases/${purchase.id}`,
                                "_blank",
                              )
                            }
                          >
                            <Printer className="mr-1 h-4 w-4" />
                            Print
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelPurchase(purchase.id)}
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
