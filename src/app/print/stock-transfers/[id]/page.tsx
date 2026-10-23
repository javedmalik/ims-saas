import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PrintButton } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";

type Props = {
  params: {
    id: string;
  };
};

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

function dateTime(value: Date | null) {
  return value ? value.toLocaleString("en-IN") : "—";
}

export default async function StockTransferPrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (!can(session.user.role, "MANAGE_STOCK")) {
    redirect("/dashboard?error=forbidden");
  }

  let transferId: bigint;

  try {
    transferId = BigInt(params.id);
  } catch {
    notFound();
  }

  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id: transferId,

      OR: [
        {
          fromBranchId: session.user.branchId,
        },
        {
          toBranchId: session.user.branchId,
        },
      ],
    },

    include: {
      fromBranch: {
        include: {
          business: true,
        },
      },

      toBranch: true,

      createdBy: {
        select: {
          fullName: true,
          username: true,
        },
      },

      dispatchedBy: {
        select: {
          fullName: true,
          username: true,
        },
      },

      receivedBy: {
        select: {
          fullName: true,
          username: true,
        },
      },

      items: {
        include: {
          sourceBatch: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!transfer) {
    notFound();
  }

  const business = transfer.fromBranch.business;

  const fromAddress = [
    transfer.fromBranch.addressLine1,
    transfer.fromBranch.addressLine2,
    transfer.fromBranch.city,
    transfer.fromBranch.state,
    transfer.fromBranch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const toAddress = [
    transfer.toBranch.addressLine1,
    transfer.toBranch.addressLine2,
    transfer.toBranch.city,
    transfer.toBranch.state,
    transfer.toBranch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const totalQty = transfer.items.reduce(
    (total: number, item: (typeof transfer.items)[number]) => total + item.qty,
    0,
  );

  const totalReceived = transfer.items.reduce(
    (total: number, item: (typeof transfer.items)[number]) =>
      total + item.receivedQty,
    0,
  );

  const totalValue = transfer.items.reduce(
    (total: number, item: (typeof transfer.items)[number]) =>
      total + Number(item.sourceBatch.costPrice) * item.qty,
    0,
  );

  const documentTitle =
    transfer.status === "RECEIVED"
      ? "Inter-Branch Stock Transfer Receipt"
      : transfer.status === "DRAFT"
        ? "Inter-Branch Stock Transfer Draft"
        : "Inter-Branch Stock Transfer Challan";

  return (
    <div className="print-page mx-auto max-w-5xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={transfer.fromBranch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={transfer.fromBranch.name}
        address={fromAddress}
        gstin={transfer.fromBranch.gstin}
        phone={transfer.fromBranch.phone || business.phone}
        email={transfer.fromBranch.email || business.email}
        title={documentTitle}
        subtitle={`Status: ${transfer.status.replaceAll("_", " ")}`}
      />

      <div className="mt-5 grid gap-5 text-sm md:grid-cols-2">
        <div className="rounded-md border p-4">
          <p>
            <strong>Transfer No:</strong> {transfer.transferNo}
          </p>

          <p className="mt-1">
            <strong>Created:</strong> {dateTime(transfer.transferDate)}
          </p>

          <p className="mt-1">
            <strong>Dispatched:</strong> {dateTime(transfer.dispatchedAt)}
          </p>

          <p className="mt-1">
            <strong>In Transit:</strong> {dateTime(transfer.inTransitAt)}
          </p>

          <p className="mt-1">
            <strong>Received:</strong> {dateTime(transfer.receivedAt)}
          </p>
        </div>

        <div className="rounded-md border p-4">
          <p className="font-semibold">Destination Branch</p>

          <p className="mt-1">
            {transfer.toBranch.name} ({transfer.toBranch.code})
          </p>

          {toAddress && <p>{toAddress}</p>}

          {transfer.toBranch.gstin && <p>GSTIN: {transfer.toBranch.gstin}</p>}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-black p-2">#</th>

              <th className="border border-black p-2 text-left">Product</th>

              <th className="border border-black p-2">SKU</th>

              <th className="border border-black p-2">Batch</th>

              <th className="border border-black p-2">Expiry</th>

              <th className="border border-black p-2 text-right">Qty Sent</th>

              <th className="border border-black p-2 text-right">
                Qty Received
              </th>

              <th className="border border-black p-2">Unit</th>

              <th className="border border-black p-2 text-right">Cost</th>

              <th className="border border-black p-2 text-right">Value</th>
            </tr>
          </thead>

          <tbody>
            {transfer.items.map(
              (item: (typeof transfer.items)[number], index: number) => (
                <tr key={item.id.toString()}>
                  <td className="border border-black p-2 text-center">
                    {index + 1}
                  </td>

                  <td className="border border-black p-2">
                    {item.sourceBatch.product.name}
                  </td>

                  <td className="border border-black p-2 text-center">
                    {item.sourceBatch.product.sku || "—"}
                  </td>

                  <td className="border border-black p-2 text-center">
                    {item.sourceBatch.batchNo}
                  </td>

                  <td className="border border-black p-2 text-center">
                    {item.sourceBatch.expiryDate
                      ? item.sourceBatch.expiryDate.toLocaleDateString("en-IN")
                      : "—"}
                  </td>

                  <td className="border border-black p-2 text-right">
                    {item.qty}
                  </td>

                  <td className="border border-black p-2 text-right">
                    {item.receivedQty}
                  </td>

                  <td className="border border-black p-2 text-center">
                    {item.sourceBatch.product.unit}
                  </td>

                  <td className="border border-black p-2 text-right">
                    ₹{money(item.sourceBatch.costPrice)}
                  </td>

                  <td className="border border-black p-2 text-right">
                    ₹{money(Number(item.sourceBatch.costPrice) * item.qty)}
                  </td>
                </tr>
              ),
            )}
          </tbody>

          <tfoot>
            <tr className="font-semibold">
              <td colSpan={5} className="border border-black p-2 text-right">
                Total
              </td>

              <td className="border border-black p-2 text-right">{totalQty}</td>

              <td className="border border-black p-2 text-right">
                {totalReceived}
              </td>

              <td className="border border-black p-2" />

              <td className="border border-black p-2" />

              <td className="border border-black p-2 text-right">
                ₹{money(totalValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {transfer.note && (
        <div className="mt-5 rounded-md border p-4 text-sm">
          <strong>Transfer Note:</strong> {transfer.note}
        </div>
      )}

      {transfer.receiveNote && (
        <div className="mt-3 rounded-md border p-4 text-sm">
          <strong>Receiving Note:</strong> {transfer.receiveNote}
        </div>
      )}

      <div className="mt-8 grid gap-6 text-sm md:grid-cols-3">
        <div>
          <p className="font-semibold">Prepared By</p>

          <p className="mt-1">
            {transfer.createdBy.fullName || transfer.createdBy.username}
          </p>
        </div>

        <div>
          <p className="font-semibold">Dispatched By</p>

          <p className="mt-1">
            {transfer.dispatchedBy
              ? transfer.dispatchedBy.fullName || transfer.dispatchedBy.username
              : "—"}
          </p>
        </div>

        <div>
          <p className="font-semibold">Received By</p>

          <p className="mt-1">
            {transfer.receivedBy
              ? transfer.receivedBy.fullName || transfer.receivedBy.username
              : "—"}
          </p>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
        <div className="border-t border-black pt-2 text-center">
          Dispatch Signature
        </div>

        <div className="border-t border-black pt-2 text-center">
          Receiving Signature
        </div>
      </div>
    </div>
  );
}
