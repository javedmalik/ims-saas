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

function paymentModeLabel(mode: string | null) {
  if (!mode) {
    return "—";
  }

  return mode
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function integerToWords(value: number): string {
  if (value === 0) {
    return "Zero";
  }

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const belowThousand = (num: number) => {
    const parts: string[] = [];

    if (num >= 100) {
      parts.push(`${ones[Math.floor(num / 100)]} Hundred`);

      num %= 100;
    }

    if (num >= 20) {
      parts.push(tens[Math.floor(num / 10)] ?? "");

      num %= 10;
    }

    if (num > 0) {
      parts.push(ones[num] ?? "");
    }

    return parts.join(" ");
  };

  const parts: string[] = [];

  const crore = Math.floor(value / 10000000);

  value %= 10000000;

  const lakh = Math.floor(value / 100000);

  value %= 100000;

  const thousand = Math.floor(value / 1000);

  value %= 1000;

  if (crore) {
    parts.push(`${belowThousand(crore)} Crore`);
  }

  if (lakh) {
    parts.push(`${belowThousand(lakh)} Lakh`);
  }

  if (thousand) {
    parts.push(`${belowThousand(thousand)} Thousand`);
  }

  if (value) {
    parts.push(belowThousand(value));
  }

  return parts.join(" ");
}

function amountInWords(value: unknown) {
  const amount = Number(value ?? 0);

  const rupees = Math.floor(amount);

  const paise = Math.round((amount - rupees) * 100);

  let result = `${integerToWords(rupees)} Rupees`;

  if (paise > 0) {
    result += ` and ${integerToWords(paise)} Paise`;
  }

  return `${result} Only`;
}

export default async function CreditNotePrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (!can(session.user.role, "OPERATE_FINANCE")) {
    redirect("/dashboard?error=forbidden");
  }

  let returnId: bigint;

  try {
    returnId = BigInt(params.id);
  } catch {
    notFound();
  }

  const creditNote = await prisma.saleReturn.findFirst({
    where: {
      id: returnId,

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
          username: true,
        },
      },

      sale: {
        include: {
          customer: true,
        },
      },

      items: {
        include: {
          saleItem: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
          },

          batch: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!creditNote) {
    notFound();
  }

  const business = creditNote.branch.business;

  const customer = creditNote.customer || creditNote.sale.customer;

  const branchAddress = [
    creditNote.branch.addressLine1,
    creditNote.branch.addressLine2,
    creditNote.branch.city,
    creditNote.branch.state,
    creditNote.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const placeOfSupply =
    [
      customer?.state,
      creditNote.sale.placeOfSupplyStateCode
        ? `(${creditNote.sale.placeOfSupplyStateCode})`
        : null,
    ]
      .filter(Boolean)
      .join(" ") ||
    creditNote.sale.placeOfSupplyStateCode ||
    "—";

  const isInterstate = creditNote.sale.isInterstate;

  const lineRows = creditNote.items.map((item) => {
    const saleItem = item.saleItem;

    const product = item.batch.product;

    const taxable = Number(item.taxableAmount);

    const tax = Number(item.taxAmount);

    const cgst = isInterstate ? 0 : tax / 2;

    const sgst = isInterstate ? 0 : tax - cgst;

    const igst = isInterstate ? tax : 0;

    return {
      id: item.id.toString(),

      product: product.name,

      hsn: product.hsnCode || "—",

      unit: product.unit || "—",

      batchNo: item.batch.batchNo,

      qty: item.qty,

      taxPercent: Number(saleItem.taxPercent),

      taxable,

      cgst,
      sgst,
      igst,

      lineTotal: Number(item.lineTotal),
    };
  });

  const totalCgst = lineRows.reduce((total, row) => total + row.cgst, 0);

  const totalSgst = lineRows.reduce((total, row) => total + row.sgst, 0);

  const totalIgst = lineRows.reduce((total, row) => total + row.igst, 0);

  return (
    <div className="print-page mx-auto max-w-5xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={creditNote.branch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={creditNote.branch.name}
        address={branchAddress}
        gstin={creditNote.branch.gstin}
        phone={creditNote.branch.phone || business.phone}
        email={creditNote.branch.email || business.email}
        title="GST Credit Note"
        subtitle="Issued against returned goods"
      />

      <div className="mt-5 grid gap-5 text-sm md:grid-cols-2">
        <div className="rounded-md border p-4">
          <p>
            <strong>Credit Note No:</strong> {creditNote.returnNo}
          </p>

          <p className="mt-1">
            <strong>Credit Note Date:</strong>{" "}
            {creditNote.returnDate.toLocaleDateString("en-IN")}
          </p>

          <p className="mt-1">
            <strong>Original Invoice:</strong> {creditNote.sale.billNo}
          </p>

          <p className="mt-1">
            <strong>Invoice Date:</strong>{" "}
            {creditNote.sale.billDateTime.toLocaleDateString("en-IN")}
          </p>

          <p className="mt-1">
            <strong>Place of Supply:</strong> {placeOfSupply}
          </p>

          <p className="mt-1">
            <strong>Supply Type:</strong>{" "}
            {isInterstate ? "Inter-State" : "Intra-State"}
          </p>
        </div>

        <div className="rounded-md border p-4">
          <p className="font-semibold">Recipient</p>

          <p className="mt-1">{customer?.name || "Walk-in Customer"}</p>

          {customer?.address && <p>{customer.address}</p>}

          {customer?.mobile && <p>Mobile: {customer.mobile}</p>}

          {customer?.taxId && <p>GSTIN / Tax ID: {customer.taxId}</p>}

          {customer?.state && (
            <p>
              State: {customer.state}
              {customer.stateCode ? ` (${customer.stateCode})` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-black p-2 text-left">#</th>

              <th className="border border-black p-2 text-left">Item</th>

              <th className="border border-black p-2">HSN</th>

              <th className="border border-black p-2">Batch</th>

              <th className="border border-black p-2 text-right">Qty</th>

              <th className="border border-black p-2">Unit</th>

              <th className="border border-black p-2 text-right">Taxable</th>

              <th className="border border-black p-2 text-right">GST %</th>

              {!isInterstate && (
                <>
                  <th className="border border-black p-2 text-right">CGST</th>

                  <th className="border border-black p-2 text-right">SGST</th>
                </>
              )}

              {isInterstate && (
                <th className="border border-black p-2 text-right">IGST</th>
              )}

              <th className="border border-black p-2 text-right">Total</th>
            </tr>
          </thead>

          <tbody>
            {lineRows.map((row, index) => (
              <tr key={row.id}>
                <td className="border border-black p-2">{index + 1}</td>

                <td className="border border-black p-2">{row.product}</td>

                <td className="border border-black p-2 text-center">
                  {row.hsn}
                </td>

                <td className="border border-black p-2 text-center">
                  {row.batchNo}
                </td>

                <td className="border border-black p-2 text-right">
                  {row.qty}
                </td>

                <td className="border border-black p-2 text-center">
                  {row.unit}
                </td>

                <td className="border border-black p-2 text-right">
                  ₹{money(row.taxable)}
                </td>

                <td className="border border-black p-2 text-right">
                  {money(row.taxPercent)}%
                </td>

                {!isInterstate && (
                  <>
                    <td className="border border-black p-2 text-right">
                      ₹{money(row.cgst)}
                    </td>

                    <td className="border border-black p-2 text-right">
                      ₹{money(row.sgst)}
                    </td>
                  </>
                )}

                {isInterstate && (
                  <td className="border border-black p-2 text-right">
                    ₹{money(row.igst)}
                  </td>
                )}

                <td className="border border-black p-2 text-right font-medium">
                  ₹{money(row.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 ml-auto max-w-md space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Taxable Value</span>

          <strong>₹{money(creditNote.taxableAmount)}</strong>
        </div>

        {!isInterstate && (
          <>
            <div className="flex justify-between">
              <span>CGST Credit</span>

              <strong>₹{money(totalCgst)}</strong>
            </div>

            <div className="flex justify-between">
              <span>SGST Credit</span>

              <strong>₹{money(totalSgst)}</strong>
            </div>
          </>
        )}

        {isInterstate && (
          <div className="flex justify-between">
            <span>IGST Credit</span>

            <strong>₹{money(totalIgst)}</strong>
          </div>
        )}

        <div className="flex justify-between border-t-2 border-black pt-2 text-base">
          <span className="font-semibold">Credit Note Total</span>

          <strong>₹{money(creditNote.netAmount)}</strong>
        </div>
      </div>

      <div className="mt-5 rounded-md border p-4 text-sm">
        <p>
          <strong>Amount in words:</strong>{" "}
          {amountInWords(creditNote.netAmount)}
        </p>

        <p className="mt-2">
          <strong>Reason:</strong> {creditNote.reason}
        </p>

        {creditNote.reference && (
          <p className="mt-1">
            <strong>Reference:</strong> {creditNote.reference}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
        <div className="rounded-md border p-4">
          <p className="font-semibold">Settlement</p>

          <div className="mt-2 flex justify-between">
            <span>Adjusted against customer outstanding</span>

            <strong>₹{money(creditNote.creditApplied)}</strong>
          </div>

          <div className="mt-1 flex justify-between">
            <span>Refund Amount</span>

            <strong>₹{money(creditNote.refundAmount)}</strong>
          </div>

          {Number(creditNote.refundAmount) > 0 && (
            <div className="mt-1 flex justify-between">
              <span>Refund Mode</span>

              <strong>{paymentModeLabel(creditNote.refundMode)}</strong>
            </div>
          )}
        </div>

        <div className="rounded-md border p-4">
          <p>
            <strong>Prepared By:</strong>{" "}
            {creditNote.createdBy.fullName || creditNote.createdBy.username}
          </p>

          <div className="ml-auto mt-12 w-48 border-t border-black pt-2 text-center">
            Authorized Signatory
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs text-gray-600">
        This credit note references the original tax invoice shown above and
        records the value and GST credit arising from the returned goods.
      </p>
    </div>
  );
}
