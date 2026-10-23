"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Supplier = {
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
  isActive: boolean;
};

type SupplierForm = {
  name: string;
  contactPerson: string;
  mobile: string;
  phone: string;
  taxId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  isActive: boolean;
};

type SupplierTextFieldKey = Exclude<keyof SupplierForm, "isActive">;

type SupplierField = {
  label: string;
  key: SupplierTextFieldKey;
};

const EMPTY_FORM: SupplierForm = {
  name: "",
  contactPerson: "",
  mobile: "",
  phone: "",
  taxId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
  isActive: true,
};

const SUPPLIER_FIELDS: SupplierField[] = [
  { label: "Name *", key: "name" },
  { label: "Contact person", key: "contactPerson" },
  { label: "Mobile", key: "mobile" },
  { label: "Phone", key: "phone" },
  { label: "GSTIN / Tax ID", key: "taxId" },
  { label: "Address line 1", key: "addressLine1" },
  { label: "Address line 2", key: "addressLine2" },
  { label: "City", key: "city" },
  { label: "State", key: "state" },
  { label: "GST state code", key: "stateCode" },
  { label: "PIN", key: "pincode" },
];

export default function Page() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [edit, setEdit] = useState<number | null>(null);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/suppliers?search=${encodeURIComponent(q)}`, {
      cache: "no-store",
    });
    const d = await r.json();

    if (r.ok) {
      setRows(d);
    } else {
      setErr(d.error);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function start(supplier?: Supplier) {
    if (supplier) {
      setEdit(supplier.id);
      setForm({
        name: supplier.name,
        contactPerson: supplier.contactPerson || "",
        mobile: supplier.mobile || "",
        phone: supplier.phone || "",
        taxId: supplier.taxId || "",
        addressLine1: supplier.addressLine1 || "",
        addressLine2: supplier.addressLine2 || "",
        city: supplier.city || "",
        state: supplier.state || "",
        stateCode: supplier.stateCode || "",
        pincode: supplier.pincode || "",
        isActive: supplier.isActive,
      });
    } else {
      setEdit(null);
      setForm({ ...EMPTY_FORM });
    }

    setShow(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");

    const r = await fetch(edit ? `/api/suppliers/${edit}` : "/api/suppliers", {
      method: edit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const d = await r.json();

    if (!r.ok) {
      setErr(d.error);
      return;
    }

    setMsg(edit ? "Supplier updated." : "Supplier created.");
    setShow(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h2 className="text-xl font-semibold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            Manage vendors used in Purchase & GRN.
          </p>
        </div>

        <Button onClick={() => start()}>
          <Plus className="h-4 w-4" />
          Add supplier
        </Button>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {msg && <p className="rounded border p-3 text-sm">{msg}</p>}

      {show && (
        <Card>
          <CardHeader>
            <CardTitle>{edit ? "Edit supplier" : "New supplier"}</CardTitle>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={save}
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
              {SUPPLIER_FIELDS.map(({ label, key }) => (
                <div className="space-y-1" key={key}>
                  <Label>{label}</Label>

                  <Input
                    required={key === "name"}
                    maxLength={key === "stateCode" ? 2 : undefined}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}

              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      isActive: e.target.checked,
                    }))
                  }
                />
                Active
              </label>

              <div className="flex items-end gap-2">
                <Button type="submit">Save</Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShow(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4" />

              <Input
                className="pl-9"
                placeholder="Search supplier, mobile or GSTIN"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Supplier</th>
                  <th>Contact</th>
                  <th>GSTIN</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rows.map((supplier) => (
                  <tr className="border-b" key={supplier.id}>
                    <td className="p-2 font-medium">{supplier.name}</td>
                    <td>{supplier.mobile || supplier.phone || "—"}</td>
                    <td>{supplier.taxId || "—"}</td>
                    <td>
                      {[supplier.city, supplier.state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td>{supplier.isActive ? "Active" : "Inactive"}</td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => start(supplier)}
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </Button>
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
