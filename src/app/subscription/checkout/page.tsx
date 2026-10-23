"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: any) => void) => void;
    };
  }
}

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function loadCheckoutScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");

    script.src = "https://checkout.razorpay.com/v1/checkout.js";

    script.onload = () => resolve(true);

    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
}

export default function SubscriptionCheckoutPage() {
  const { data: session, update } = useSession();

  const [plans, setPlans] = useState<Plan[]>([]);

  const [planId, setPlanId] = useState("");

  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">(
    "MONTHLY",
  );

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/public/plans", {
      cache: "no-store",
    })
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

  async function checkout() {
    if (session?.user?.role !== "ADMIN") {
      setError("Only the tenant administrator can manage the subscription.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const scriptOk = await loadCheckoutScript();

      if (!scriptOk || !window.Razorpay) {
        throw new Error("Unable to load Razorpay Checkout.");
      }

      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: Number(planId),
          billingCycle,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to start checkout");
      }

      const razorpay = new window.Razorpay({
        key: body.keyId,

        subscription_id: body.subscriptionId,

        name: body.businessName || "IMS SaaS",

        description: `${body.planName} ${billingCycle.toLowerCase()} subscription`,

        prefill: {
          email: body.email || "",
          contact: body.phone || "",
        },

        notes: {
          plan: body.planName,
        },

        theme: {},

        handler: async () => {
          setMessage(
            "Razorpay authorization completed. We are waiting for secure webhook confirmation.",
          );

          /*
           * Activation is intentionally webhook-driven.
           * Refresh the session after Razorpay has updated
           * our subscription state.
           */
          for (let i = 0; i < 8; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const statusResponse = await fetch("/api/subscription-status", {
              cache: "no-store",
            });

            if (statusResponse.ok) {
              const status = await statusResponse.json();

              if (status.canUseApp) {
                await update();

                window.location.href = "/dashboard";

                return;
              }
            }
          }

          setMessage(
            "Payment was accepted by Razorpay. Activation is still being confirmed. Use Check Again on the subscription status page shortly.",
          );
        },

        modal: {
          ondismiss: () => {
            setMessage(
              "Checkout closed. No subscription change was made unless Razorpay confirms it by webhook.",
            );
          },
        },
      });

      razorpay.on("payment.failed", (response: any) => {
        setError(
          response?.error?.description || "Payment authorization failed.",
        );
      });

      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Subscription & Billing</h1>

        <p className="text-sm text-muted-foreground">
          Choose your IMS SaaS plan and authorize recurring billing securely
          with Razorpay.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const selected = planId === String(plan.id);

          const price =
            billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPlanId(String(plan.id))}
              className={`rounded-lg border p-5 text-left ${
                selected ? "ring-2 ring-primary" : ""
              }`}
            >
              <h2 className="font-semibold">{plan.name}</h2>

              <p className="mt-2 text-2xl font-semibold">{money(price)}</p>

              <p className="text-sm text-muted-foreground">
                per {billingCycle === "YEARLY" ? "year" : "month"}
              </p>

              <div className="mt-4 space-y-1 text-sm">
                <p>{plan.maxBranches} branch(es)</p>

                <p>{plan.maxUsers} users</p>

                {plan.trialDays > 0 && (
                  <p>
                    {plan.trialDays}
                    -day trial
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing Cycle</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={billingCycle === "MONTHLY" ? "default" : "outline"}
            onClick={() => setBillingCycle("MONTHLY")}
          >
            Monthly
          </Button>

          <Button
            variant={billingCycle === "YEARLY" ? "default" : "outline"}
            onClick={() => setBillingCycle("YEARLY")}
          >
            Yearly
          </Button>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        disabled={loading || !planId}
        onClick={checkout}
      >
        {loading ? "Starting Checkout..." : "Continue with Razorpay"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Subscription access is activated only after a verified Razorpay webhook
        confirms the subscription state.
      </p>
    </div>
  );
}
