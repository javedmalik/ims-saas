"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  PackageCheck,
  Printer,
  RefreshCw,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TransferItem = {
  id: string;
  qty: number;
  receivedQty: number;

  sourceBatch: {
    id: number;
    batchNo: string;

    product: {
      id: number;
      name: string;
      sku: string | null;
      unit: string;
    };
  };
};

type Transfer = {
  id: string;
  transferNo: string;
  transferDate: string;
  status: string;
  note: string | null;

  dispatchedAt: string | null;
  inTransitAt: string | null;
  receivedAt: string | null;
  receiveNote: string | null;

  fromBranchId: number;
  toBranchId: number;

  fromBranch: {
    id: number;
    name: string;
    code: string;
  };

  toBranch: {
    id: number;
    name: string;
    code: string;
  };

  createdBy: {
    fullName: string;
    username: string;
  };

  dispatchedBy: {
    fullName: string;
    username: string;
  } | null;

  receivedBy: {
    fullName: string;
    username: string;
  } | null;

  items: TransferItem[];
};

type SessionBranch = {
  id: number;
  name: string;
  code: string;
  current: boolean;
};

const statusOrder = ["DRAFT", "DISPATCHED", "IN_TRANSIT", "RECEIVED"];

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("en-IN");
}

export default function TransferManagementPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const [branches, setBranches] = useState<SessionBranch[]>([]);

  const [selected, setSelected] = useState<Transfer | null>(null);

  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const [receiveNote, setReceiveNote] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");

    const [transferResponse, branchResponse] = await Promise.all([
      fetch("/api/stock-transfers", {
        cache: "no-store",
      }),

      fetch("/api/session/branches", {
        cache: "no-store",
      }),
    ]);

    const transferBody = await transferResponse.json();

    const branchBody = await branchResponse.json();

    if (!transferResponse.ok) {
      setError(transferBody.error || "Unable to load transfers");
      return;
    }

    setTransfers(transferBody);

    if (branchResponse.ok) {
      setBranches(branchBody);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currentBranch = useMemo(
    () => branches.find((branch) => branch.current) || null,
    [branches],
  );

  function openTransfer(transfer: Transfer) {
    setSelected(transfer);

    setReceiveQty(
      Object.fromEntries(
        transfer.items.map((item) => [
          item.id,
          String(item.receivedQty || item.qty),
        ]),
      ),
    );

    setReceiveNote(transfer.receiveNote || "");

    setError("");
    setMessage("");
  }

  async function action(
    transfer: Transfer,
    actionName: "DISPATCH" | "IN_TRANSIT",
  ) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/stock-transfers/${transfer.id}/action`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            action: actionName,
          }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Transfer action failed");
      }

      setMessage(`${body.transferNo} → ${statusLabel(body.status)}`);

      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer action failed");
    } finally {
      setLoading(false);
    }
  }

  async function receive() {
    if (!selected) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const items = selected.items.map((item) => ({
        transferItemId: item.id,

        receivedQty: Number(receiveQty[item.id] ?? 0),
      }));

      const invalid = items.find(
        (item) => !Number.isInteger(item.receivedQty) || item.receivedQty < 0,
      );

      if (invalid) {
        throw new Error(
          "Received quantities must be whole numbers greater than or equal to zero",
        );
      }

      const response = await fetch(
        `/api/stock-transfers/${selected.id}/action`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            action: "RECEIVE",

            receiveNote,

            items,
          }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Receive confirmation failed");
      }

      setMessage(
        `${body.transferNo} received. Dispatched ${body.totalDispatched}, received ${body.totalReceived}, variance ${body.variance}.`,
      );

      setSelected(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Receive confirmation failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Inter-Branch Transfers</h2>

          <p className="text-sm text-muted-foreground">
            Draft → Dispatch → In Transit → Receive. Current branch:{" "}
            <strong>{currentBranch?.name || "—"}</strong>
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-md border bg-secondary px-4 py-3 text-sm">
          {message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transfer Queue</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Transfer</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Received</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {transfers.map((transfer) => {
                  const totalQty = transfer.items.reduce(
                    (total, item) => total + item.qty,
                    0,
                  );

                  const totalReceived = transfer.items.reduce(
                    (total, item) => total + item.receivedQty,
                    0,
                  );

                  return (
                    <tr className="border-b" key={transfer.id}>
                      <td className="p-2 font-medium">{transfer.transferNo}</td>

                      <td>{dateTime(transfer.transferDate)}</td>

                      <td>{transfer.fromBranch.name}</td>

                      <td>{transfer.toBranch.name}</td>

                      <td>
                        <span className="rounded-full border px-2 py-1 text-xs">
                          {statusLabel(transfer.status)}
                        </span>
                      </td>

                      <td className="text-right">{totalQty}</td>

                      <td className="text-right">{totalReceived}</td>

                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openTransfer(transfer)}
                          >
                            Details
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.open(
                                `/print/stock-transfers/${transfer.id}`,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!transfers.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No transfers found for the current branch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{selected.transferNo}</CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.fromBranch.name}{" "}
                  <ArrowRight className="inline h-4 w-4" />{" "}
                  {selected.toBranch.name}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <TransferProgress status={selected.status} />

            <div className="grid gap-3 text-sm md:grid-cols-4">
              <Info label="Created" value={dateTime(selected.transferDate)} />

              <Info
                label="Dispatched"
                value={dateTime(selected.dispatchedAt)}
              />

              <Info label="In Transit" value={dateTime(selected.inTransitAt)} />

              <Info label="Received" value={dateTime(selected.receivedAt)} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Product</th>
                    <th>Batch</th>
                    <th>Unit</th>
                    <th className="text-right">Dispatched Qty</th>
                    <th className="text-right">Received Qty</th>
                  </tr>
                </thead>

                <tbody>
                  {selected.items.map((item) => (
                    <tr className="border-b" key={item.id}>
                      <td className="p-2 font-medium">
                        {item.sourceBatch.product.name}
                      </td>

                      <td>{item.sourceBatch.batchNo}</td>

                      <td>{item.sourceBatch.product.unit}</td>

                      <td className="text-right">{item.qty}</td>

                      <td className="text-right">
                        {selected.status === "DISPATCHED" ||
                        selected.status === "IN_TRANSIT" ? (
                          <Input
                            className="ml-auto w-28 text-right"
                            type="number"
                            min="0"
                            max={item.qty}
                            step="1"
                            disabled={currentBranch?.id !== selected.toBranchId}
                            value={receiveQty[item.id] ?? ""}
                            onChange={(event) =>
                              setReceiveQty((current) => ({
                                ...current,

                                [item.id]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          item.receivedQty
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.note && (
              <div className="rounded-md border p-3 text-sm">
                <strong>Transfer Note:</strong> {selected.note}
              </div>
            )}

            {(selected.status === "DISPATCHED" ||
              selected.status === "IN_TRANSIT") &&
              currentBranch?.id === selected.toBranchId && (
                <div className="space-y-1.5">
                  <Label>Receiving Note / Variance Reason</Label>

                  <Input
                    value={receiveNote}
                    onChange={(event) => setReceiveNote(event.target.value)}
                    placeholder="Optional if received in full; recommended when quantity differs."
                  />
                </div>
              )}

            {selected.receiveNote && (
              <div className="rounded-md border p-3 text-sm">
                <strong>Receive Note:</strong> {selected.receiveNote}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selected.status === "DRAFT" &&
                currentBranch?.id === selected.fromBranchId && (
                  <Button
                    type="button"
                    disabled={loading}
                    onClick={() => action(selected, "DISPATCH")}
                  >
                    <PackageCheck className="h-4 w-4" />
                    Dispatch Stock
                  </Button>
                )}

              {selected.status === "DISPATCHED" &&
                currentBranch?.id === selected.fromBranchId && (
                  <Button
                    type="button"
                    disabled={loading}
                    onClick={() => action(selected, "IN_TRANSIT")}
                  >
                    <Truck className="h-4 w-4" />
                    Mark In Transit
                  </Button>
                )}

              {(selected.status === "DISPATCHED" ||
                selected.status === "IN_TRANSIT") &&
                currentBranch?.id === selected.toBranchId && (
                  <Button type="button" disabled={loading} onClick={receive}>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Receipt
                  </Button>
                )}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.open(
                    `/print/stock-transfers/${selected.id}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <Printer className="h-4 w-4" />
                Print Transfer
              </Button>
            </div>

            {selected.status !== "RECEIVED" &&
              currentBranch?.id !== selected.fromBranchId &&
              currentBranch?.id !== selected.toBranchId && (
                <p className="text-sm text-muted-foreground">
                  Switch to the source or destination branch to perform the next
                  action.
                </p>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TransferProgress({ status }: { status: string }) {
  const activeIndex = statusOrder.indexOf(status);

  return (
    <div className="grid grid-cols-4 gap-2">
      {statusOrder.map((step, index) => (
        <div
          key={step}
          className={`rounded-md border p-3 text-center text-xs font-medium ${
            index <= activeIndex ? "bg-secondary" : "text-muted-foreground"
          }`}
        >
          {statusLabel(step)}
        </div>
      ))}
    </div>
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
