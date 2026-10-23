"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  ImageIcon,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsForm = {
  legalName: string;
  tradeName: string;
  businessType: string;
  pan: string;
  businessEmail: string;
  businessPhone: string;
  website: string;
  currencyCode: string;
  financialYearStartMonth: string;
  branchName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  branchPhone: string;
  branchEmail: string;
  gstin: string;
  invoicePrefix: string;
  purchasePrefix: string;
  creditNotePrefix: string;
  lowStockGlobal: string;
  allowNegativeStock: boolean;
  pricesIncludeTax: boolean;
};

type Meta = {
  tenantId: number;
  businessId: number;
  branchId: number;
  businessCode: string;
  branchCode: string;
};
type Branch = {
  id: number;
  code: string;
  name: string;

  city: string | null;
  state: string | null;
  gstin: string | null;

  logoUrl: string | null;

  isActive: boolean;
};

const EMPTY: SettingsForm = {
  legalName: "",
  tradeName: "",
  businessType: "Retail",
  pan: "",
  businessEmail: "",
  businessPhone: "",
  website: "",
  currencyCode: "INR",
  financialYearStartMonth: "4",
  branchName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
  branchPhone: "",
  branchEmail: "",
  gstin: "",
  invoicePrefix: "INV",
  purchasePrefix: "PUR",
  creditNotePrefix: "CN",
  lowStockGlobal: "10",
  allowNegativeStock: false,
  pricesIncludeTax: true,
};

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchDraft, setBranchDraft] = useState({
    code: "",
    name: "",
    city: "",
    state: "",
    stateCode: "",
    gstin: "",
    invoicePrefix: "INV",
  });
  const [logoUrl, setLogoUrl] = useState("");

  const [brandingFile, setBrandingFile] = useState<File | null>(null);

  const [brandingPreview, setBrandingPreview] = useState<string | null>(null);

  const [uploadingBranding, setUploadingBranding] = useState(false);

  const [brandingMessage, setBrandingMessage] = useState<string | null>(null);
  const [branchLogoFile, setBranchLogoFile] = useState<
    Record<number, File | null>
  >({});

  const [uploadingBranchLogo, setUploadingBranchLogo] = useState<number | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, branchRes, brandingRes] = await Promise.all([
        fetch("/api/settings", {
          cache: "no-store",
        }),

        fetch("/api/branches", {
          cache: "no-store",
        }),

        fetch("/api/branding", {
          cache: "no-store",
        }),
      ]);
      const settings = await settingsRes.json();
      const branchData = await branchRes.json();
      const brandingData = brandingRes.ok ? await brandingRes.json() : null;
      if (!settingsRes.ok)
        throw new Error(settings.error || "Unable to load settings");
      if (!branchRes.ok)
        throw new Error(branchData.error || "Unable to load branches");

      setMeta({
        tenantId: settings.tenantId,
        businessId: settings.businessId,
        branchId: settings.branchId,
        businessCode: settings.businessCode,
        branchCode: settings.branchCode,
      });
      setForm({
        legalName: settings.legalName ?? "",
        tradeName: settings.tradeName ?? "",
        businessType: settings.businessType ?? "",
        pan: settings.pan ?? "",
        businessEmail: settings.businessEmail ?? "",
        businessPhone: settings.businessPhone ?? "",
        website: settings.website ?? "",
        currencyCode: settings.currencyCode ?? "INR",
        financialYearStartMonth: String(settings.financialYearStartMonth ?? 4),
        branchName: settings.branchName ?? "",
        addressLine1: settings.addressLine1 ?? "",
        addressLine2: settings.addressLine2 ?? "",
        city: settings.city ?? "",
        state: settings.state ?? "",
        stateCode: settings.stateCode ?? "",
        pincode: settings.pincode ?? "",
        branchPhone: settings.branchPhone ?? "",
        branchEmail: settings.branchEmail ?? "",
        gstin: settings.gstin ?? "",
        invoicePrefix: settings.invoicePrefix ?? "INV",
        purchasePrefix: settings.purchasePrefix ?? "PUR",
        creditNotePrefix: settings.creditNotePrefix ?? "CN",
        lowStockGlobal: String(settings.lowStockGlobal ?? 10),
        allowNegativeStock: Boolean(settings.allowNegativeStock),
        pricesIncludeTax: Boolean(settings.pricesIncludeTax),
      });
      setBranches(branchData);
      if (brandingData) {
        setLogoUrl(brandingData.logoUrl || "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadBranchLogo(branchId: number) {
    const file = branchLogoFile[branchId];

    if (!file) {
      setError("Please choose a branch logo first.");

      return;
    }

    setError(null);
    setMessage(null);

    setUploadingBranchLogo(branchId);

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(`/api/settings/branches/${branchId}/logo`, {
        method: "POST",

        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to upload branch logo");
      }

      setMessage("Branch logo uploaded successfully.");

      setBranchLogoFile((current) => ({
        ...current,

        [branchId]: null,
      }));

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload branch logo");
    } finally {
      setUploadingBranchLogo(null);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          financialYearStartMonth: Number(form.financialYearStartMonth),
          lowStockGlobal: Number(form.lowStockGlobal),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to save settings");
      setMessage("Business and current branch settings saved successfully.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function uploadBranding() {
    if (!brandingFile) {
      setBrandingMessage("Please choose a logo or banner image.");

      return;
    }

    setUploadingBranding(true);
    setBrandingMessage(null);
    setError(null);

    try {
      const formData = new FormData();

      formData.append("file", brandingFile);

      const response = await fetch("/api/settings/branding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to upload branding image");
      }

      setLogoUrl(data.logoUrl || "");

      setBrandingFile(null);

      setBrandingPreview(null);

      setBrandingMessage("Logo / banner uploaded successfully.");

      await load();
    } catch (e) {
      setBrandingMessage(
        e instanceof Error ? e.message : "Unable to upload branding image",
      );
    } finally {
      setUploadingBranding(false);
    }
  }

  async function addBranch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branchDraft),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to create branch");
      setMessage(
        "Branch created. Assign users/default branch access from Users when that module is completed.",
      );
      setBranchDraft({
        code: "",
        name: "",
        city: "",
        state: "",
        stateCode: "",
        gstin: "",
        invoicePrefix: "INV",
      });
      setShowBranchForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create branch");
    }
  }

  async function toggleBranch(branch: Branch) {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/branches/${branch.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !branch.isActive }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to update branch");
      return;
    }
    setMessage(`Branch ${branch.isActive ? "deactivated" : "activated"}.`);
    await load();
  }

  if (loading)
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          Loading settings…
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Business & Branch Settings</h2>
          <p className="text-sm text-muted-foreground">
            Legal identity is business-wide. GST, invoice series and stock
            policy are maintained per branch.
          </p>
          {meta && (
            <p className="mt-1 text-xs text-muted-foreground">
              Business {meta.businessCode} · Current branch {meta.branchCode}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">
          {message}
        </p>
      )}

      <form onSubmit={saveSettings} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Business identity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Legal business name *">
              <Input
                required
                value={form.legalName}
                onChange={(e) =>
                  setForm({ ...form, legalName: e.target.value })
                }
              />
            </Field>
            <Field label="Trade name">
              <Input
                value={form.tradeName}
                onChange={(e) =>
                  setForm({ ...form, tradeName: e.target.value })
                }
              />
            </Field>
            <Field label="Business type">
              <Input
                placeholder="Retail / Wholesale / Pharmacy"
                value={form.businessType}
                onChange={(e) =>
                  setForm({ ...form, businessType: e.target.value })
                }
              />
            </Field>
            <Field label="PAN">
              <Input
                maxLength={10}
                placeholder="ABCDE1234F"
                value={form.pan}
                onChange={(e) =>
                  setForm({ ...form, pan: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Business email">
              <Input
                type="email"
                value={form.businessEmail}
                onChange={(e) =>
                  setForm({ ...form, businessEmail: e.target.value })
                }
              />
            </Field>
            <Field label="Business phone">
              <Input
                value={form.businessPhone}
                onChange={(e) =>
                  setForm({ ...form, businessPhone: e.target.value })
                }
              />
            </Field>
            <Field label="Website">
              <Input
                placeholder="https://..."
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Input
                maxLength={3}
                value={form.currencyCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currencyCode: e.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <Field label="Financial year starts">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.financialYearStartMonth}
                onChange={(e) =>
                  setForm({ ...form, financialYearStartMonth: e.target.value })
                }
              >
                {[
                  [1, "January"],
                  [4, "April"],
                  [7, "July"],
                  [10, "October"],
                ].map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Invoice & Report Branding
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div>
              <Label>Choose Logo / Banner</Label>

              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;

                  setBrandingFile(file);

                  if (brandingPreview) {
                    URL.revokeObjectURL(brandingPreview);
                  }

                  if (file) {
                    setBrandingPreview(URL.createObjectURL(file));
                  } else {
                    setBrandingPreview(null);
                  }

                  setBrandingMessage(null);
                }}
              />

              <p className="mt-1 text-xs text-muted-foreground">
                Upload PNG, JPG/JPEG or WebP. Maximum size 5 MB. You may upload
                a square company logo or a wide banner.
              </p>
            </div>

            {brandingPreview && (
              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-sm font-medium">
                  Selected Image Preview
                </p>

                <div className="flex justify-center rounded-md bg-white p-4">
                  <img
                    src={brandingPreview}
                    alt="Selected logo or banner preview"
                    className="max-h-40 max-w-full object-contain"
                  />
                </div>
              </div>
            )}

            {logoUrl && (
              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-sm font-medium">
                  Current Logo / Banner
                </p>

                <div className="flex justify-center rounded-md bg-white p-4">
                  <img
                    src={logoUrl}
                    alt="Current company logo or banner"
                    className="max-h-40 max-w-full object-contain"
                  />
                </div>

                <p className="mt-3 break-all text-xs text-muted-foreground">
                  {logoUrl}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={!brandingFile || uploadingBranding}
                onClick={uploadBranding}
              >
                <Upload className="h-4 w-4" />

                {uploadingBranding ? "Uploading..." : "Upload Logo / Banner"}
              </Button>

              {brandingFile && (
                <span className="text-sm text-muted-foreground">
                  {brandingFile.name}
                </span>
              )}
            </div>

            {brandingMessage && (
              <p className="rounded-md border border-border bg-secondary px-4 py-3 text-sm">
                {brandingMessage}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Current branch & GST
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Branch name *">
              <Input
                required
                value={form.branchName}
                onChange={(e) =>
                  setForm({ ...form, branchName: e.target.value })
                }
              />
            </Field>
            <Field label="GSTIN">
              <Input
                maxLength={15}
                placeholder="07ABCDE1234F1Z5"
                value={form.gstin}
                onChange={(e) =>
                  setForm({ ...form, gstin: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
            <Field label="GST state code">
              <Input
                maxLength={2}
                placeholder="07"
                value={form.stateCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stateCode: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Address line 1">
              <Input
                value={form.addressLine1}
                onChange={(e) =>
                  setForm({ ...form, addressLine1: e.target.value })
                }
              />
            </Field>
            <Field label="Address line 2">
              <Input
                value={form.addressLine2}
                onChange={(e) =>
                  setForm({ ...form, addressLine2: e.target.value })
                }
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="PIN code">
              <Input
                maxLength={6}
                value={form.pincode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pincode: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Branch phone">
              <Input
                value={form.branchPhone}
                onChange={(e) =>
                  setForm({ ...form, branchPhone: e.target.value })
                }
              />
            </Field>
            <Field label="Branch email">
              <Input
                type="email"
                value={form.branchEmail}
                onChange={(e) =>
                  setForm({ ...form, branchEmail: e.target.value })
                }
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing & inventory policy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Sales invoice prefix">
              <Input
                value={form.invoicePrefix}
                onChange={(e) =>
                  setForm({ ...form, invoicePrefix: e.target.value })
                }
              />
            </Field>
            <Field label="Purchase prefix">
              <Input
                value={form.purchasePrefix}
                onChange={(e) =>
                  setForm({ ...form, purchasePrefix: e.target.value })
                }
              />
            </Field>
            <Field label="Credit note prefix">
              <Input
                value={form.creditNotePrefix}
                onChange={(e) =>
                  setForm({ ...form, creditNotePrefix: e.target.value })
                }
              />
            </Field>
            <Field label="Default low-stock level">
              <Input
                type="number"
                min="0"
                value={form.lowStockGlobal}
                onChange={(e) =>
                  setForm({ ...form, lowStockGlobal: e.target.value })
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.pricesIncludeTax}
                onChange={(e) =>
                  setForm({ ...form, pricesIncludeTax: e.target.checked })
                }
              />{" "}
              Selling prices include GST
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.allowNegativeStock}
                onChange={(e) =>
                  setForm({ ...form, allowNegativeStock: e.target.checked })
                }
              />{" "}
              Allow negative stock
            </label>
            <div className="md:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />{" "}
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Branches</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                All branches under the current business.
              </p>
            </div>
            <Button onClick={() => setShowBranchForm((v) => !v)}>
              <Plus className="h-4 w-4" /> Add branch
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showBranchForm && (
            <form
              onSubmit={addBranch}
              className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-2 lg:grid-cols-4"
            >
              <Field label="Code *">
                <Input
                  required
                  placeholder="DL02"
                  value={branchDraft.code}
                  onChange={(e) =>
                    setBranchDraft({
                      ...branchDraft,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field label="Branch name *">
                <Input
                  required
                  value={branchDraft.name}
                  onChange={(e) =>
                    setBranchDraft({ ...branchDraft, name: e.target.value })
                  }
                />
              </Field>
              <Field label="City">
                <Input
                  value={branchDraft.city}
                  onChange={(e) =>
                    setBranchDraft({ ...branchDraft, city: e.target.value })
                  }
                />
              </Field>
              <Field label="State">
                <Input
                  value={branchDraft.state}
                  onChange={(e) =>
                    setBranchDraft({ ...branchDraft, state: e.target.value })
                  }
                />
              </Field>
              <Field label="State code">
                <Input
                  maxLength={2}
                  value={branchDraft.stateCode}
                  onChange={(e) =>
                    setBranchDraft({
                      ...branchDraft,
                      stateCode: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </Field>
              <Field label="GSTIN">
                <Input
                  maxLength={15}
                  value={branchDraft.gstin}
                  onChange={(e) =>
                    setBranchDraft({
                      ...branchDraft,
                      gstin: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field label="Invoice prefix">
                <Input
                  value={branchDraft.invoicePrefix}
                  onChange={(e) =>
                    setBranchDraft({
                      ...branchDraft,
                      invoicePrefix: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">Create branch</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBranchForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Logo</th>

                  <th className="py-2 pr-3">Code</th>

                  <th className="py-2 pr-3">Branch</th>

                  <th className="py-2 pr-3">Location</th>

                  <th className="py-2 pr-3">GSTIN</th>

                  <th className="py-2 pr-3">Status</th>

                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    {/* BRANCH LOGO */}
                    <td className="py-3 pr-3">
                      {b.logoUrl ? (
                        <img
                          src={b.logoUrl}
                          alt={`${b.name} logo`}
                          className="h-12 w-16 rounded border bg-white object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-12 w-16 items-center justify-center rounded border bg-secondary text-xs text-muted-foreground">
                          No Logo
                        </div>
                      )}
                    </td>

                    {/* CODE */}
                    <td className="py-3 pr-3 font-mono text-xs">{b.code}</td>

                    {/* BRANCH NAME */}
                    <td className="py-3 pr-3 font-medium">
                      {b.name}

                      {b.id === meta?.branchId && (
                        <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs">
                          Current
                        </span>
                      )}
                    </td>

                    {/* LOCATION */}
                    <td className="py-3 pr-3 text-muted-foreground">
                      {[b.city, b.state].filter(Boolean).join(", ") || "—"}
                    </td>

                    {/* GSTIN */}
                    <td className="py-3 pr-3 font-mono text-xs">
                      {b.gstin || "—"}
                    </td>

                    {/* STATUS */}
                    <td className="py-3 pr-3">
                      {b.isActive ? "Active" : "Inactive"}
                    </td>

                    {/* ACTION */}
                    <td className="py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {/* CHOOSE LOGO */}
                        <label className="cursor-pointer">
                          <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                            Choose Logo
                          </span>

                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;

                              setBranchLogoFile((current) => ({
                                ...current,
                                [b.id]: file,
                              }));
                            }}
                          />
                        </label>

                        {/* UPLOAD LOGO */}
                        {branchLogoFile[b.id] && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => uploadBranchLogo(b.id)}
                            disabled={uploadingBranchLogo === b.id}
                          >
                            <Upload className="h-4 w-4" />

                            {uploadingBranchLogo === b.id
                              ? "Uploading..."
                              : "Upload"}
                          </Button>
                        )}

                        {/* ACTIVE / INACTIVE */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={b.id === meta?.branchId}
                          onClick={() => toggleBranch(b)}
                        >
                          {b.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>

                      {branchLogoFile[b.id] && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {branchLogoFile[b.id]?.name}
                        </p>
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
