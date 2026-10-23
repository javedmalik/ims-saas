"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, PackagePlus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UNITS = ["pcs", "box", "strip", "pack", "kg", "gm", "ltr", "ml", "meter", "pair", "set"];
const TAX_RATES = [0, 5, 12, 18, 28];

type Product = {
  id: number;
  name: string;
  sku: string | null;
  brand: string | null;
  variant: string | null;
  category: string | null;
  unit: string;
  hsnCode: string | null;
  defaultTaxPercent: number;
  reorderLevel: number;
  isActive: boolean;
  stockQty: number;
  batchCount: number;
};

type ProductForm = {
  name: string;
  sku: string;
  brand: string;
  variant: string;
  category: string;
  unit: string;
  hsnCode: string;
  defaultTaxPercent: string;
  reorderLevel: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductForm = {
  name: "",
  sku: "",
  brand: "",
  variant: "",
  category: "",
  unit: "pcs",
  hsnCode: "",
  defaultTaxPercent: "0",
  reorderLevel: "0",
  isActive: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status });
      if (search.trim()) qs.set("search", search.trim());
      const response = await fetch(`/api/products?${qs.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load products");
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const id = window.setTimeout(loadProducts, 250);
    return () => window.clearTimeout(id);
  }, [loadProducts]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.stockQty <= p.reorderLevel).length,
    [products]
  );

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      brand: product.brand ?? "",
      variant: product.variant ?? "",
      category: product.category ?? "",
      unit: product.unit,
      hsnCode: product.hsnCode ?? "",
      defaultTaxPercent: String(product.defaultTaxPercent),
      reorderLevel: String(product.reorderLevel),
      isActive: product.isActive,
    });
    setShowForm(true);
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        ...form,
        sku: form.sku.trim() || null,
        brand: form.brand.trim() || null,
        variant: form.variant.trim() || null,
        category: form.category.trim() || null,
        hsnCode: form.hsnCode.trim() || null,
        defaultTaxPercent: Number(form.defaultTaxPercent || 0),
        reorderLevel: Number(form.reorderLevel || 0),
      };
      const response = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save product");
      setMessage(editingId ? "Item updated successfully." : "Item added successfully.");
      resetForm();
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Visible items</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{products.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Low / reorder stock</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{lowStockCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total stock units</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{products.reduce((sum, p) => sum + p.stockQty, 0)}</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Items Master</h2>
          <p className="text-sm text-muted-foreground">Generic product catalogue with HSN/GST and reorder controls.</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm((v) => !v); }}>
          <PackagePlus className="h-4 w-4" /> Add item
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editingId ? "Edit item" : "Add new item"}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Item name *"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="SKU / Barcode"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
              <Field label="Brand / Manufacturer"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
              <Field label="Variant / Composition"><Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></Field>
              <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
              <Field label="Unit">
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </Field>
              <Field label="HSN / SAC"><Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} /></Field>
              <Field label="GST %">
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.defaultTaxPercent} onChange={(e) => setForm({ ...form, defaultTaxPercent: e.target.value })}>
                  {TAX_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                </select>
              </Field>
              <Field label="Reorder level"><Input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active item
              </label>
              <div className="flex items-end gap-2 md:col-span-2 lg:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Update item" : "Save item"}</Button>
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      {message && <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">{message}</p>}

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, SKU, brand, category or HSN…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
            </select>
            <Button variant="outline" onClick={loadProducts}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">HSN</th><th className="px-3 py-2 text-right font-medium">GST</th><th className="px-3 py-2 text-right font-medium">Stock</th><th className="px-3 py-2 text-right font-medium">Reorder</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading items…</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No items found.</td></tr>
                ) : products.map((p) => {
                  const low = p.stockQty <= p.reorderLevel;
                  return <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{[p.brand, p.variant].filter(Boolean).join(" • ") || "—"}</div></td>
                    <td className="px-3 py-3">{p.sku || "—"}</td><td className="px-3 py-3">{p.category || "—"}</td><td className="px-3 py-3">{p.hsnCode || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.defaultTaxPercent}%</td>
                    <td className={`px-3 py-3 text-right font-medium tabular-nums ${low ? "text-destructive" : ""}`}>{p.stockQty} {p.unit}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.reorderLevel}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-secondary px-2 py-1 text-xs">{p.isActive ? "Active" : "Inactive"}</span></td>
                    <td className="px-3 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => editProduct(p)}><Edit3 className="h-4 w-4" /> Edit</Button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
