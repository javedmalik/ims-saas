"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function money(value: unknown) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TenantBillingPage() {
  const params = useParams();
  const tenantId = String(params.id);

  const [data, setData] = useState<any>(null);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [amount, setAmount] = useState("");

  const [billingCycle, setBillingCycle] = useState("MONTHLY");

  const [mode, setMode] = useState("UPI");

  const [reference, setReference] = useState("");

  const [actionNote, setActionNote] = useState("");

  const [trialDays, setTrialDays] = useState("7");

  async function load() {
    setError("");

    const response = await fetch(
      `/api/super-admin/tenants/${tenantId}/billing`,
      {
        cache: "no-store",
      },
    );

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Unable to load billing");
      return;
    }

    setData(body);

    if (!amount && body.subscription) {
      setAmount(
        String(
          billingCycle === "YEARLY"
            ? body.subscription.plan.yearlyPrice
            : body.subscription.plan.monthlyPrice,
        ),
      );
    }
  }

  useEffect(() => {
    load();
  }, [tenantId]);

  useEffect(() => {
    if (!data?.subscription) {
      return;
    }

    setAmount(
      String(
        billingCycle === "YEARLY"
          ? data.subscription.plan.yearlyPrice
          : data.subscription.plan.monthlyPrice,
      ),
    );
  }, [billingCycle, data?.subscription?.plan?.id]);

  async function action(payload: Record<string, unknown>) {
    setError("");
    setMessage("");

    const response = await fetch(
      `/api/super-admin/tenants/${tenantId}/subscription-actions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Subscription action failed");
      return;
    }

    setMessage("Subscription updated successfully.");

    setActionNote("");
    setReference("");

    await load();
  }

  if (!data) {
    return <div className="p-6">{error || "Loading billing..."}</div>;
  }

  const subscription = data.subscription;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Subscription Billing</h1>

          <p className="text-sm text-muted-foreground">{data.tenant.name}</p>
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

      {!subscription ? (
        <Card>
          <CardContent className="pt-5">No subscription assigned.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Plan" value={subscription.plan.name} />

            <Info label="Status" value={subscription.status} />

            <Info
              label="Period End"
              value={date(subscription.currentPeriodEnd)}
            />

            <Info
              label="Next Billing"
              value={date(subscription.nextBillingAt)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Record Payment & Renew</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <Label>Billing Cycle</Label>

                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={billingCycle}
                  onChange={(event) => setBillingCycle(event.target.value)}
                >
                  <option value="MONTHLY">Monthly</option>

                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              <div>
                <Label>Amount</Label>

                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              <div>
                <Label>Mode</Label>

                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <Label>Reference</Label>

                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() =>
                    action({
                      action: "RENEW",
                      billingCycle,
                      amount: Number(amount),
                      mode,
                      reference: reference || null,
                      graceDays: 7,
                    })
                  }
                >
                  Record & Renew
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription Actions</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Reason / Note</Label>

                  <Input
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    placeholder="Reason for status change"
                  />
                </div>

                <div>
                  <Label>Trial Extension Days</Label>

                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={trialDays}
                    onChange={(event) => setTrialDays(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    action({
                      action: "ACTIVATE",
                      note: actionNote || null,
                    })
                  }
                >
                  Activate
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    action({
                      action: "MARK_PAST_DUE",
                      graceDays: 7,
                      note: actionNote || null,
                    })
                  }
                >
                  Mark Past Due
                </Button>

                <Button
                  variant="outline"
                  disabled={!actionNote.trim()}
                  onClick={() =>
                    action({
                      action: "SUSPEND",
                      note: actionNote,
                    })
                  }
                >
                  Suspend
                </Button>

                <Button
                  variant="outline"
                  disabled={!actionNote.trim()}
                  onClick={() =>
                    action({
                      action: "CANCEL",
                      note: actionNote,
                    })
                  }
                >
                  Cancel
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    action({
                      action: "EXTEND_TRIAL",
                      days: Number(trialDays),
                      note: actionNote || null,
                    })
                  }
                >
                  Extend Trial
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Date</th>
                      <th>Period</th>
                      <th>Cycle</th>
                      <th>Mode</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                      <th>Recorded By</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.payments.map((row: any) => (
                      <tr className="border-b" key={row.id}>
                        <td className="p-2">{date(row.paymentDate)}</td>

                        <td>
                          {date(row.periodStart)} – {date(row.periodEnd)}
                        </td>

                        <td>{row.billingCycle}</td>

                        <td>{row.mode}</td>

                        <td>{row.reference || "—"}</td>

                        <td className="text-right">{money(row.amount)}</td>

                        <td>{row.createdBy}</td>
                      </tr>
                    ))}

                    {!data.payments.length && <Empty colSpan={7} />}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription History</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Date</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Plan</th>
                      <th>Note</th>
                      <th>By</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.history.map((row: any) => (
                      <tr className="border-b" key={row.id}>
                        <td className="p-2">{date(row.createdAt)}</td>

                        <td>{row.action}</td>

                        <td>
                          {row.fromStatus || "—"} → {row.toStatus || "—"}
                        </td>

                        <td>
                          {row.fromPlanCode || "—"} → {row.toPlanCode || "—"}
                        </td>

                        <td>{row.note || "—"}</td>

                        <td>{row.createdBy}</td>
                      </tr>
                    ))}

                    {!data.history.length && <Empty colSpan={6} />}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>

        <p className="mt-1 font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        No records found.
      </td>
    </tr>
  );
}
