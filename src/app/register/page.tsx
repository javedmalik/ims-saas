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
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export default function RegisterPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  const [planId, setPlanId] = useState("");

  const [form, setForm] = useState({
    tenantName: "",
    businessName: "",
    businessType: "",
    fullName: "",
    username: "",
    password: "",
    email: "",
    phone: "",
  });

  const [error, setError] = useState("");

  const [success, setSuccess] = useState<any>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/public/plans", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error || "Unable to load plans");
        }

        return body;
      })
      .then((rows: Plan[]) => {
        setPlans(rows);

        if (rows[0]) {
          setPlanId(String(rows[0].id));
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to load plans"),
      );
  }, []);

  async function submit() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/public/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          planId: Number(planId),
          businessType: form.businessType || null,
          email: form.email || null,
          phone: form.phone || null,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Registration failed");
      }

      setSuccess(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Account Created</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <p>Your IMS SaaS account has been created successfully.</p>

            <div className="rounded-md border p-4 text-sm">
              <p>
                <strong>Username:</strong> {success.username}
              </p>

              <p>
                <strong>Subscription:</strong> {success.status}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              Login with the credentials you just created. You can complete
              Razorpay subscription checkout from your subscription page.
            </p>

            <Button
              className="w-full"
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Create your IMS account</h1>

          <p className="mt-2 text-muted-foreground">
            Start your business workspace, then activate recurring billing when
            you are ready.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Choose Plan</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setPlanId(String(plan.id))}
                className={`rounded-lg border p-4 text-left ${
                  planId === String(plan.id) ? "ring-2 ring-primary" : ""
                }`}
              >
                <p className="font-semibold">{plan.name}</p>

                <p className="mt-1 text-xl font-semibold">
                  {money(plan.monthlyPrice)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /month
                  </span>
                </p>

                <p className="mt-2 text-sm">
                  {plan.maxBranches} branch(es) · {plan.maxUsers} users
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.trialDays > 0
                    ? `${plan.trialDays}-day trial`
                    : "No free trial"}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organization & Administrator</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field
              label="Organization / Tenant Name"
              value={form.tenantName}
              onChange={(value) =>
                setForm({
                  ...form,
                  tenantName: value,
                })
              }
            />

            <Field
              label="Business Name"
              value={form.businessName}
              onChange={(value) =>
                setForm({
                  ...form,
                  businessName: value,
                })
              }
            />

            <Field
              label="Business Type"
              value={form.businessType}
              onChange={(value) =>
                setForm({
                  ...form,
                  businessType: value,
                })
              }
              placeholder="Retail, pharmacy, grocery..."
            />

            <Field
              label="Administrator Full Name"
              value={form.fullName}
              onChange={(value) =>
                setForm({
                  ...form,
                  fullName: value,
                })
              }
            />

            <Field
              label="Username"
              value={form.username}
              onChange={(value) =>
                setForm({
                  ...form,
                  username: value,
                })
              }
            />

            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) =>
                setForm({
                  ...form,
                  password: value,
                })
              }
            />

            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) =>
                setForm({
                  ...form,
                  email: value,
                })
              }
            />

            <Field
              label="Phone"
              value={form.phone}
              onChange={(value) =>
                setForm({
                  ...form,
                  phone: value,
                })
              }
            />

            <div className="md:col-span-2">
              <Button
                className="w-full"
                disabled={saving || !planId}
                onClick={submit}
              >
                {saving ? "Creating Account..." : "Create Account"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button
            variant="link"
            onClick={() => {
              window.location.href = "/login";
            }}
          >
            Already have an account? Login
          </Button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>

      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
