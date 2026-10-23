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

export default async function DebitNotePrintPage({ params }: Props) {
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

  const debitNote = await prisma.purchaseReturn.findFirst({
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

      supplier: true,

      createdBy: {
        select: {
          fullName: true,
          username: true,
        },
      },

      purchase: true,

      items: {
        include: {
          purchaseItem: {
            include: {
              product: true,
              batch: true,
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

  if (!debitNote) {
    notFound();
  }

  const business = debitNote.branch.business;

  const supplier = debitNote.supplier;

  const branchAddress = [
    debitNote.branch.addressLine1,
    debitNote.branch.addressLine2,
    debitNote.branch.city,
    debitNote.branch.state,
    debitNote.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const supplierAddress = [
    supplier.addressLine1,
    supplier.addressLine2,
    supplier.city,
    supplier.state,
    supplier.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const isInterstate = debitNote.purchase.isInterstate;

  const placeOfSupply =
    [
      debitNote.branch.state,
      debitNote.purchase.placeOfSupplyStateCode
        ? `(${debitNote.purchase.placeOfSupplyStateCode})`
        : null,
    ]
      .filter(Boolean)
      .join(" ") ||
    debitNote.purchase.placeOfSupplyStateCode ||
    "—";

  const lineRows = debitNote.items.map((item) => {
    const purchaseItem = item.purchaseItem;

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

      taxPercent: Number(purchaseItem.taxPercent),

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
        logoUrl={debitNote.branch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={debitNote.branch.name}
        address={branchAddress}
        gstin={debitNote.branch.gstin}
        phone={debitNote.branch.phone || business.phone}
        email={debitNote.branch.email || business.email}
        title="Purchase Return / Debit Note"
        subtitle="Issued against goods returned to supplier"
      />

      <div className="mt-5 grid gap-5 text-sm md:grid-cols-2">
        <div className="rounded-md border p-4">
          <p>
            <strong>Debit Note No:</strong> {debitNote.returnNo}
          </p>

          <p className="mt-1">
            <strong>Debit Note Date:</strong>{" "}
            {debitNote.returnDate.toLocaleDateString("en-IN")}
          </p>

          <p className="mt-1">
            <strong>Supplier Invoice:</strong> {debitNote.purchase.invoiceNo}
          </p>

          <p className="mt-1">
            <strong>Supplier Invoice Date:</strong>{" "}
            {debitNote.purchase.invoiceDate.toLocaleDateString("en-IN")}
          </p>

          {debitNote.purchase.grnNo && (
            <p className="mt-1">
              <strong>GRN No:</strong> {debitNote.purchase.grnNo}
            </p>
          )}

          <p className="mt-1">
            <strong>Place of Supply:</strong> {placeOfSupply}
          </p>

          <p className="mt-1">
            <strong>Supply Type:</strong>{" "}
            {isInterstate ? "Inter-State" : "Intra-State"}
          </p>
        </div>

        <div className="rounded-md border p-4">
          <p className="font-semibold">Supplier</p>

          <p className="mt-1">{supplier.name}</p>

          {supplier.contactPerson && (
            <p>Contact Person: {supplier.contactPerson}</p>
          )}

          {supplierAddress && <p>{supplierAddress}</p>}

          {(supplier.mobile || supplier.phone) && (
            <p>Contact: {supplier.mobile || supplier.phone}</p>
          )}

          {supplier.taxId && <p>GSTIN / Tax ID: {supplier.taxId}</p>}

          {supplier.state && (
            <p>
              State: {supplier.state}
              {supplier.stateCode ? ` (${supplier.stateCode})` : ""}
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

          <strong>₹{money(debitNote.taxableAmount)}</strong>
        </div>

        {!isInterstate && (
          <>
            <div className="flex justify-between">
              <span>CGST</span>

              <strong>₹{money(totalCgst)}</strong>
            </div>

            <div className="flex justify-between">
              <span>SGST</span>

              <strong>₹{money(totalSgst)}</strong>
            </div>
          </>
        )}

        {isInterstate && (
          <div className="flex justify-between">
            <span>IGST</span>

            <strong>₹{money(totalIgst)}</strong>
          </div>
        )}

        <div className="flex justify-between border-t-2 border-black pt-2 text-base">
          <span className="font-semibold">Debit Note Total</span>

          <strong>₹{money(debitNote.netAmount)}</strong>
        </div>
      </div>

      <div className="mt-5 rounded-md border p-4 text-sm">
        <p>
          <strong>Amount in words:</strong> {amountInWords(debitNote.netAmount)}
        </p>

        <p className="mt-2">
          <strong>Reason for Return:</strong> {debitNote.reason}
        </p>
      </div>

      <div className="mt-5 rounded-md border p-4 text-sm">
        <p className="font-semibold">Ledger Effect</p>

        <p className="mt-2">
          Supplier payable reduced by{" "}
          <strong>₹{money(debitNote.netAmount)}</strong>.
        </p>

        <p className="mt-1 text-xs text-gray-600">
          Where the supplier account is already fully settled, the debit balance
          represents an amount recoverable/adjustable with the supplier.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>
            <strong>Prepared By:</strong>{" "}
            {debitNote.createdBy.fullName || debitNote.createdBy.username}
          </p>
        </div>

        <div className="text-right">
          <div className="ml-auto mt-8 w-48 border-t border-black pt-2 text-center">
            Authorized Signatory
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs text-gray-600">
        This document records the purchase-return adjustment against the
        supplier invoice referenced above. Confirm GST return/reporting
        treatment with your tax adviser where required.
      </p>
    </div>
  );
}
