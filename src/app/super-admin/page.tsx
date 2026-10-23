"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Plan = {
  id: number;
  code: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currencyCode: string;
  maxBranches: number;
  maxUsers: number;
  trialDays: number;
};

type TenantRow = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  activeUsers: number;
  totalBranches: number;

  businesses: Array<{
    id: number;
    legalName: string;
    tradeName: string | null;
    branches: number;
    isActive: boolean;
  }>;

  subscription: {
    id: number;
    status: string;
    billingCycle: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    nextBillingAt: string | null;
    graceEndsAt: string | null;
    notes: string | null;

    plan: Plan;
  } | null;
};

const statuses = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
];

export default function SuperAdminPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  const [tenants, setTenants] = useState<TenantRow[]>([]);

  const [summary, setSummary] = useState<any>({});

  const [search, setSearch] = useState("");

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/super-admin/overview", {
        cache: "no-store",
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to load SaaS administration");
      }

      setPlans(body.plans || []);
      setTenants(body.tenants || []);
      setSummary(body.summary || {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load SaaS administration",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return tenants;

    return tenants.filter((tenant) => {
      const businesses = tenant.businesses
        .map((business) => `${business.legalName} ${business.tradeName || ""}`)
        .join(" ");

      return `${tenant.name} ${tenant.slug} ${businesses}`
        .toLowerCase()
        .includes(q);
    });
  }, [tenants, search]);

  async function updateTenant(
    tenantId: number,
    payload: Record<string, unknown>,
  ) {
    setError("");
    setMessage("");

    const response = await fetch(`/api/super-admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Update failed");
      return;
    }

    setMessage("Tenant subscription updated.");

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">SaaS Super Admin</h1>

          <p className="text-sm text-muted-foreground">
            Manage tenant activation, subscriptions, trials and plan limits.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/super-admin/plans";
          }}
        >
          Manage Plans
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Tenants" value={summary.tenants} />
        <Summary label="Active" value={summary.activeTenants} />
        <Summary label="Trials" value={summary.trialTenants} />
        <Summary label="Suspended" value={summary.suspended} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Subscriptions</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <Label>Search Tenant / Business</Label>

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tenant, slug or business"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-4">
              {filtered.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  plans={plans}
                  updateTenant={updateTenant}
                />
              ))}

              {!filtered.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No tenant found.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TenantCard({
  tenant,
  plans,
  updateTenant,
}: {
  tenant: TenantRow;
  plans: Plan[];
  updateTenant: (
    tenantId: number,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(
    String(tenant.subscription?.plan.id || plans[0]?.id || ""),
  );

  const [status, setStatus] = useState(tenant.subscription?.status || "TRIAL");

  const [billingCycle, setBillingCycle] = useState(
    tenant.subscription?.billingCycle || "MONTHLY",
  );

  const [trialEndsAt, setTrialEndsAt] = useState(
    toDateInput(tenant.subscription?.trialEndsAt),
  );

  const [periodEnd, setPeriodEnd] = useState(
    toDateInput(tenant.subscription?.currentPeriodEnd),
  );

  const selectedPlan = plans.find((plan) => String(plan.id) === planId);

  async function save() {
    await updateTenant(tenant.id, {
      planId: Number(planId),
      status,
      billingCycle,

      trialEndsAt: trialEndsAt
        ? new Date(`${trialEndsAt}T23:59:59`).toISOString()
        : null,

      currentPeriodEnd: periodEnd
        ? new Date(`${periodEnd}T23:59:59`).toISOString()
        : null,
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{tenant.name}</h3>

          <p className="text-xs text-muted-foreground">{tenant.slug}</p>

          <p className="mt-2 text-sm">
            {tenant.businesses
              .map((business) => business.tradeName || business.legalName)
              .join(", ")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.href = `/super-admin/tenants/${tenant.id}/billing`;
            }}
          >
            Billing & History
          </Button>

          <Button
            type="button"
            variant={tenant.isActive ? "outline" : "default"}
            onClick={() =>
              updateTenant(tenant.id, {
                tenantActive: !tenant.isActive,
              })
            }
          >
            {tenant.isActive ? "Deactivate Tenant" : "Activate Tenant"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Info
          label="Users"
          value={`${tenant.activeUsers}/${tenant.subscription?.plan.maxUsers ?? "—"}`}
        />

        <Info
          label="Branches"
          value={`${tenant.totalBranches}/${tenant.subscription?.plan.maxBranches ?? "—"}`}
        />

        <div>
          <Label>Plan</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {plan.maxBranches} branch / {plan.maxUsers} users
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Status</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Billing</Label>

          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value)}
          >
            <option value="MONTHLY">MONTHLY</option>
            <option value="YEARLY">YEARLY</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </div>

        <div className="flex items-end">
          <Button
            className="w-full"
            type="button"
            disabled={!planId}
            onClick={save}
          >
            Save Subscription
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <Label>Trial Ends</Label>

          <Input
            type="date"
            value={trialEndsAt}
            onChange={(event) => setTrialEndsAt(event.target.value)}
          />
        </div>

        <div>
          <Label>Current Period Ends</Label>

          <Input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
          />
        </div>

        <Info
          label="Plan Pricing"
          value={
            selectedPlan
              ? `${selectedPlan.currencyCode} ${selectedPlan.monthlyPrice}/mo | ${selectedPlan.yearlyPrice}/yr`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: unknown }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{String(value ?? 0)}</p>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";

  return new Date(value).toISOString().slice(0, 10);
}
