"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Plan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  currencyCode: string;
  maxBranches: number;
  maxUsers: number;
  trialDays: number;
  isActive: boolean;
  sortOrder: number;
};

const emptyForm = {
  code: "",
  name: "",
  description: "",
  monthlyPrice: "0",
  yearlyPrice: "0",
  maxBranches: "1",
  maxUsers: "3",
  trialDays: "14",
  sortOrder: "0",
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  const [form, setForm] = useState(emptyForm);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/super-admin/overview", {
      cache: "no-store",
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Unable to load plans");
      return;
    }

    setPlans(body.plans || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createPlan() {
    setError("");
    setMessage("");

    const response = await fetch("/api/super-admin/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        monthlyPrice: Number(form.monthlyPrice),
        yearlyPrice: Number(form.yearlyPrice),
        maxBranches: Number(form.maxBranches),
        maxUsers: Number(form.maxUsers),
        trialDays: Number(form.trialDays),
        sortOrder: Number(form.sortOrder),
        isActive: true,
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Unable to create plan");
      return;
    }

    setForm(emptyForm);
    setMessage("Plan created successfully.");

    await load();
  }

  async function patchPlan(id: number, payload: Record<string, unknown>) {
    setError("");
    setMessage("");

    const response = await fetch(`/api/super-admin/plans/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Unable to update plan");
      return;
    }

    setMessage("Plan updated successfully.");

    await load();
  }

  async function syncRazorpayPlan(id: number, force = false) {
    setError("");
    setMessage("");

    const response = await fetch(`/api/super-admin/plans/${id}/razorpay-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Unable to sync Razorpay plan");
      return;
    }

    setMessage(
      force
        ? "New Razorpay plans created and linked."
        : "Razorpay plan sync completed.",
    );

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">SaaS Plans</h1>

          <p className="text-sm text-muted-foreground">
            Manage pricing, trial, branch and user limits.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/super-admin";
          }}
        >
          Back to Tenants
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

      <Card>
        <CardHeader>
          <CardTitle>Create Plan</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Code"
            value={form.code}
            onChange={(value) =>
              setForm({
                ...form,
                code: value,
              })
            }
          />

          <Field
            label="Name"
            value={form.name}
            onChange={(value) =>
              setForm({
                ...form,
                name: value,
              })
            }
          />

          <Field
            label="Monthly Price"
            type="number"
            value={form.monthlyPrice}
            onChange={(value) =>
              setForm({
                ...form,
                monthlyPrice: value,
              })
            }
          />

          <Field
            label="Yearly Price"
            type="number"
            value={form.yearlyPrice}
            onChange={(value) =>
              setForm({
                ...form,
                yearlyPrice: value,
              })
            }
          />

          <Field
            label="Max Branches"
            type="number"
            value={form.maxBranches}
            onChange={(value) =>
              setForm({
                ...form,
                maxBranches: value,
              })
            }
          />

          <Field
            label="Max Users"
            type="number"
            value={form.maxUsers}
            onChange={(value) =>
              setForm({
                ...form,
                maxUsers: value,
              })
            }
          />

          <Field
            label="Trial Days"
            type="number"
            value={form.trialDays}
            onChange={(value) =>
              setForm({
                ...form,
                trialDays: value,
              })
            }
          />

          <div className="flex items-end">
            <Button className="w-full" onClick={createPlan}>
              Create Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            save={patchPlan}
            syncRazorpay={syncRazorpayPlan}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  save,
  syncRazorpay,
}: {
  plan: Plan;
  save: (id: number, payload: Record<string, unknown>) => Promise<void>;
  syncRazorpay: (id: number, force?: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(plan.name);

  const [monthlyPrice, setMonthlyPrice] = useState(String(plan.monthlyPrice));

  const [yearlyPrice, setYearlyPrice] = useState(String(plan.yearlyPrice));

  const [maxBranches, setMaxBranches] = useState(String(plan.maxBranches));

  const [maxUsers, setMaxUsers] = useState(String(plan.maxUsers));

  const [trialDays, setTrialDays] = useState(String(plan.trialDays));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{plan.code}</CardTitle>

          <span className="text-sm text-muted-foreground">
            {plan.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <Field label="Name" value={name} onChange={setName} />

        <Field
          label="Monthly"
          type="number"
          value={monthlyPrice}
          onChange={setMonthlyPrice}
        />

        <Field
          label="Yearly"
          type="number"
          value={yearlyPrice}
          onChange={setYearlyPrice}
        />

        <Field
          label="Branches"
          type="number"
          value={maxBranches}
          onChange={setMaxBranches}
        />

        <Field
          label="Users"
          type="number"
          value={maxUsers}
          onChange={setMaxUsers}
        />

        <Field
          label="Trial Days"
          type="number"
          value={trialDays}
          onChange={setTrialDays}
        />

        <div className="flex items-end gap-2">
          <Button
            onClick={() =>
              save(plan.id, {
                name,
                monthlyPrice: Number(monthlyPrice),
                yearlyPrice: Number(yearlyPrice),
                maxBranches: Number(maxBranches),
                maxUsers: Number(maxUsers),
                trialDays: Number(trialDays),
              })
            }
          >
            Save
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              save(plan.id, {
                isActive: !plan.isActive,
              })
            }
          >
            {plan.isActive ? "Disable" : "Enable"}
          </Button>

          <Button
            variant="outline"
            onClick={() => syncRazorpay(plan.id, false)}
          >
            Sync Razorpay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>

      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
