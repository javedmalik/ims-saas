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

export default async function SalePrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let saleId: bigint;

  try {
    saleId = BigInt(params.id);
  } catch {
    notFound();
  }

  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,

      branchId: session.user.branchId,
    },

    include: {
      branch: {
        include: {
          business: true,
        },
      },

      customer: true,

      createdBy: {
        select: {
          fullName: true,
        },
      },

      items: {
        include: {
          batch: {
            include: {
              product: true,
            },
          },
        },
      },

      payments: true,
    },
  });

  if (!sale) {
    notFound();
  }

  const business = sale.branch.business;

  const address = [
    sale.branch.addressLine1,
    sale.branch.addressLine2,
    sale.branch.city,
    sale.branch.state,
    sale.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const interstate = Number(sale.totalIgst) > 0;

  return (
    <div className="print-page mx-auto max-w-5xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={sale.branch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={sale.branch.name}
        address={address}
        gstin={sale.branch.gstin}
        phone={sale.branch.phone || business.phone}
        email={sale.branch.email || business.email}
        title="Tax Invoice"
        subtitle={sale.isCancelled ? "CANCELLED INVOICE" : undefined}
      />

      <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p>
            <strong>Invoice No:</strong> {sale.billNo}
          </p>

          <p>
            <strong>Invoice Date:</strong>{" "}
            {sale.billDateTime.toLocaleString("en-IN")}
          </p>

          <p>
            <strong>Prepared By:</strong> {sale.createdBy.fullName}
          </p>
        </div>

        <div>
          <p>
            <strong>Customer:</strong>{" "}
            {sale.customer?.name || "Walk-in Customer"}
          </p>

          {sale.customer?.mobile && (
            <p>
              <strong>Mobile:</strong> {sale.customer.mobile}
            </p>
          )}

          {sale.customer?.taxId && (
            <p>
              <strong>Customer GSTIN:</strong> {sale.customer.taxId}
            </p>
          )}

          {sale.customer?.state && (
            <p>
              <strong>Place of Supply:</strong> {sale.customer.state}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">#</th>

              <th className="border p-2 text-left">Item</th>

              <th className="border p-2">HSN</th>

              <th className="border p-2">Batch</th>

              <th className="border p-2">Qty</th>

              <th className="border p-2">Rate</th>

              <th className="border p-2">Disc.</th>

              <th className="border p-2">Taxable</th>

              {!interstate && (
                <>
                  <th className="border p-2">CGST</th>

                  <th className="border p-2">SGST</th>
                </>
              )}

              {interstate && <th className="border p-2">IGST</th>}

              <th className="border p-2">Amount</th>
            </tr>
          </thead>

          <tbody>
            {sale.items.map((item, index) => {
              const tax = Number(item.taxAmount);

              const taxable = Number(item.lineTotal) - tax;

              return (
                <tr key={item.id.toString()}>
                  <td className="border p-2 text-center">{index + 1}</td>

                  <td className="border p-2">{item.batch.product.name}</td>

                  <td className="border p-2 text-center">
                    {item.batch.product.hsnCode || "-"}
                  </td>

                  <td className="border p-2 text-center">
                    {item.batch.batchNo}
                  </td>

                  <td className="border p-2 text-right">{item.qty}</td>

                  <td className="border p-2 text-right">{money(item.rate)}</td>

                  <td className="border p-2 text-right">
                    {money(item.discountAmount)}
                  </td>

                  <td className="border p-2 text-right">{money(taxable)}</td>

                  {!interstate && (
                    <>
                      <td className="border p-2 text-right">
                        {money(tax / 2)}
                      </td>

                      <td className="border p-2 text-right">
                        {money(tax / 2)}
                      </td>
                    </>
                  )}

                  {interstate && (
                    <td className="border p-2 text-right">{money(tax)}</td>
                  )}

                  <td className="border p-2 text-right font-medium">
                    {money(item.lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <table className="w-80 text-sm">
          <tbody>
            <tr>
              <td className="py-1">Gross Amount</td>

              <td className="py-1 text-right">₹{money(sale.grossAmount)}</td>
            </tr>

            <tr>
              <td className="py-1">Discount</td>

              <td className="py-1 text-right">₹{money(sale.totalDiscount)}</td>
            </tr>

            <tr>
              <td className="py-1">Taxable Amount</td>

              <td className="py-1 text-right">₹{money(sale.taxableAmount)}</td>
            </tr>

            {!interstate && (
              <>
                <tr>
                  <td className="py-1">CGST</td>

                  <td className="py-1 text-right">₹{money(sale.totalCgst)}</td>
                </tr>

                <tr>
                  <td className="py-1">SGST</td>

                  <td className="py-1 text-right">₹{money(sale.totalSgst)}</td>
                </tr>
              </>
            )}

            {interstate && (
              <tr>
                <td className="py-1">IGST</td>

                <td className="py-1 text-right">₹{money(sale.totalIgst)}</td>
              </tr>
            )}

            <tr className="border-t-2 border-black font-bold">
              <td className="py-2">Grand Total</td>

              <td className="py-2 text-right">₹{money(sale.netAmount)}</td>
            </tr>

            <tr>
              <td>Received</td>

              <td className="text-right">₹{money(sale.receivedAmount)}</td>
            </tr>

            <tr>
              <td>Due</td>

              <td className="text-right">₹{money(sale.dueAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t pt-3 text-sm">
        <strong>Payment:</strong>{" "}
        {sale.payments.length
          ? sale.payments
              .map(
                (payment) =>
                  `${payment.mode}: ₹${money(payment.amount)}${
                    payment.reference ? ` (${payment.reference})` : ""
                  }`,
              )
              .join(" | ")
          : sale.paymentMode}
      </div>

      {sale.isCancelled && sale.cancelReason && (
        <div className="mt-4 border border-red-500 p-3 text-center font-semibold text-red-600">
          CANCELLED — {sale.cancelReason}
        </div>
      )}

      <div className="mt-12 flex justify-end">
        <div className="text-center">
          <div className="mb-12" />

          <p className="border-t border-black px-8 pt-2">
            Authorized Signatory
          </p>
        </div>
      </div>
    </div>
  );
}
