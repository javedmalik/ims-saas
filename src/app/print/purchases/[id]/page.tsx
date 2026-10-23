import { notFound, redirect } from "next/navigation";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { PrintHeader } from "@/components/print/print-header";

import { PrintButton } from "@/components/print/print-button";

type Props = {
  params: {
    id: string;
  };
};

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

export default async function PurchasePrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let purchaseId: bigint;

  try {
    purchaseId = BigInt(params.id);
  } catch {
    notFound();
  }

  const purchase = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,

      branchId: session.user.branchId,
    },

    include: {
      branch: {
        include: {
          business: true,
        },
      },

      supplier: true,

      createdBy: {
        select: {
          fullName: true,
        },
      },

      items: {
        include: {
          product: true,
        },
      },

      payments: true,
    },
  });

  if (!purchase) {
    notFound();
  }

  const business = purchase.branch.business;

  const address = [
    purchase.branch.addressLine1,
    purchase.branch.addressLine2,
    purchase.branch.city,
    purchase.branch.state,
    purchase.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="print-page mx-auto max-w-5xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={purchase.branch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={purchase.branch.name}
        address={address}
        gstin={purchase.branch.gstin}
        phone={purchase.branch.phone || business.phone}
        email={purchase.branch.email || business.email}
        title="Purchase / Goods Receipt Note"
        subtitle={purchase.isCancelled ? "CANCELLED" : undefined}
      />

      <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p>
            <strong>Supplier:</strong> {purchase.supplier.name}
          </p>

          {purchase.supplier.taxId && (
            <p>
              <strong>Supplier GSTIN:</strong> {purchase.supplier.taxId}
            </p>
          )}

          <p>
            <strong>Address:</strong>{" "}
            {[
              purchase.supplier.addressLine1,
              purchase.supplier.addressLine2,
              purchase.supplier.city,
              purchase.supplier.state,
              purchase.supplier.pincode,
            ]
              .filter(Boolean)
              .join(", ") || "-"}
          </p>
        </div>

        <div>
          {purchase.grnNo && (
            <p><strong>GRN No:</strong> {purchase.grnNo}</p>
          )}

          <p>
            <strong>Supplier Invoice:</strong> {purchase.invoiceNo}
          </p>

          <p>
            <strong>Invoice Date:</strong>{" "}
            {purchase.invoiceDate.toLocaleDateString("en-IN")}
          </p>

          <p>
            <strong>Entered By:</strong> {purchase.createdBy.fullName}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">#</th>

              <th className="border p-2 text-left">Item</th>

              <th className="border p-2">HSN</th>

              <th className="border p-2">Batch</th>

              <th className="border p-2">Expiry</th>

              <th className="border p-2">Qty</th>

              <th className="border p-2">Free</th>

              <th className="border p-2">Cost</th>

              <th className="border p-2">GST %</th>

              <th className="border p-2">Tax</th>

              <th className="border p-2">Amount</th>
            </tr>
          </thead>

          <tbody>
            {purchase.items.map((item, index) => (
              <tr key={item.id.toString()}>
                <td className="border p-2 text-center">{index + 1}</td>

                <td className="border p-2">{item.product.name}</td>

                <td className="border p-2 text-center">
                  {item.product.hsnCode || "-"}
                </td>

                <td className="border p-2 text-center">{item.batchNo}</td>

                <td className="border p-2 text-center">
                  {item.expiryDate
                    ? item.expiryDate.toLocaleDateString("en-IN")
                    : "-"}
                </td>

                <td className="border p-2 text-right">{item.qty}</td>

                <td className="border p-2 text-right">{item.freeQty}</td>

                <td className="border p-2 text-right">
                  {money(item.costPrice)}
                </td>

                <td className="border p-2 text-right">
                  {money(item.taxPercent)}%
                </td>

                <td className="border p-2 text-right">
                  {money(item.taxAmount)}
                </td>

                <td className="border p-2 text-right">
                  {money(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <table className="w-80 text-sm">
          <tbody>
            <tr>
              <td>Gross</td>

              <td className="text-right">₹{money(purchase.grossAmount)}</td>
            </tr>

            <tr>
              <td>Discount</td>

              <td className="text-right">₹{money(purchase.totalDiscount)}</td>
            </tr>

            <tr>
              <td>Taxable</td>

              <td className="text-right">₹{money(purchase.taxableAmount)}</td>
            </tr>

            {purchase.isInterstate ? (
              <tr>
                <td>IGST</td>
                <td className="text-right">₹{money(purchase.totalIgst)}</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td>CGST</td>
                  <td className="text-right">₹{money(purchase.totalCgst)}</td>
                </tr>
                <tr>
                  <td>SGST</td>
                  <td className="text-right">₹{money(purchase.totalSgst)}</td>
                </tr>
              </>
            )}

            <tr className="border-t-2 border-black font-bold">
              <td className="py-2">Net Amount</td>

              <td className="py-2 text-right">₹{money(purchase.netAmount)}</td>
            </tr>

            <tr>
              <td>Paid</td>

              <td className="text-right">₹{money(purchase.paidAmount)}</td>
            </tr>

            <tr>
              <td>Due</td>

              <td className="text-right">₹{money(purchase.dueAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t pt-3 text-sm">
        <strong>Payment:</strong>{" "}
        {purchase.payments.length
          ? purchase.payments
              .map((payment) => `${payment.mode}: ₹${money(payment.amount)}`)
              .join(" | ")
          : purchase.paymentMode}
      </div>
    </div>
  );
}
