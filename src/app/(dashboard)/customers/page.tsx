"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Edit3, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Customer = {
  id: number;
  name: string;
  mobile: string | null;
  address: string | null;
  referredBy: string | null;
  taxId: string | null;
  state: string | null;
  stateCode: string | null;
  isActive: boolean;
  dueAmount: number;
};

type CustomerForm = {
  name: string;
  mobile: string;
  address: string;
  referredBy: string;
  taxId: string;
  state: string;
  stateCode: string;
  isActive: boolean;
};

type CustomerTextFieldKey = Exclude<keyof CustomerForm, "isActive">;

type CustomerField = {
  label: string;
  key: CustomerTextFieldKey;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  mobile: "",
  address: "",
  referredBy: "",
  taxId: "",
  state: "",
  stateCode: "",
  isActive: true,
};

const CUSTOMER_FIELDS: CustomerField[] = [
  { label: "Name *", key: "name" },
  { label: "Mobile", key: "mobile" },
  { label: "GSTIN / Tax ID", key: "taxId" },
  { label: "State", key: "state" },
  { label: "GST state code", key: "stateCode" },
  { label: "Referred by", key: "referredBy" },
  { label: "Address", key: "address" },
];

export default function Page() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [edit, setEdit] = useState<number | null>(null);
  const [show, setShow] = useState(false);
  const [ledger, setLedger] = useState<any | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/customers?search=${encodeURIComponent(q)}`, {
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

  function start(customer?: Customer) {
    if (customer) {
      setEdit(customer.id);
      setForm({
        name: customer.name,
        mobile: customer.mobile || "",
        address: customer.address || "",
        referredBy: customer.referredBy || "",
        taxId: customer.taxId || "",
        state: customer.state || "",
        stateCode: customer.stateCode || "",
        isActive: customer.isActive,
      });
    } else {
      setEdit(null);
      setForm({ ...EMPTY_FORM });
    }

    setShow(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();

    const r = await fetch(edit ? `/api/customers/${edit}` : "/api/customers", {
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

    setShow(false);
    await load();
  }

  async function openLedger(id: number) {
    const r = await fetch(`/api/customers/${id}`, {
      cache: "no-store",
    });

    setLedger(await r.json());
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h2 className="text-xl font-semibold">Customers</h2>
          <p className="text-sm text-muted-foreground">
            Customer GST profile, credit balance and ledger.
          </p>
        </div>

        <Button onClick={() => start()}>
          <Plus className="h-4 w-4" />
          Add customer
        </Button>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {show && (
        <Card>
          <CardHeader>
            <CardTitle>{edit ? "Edit customer" : "New customer"}</CardTitle>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={save}
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
              {CUSTOMER_FIELDS.map(({ label, key }) => (
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
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4" />

            <Input
              className="pl-9"
              placeholder="Search name, mobile or GSTIN"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Customer</th>
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rows.map((customer) => (
                  <tr className="border-b" key={customer.id}>
                    <td className="p-2 font-medium">{customer.name}</td>
                    <td>{customer.mobile || "—"}</td>
                    <td>{customer.taxId || "—"}</td>
                    <td className="font-medium">
                      ₹{Number(customer.dueAmount).toFixed(2)}
                    </td>
                    <td>{customer.isActive ? "Active" : "Inactive"}</td>
                    <td className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLedger(customer.id)}
                      >
                        Ledger
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => start(customer)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {ledger && (
        <Card>
          <CardHeader>
            <div className="flex justify-between">
              <CardTitle>{ledger.name} — Ledger</CardTitle>

              <Button variant="outline" onClick={() => setLedger(null)}>
                Close
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            <p className="mb-3 font-medium">
              Outstanding: ₹{Number(ledger.dueAmount).toFixed(2)}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th>Date</th>
                  <th>Note</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>

              <tbody>
                {ledger.ledger?.map((entry: any) => (
                  <tr className="border-b" key={entry.id}>
                    <td className="py-2">
                      {new Date(entry.txnDate).toLocaleString()}
                    </td>
                    <td>{entry.note}</td>
                    <td>₹{Number(entry.debit).toFixed(2)}</td>
                    <td>₹{Number(entry.credit).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
