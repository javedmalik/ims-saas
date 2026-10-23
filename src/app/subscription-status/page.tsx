"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SubscriptionInfo = {
  status: string;
  canUseApp: boolean;
  reason: string | null;
  planName: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  tenantActive: boolean;
};

function date(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function heading(status: string) {
  switch (status) {
    case "SUSPENDED":
      return "Subscription Suspended";

    case "EXPIRED":
      return "Subscription Expired";

    case "CANCELLED":
      return "Subscription Cancelled";

    case "PAST_DUE":
      return "Subscription Payment Overdue";

    case "MISSING":
      return "Subscription Not Configured";

    default:
      return "Subscription Access Restricted";
  }
}

function defaultMessage(status: string) {
  switch (status) {
    case "SUSPENDED":
      return "Your organization's subscription is currently suspended.";

    case "EXPIRED":
      return "Your organization's subscription has expired.";

    case "CANCELLED":
      return "Your organization's subscription has been cancelled.";

    case "PAST_DUE":
      return "Your organization's subscription payment is overdue.";

    case "MISSING":
      return "A subscription has not yet been assigned to your organization.";

    default:
      return "Your organization's subscription currently does not allow application access.";
  }
}

export default function SubscriptionStatusPage() {
  const { data: session } = useSession();

  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/subscription-status", {
        cache: "no-store",
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Unable to load subscription status");
      }

      if (body.canUseApp) {
        window.location.href = "/dashboard";
        return;
      }

      setInfo(body);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load subscription status",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {session?.user?.businessName || "IMS"}
          </p>

          <CardTitle className="text-2xl">
            {heading(
              info?.status || session?.user?.subscriptionStatus || "RESTRICTED",
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">
              Checking subscription status...
            </p>
          ) : error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : info ? (
            <>
              <div className="rounded-lg border bg-muted/20 p-4 text-center">
                <p className="font-medium">
                  {info.reason || defaultMessage(info.status)}
                </p>

                <p className="mt-2 text-sm text-muted-foreground">
                  Access to sales, purchases, inventory, reports and settings is
                  temporarily unavailable.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Plan" value={info.planName || "—"} />

                <Info label="Status" value={info.status} />

                <Info label="Trial Ends" value={date(info.trialEndsAt)} />

                <Info
                  label="Current Period Ends"
                  value={date(info.currentPeriodEnd)}
                />
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Please contact your organization administrator or SaaS support
                to renew or restore the subscription.
              </p>

              <div className="flex flex-wrap justify-center gap-2">
                {session?.user?.role === "ADMIN" && (
                  <Button
                    type="button"
                    onClick={() => {
                      window.location.href = "/subscription/checkout";
                    }}
                  >
                    Renew / Choose Plan
                  </Button>
                )}

                <Button type="button" variant="outline" onClick={load}>
                  Check Again
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    signOut({
                      callbackUrl: "/login",
                    })
                  }
                >
                  Logout
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
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
