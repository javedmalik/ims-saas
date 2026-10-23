import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

function paymentModeLabel(mode: string) {
  return mode
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function integerToWords(value: number): string {
  if (value === 0) return "Zero";

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

  const belowThousand = (num: number): string => {
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

  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (value) parts.push(belowThousand(value));

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

export default async function CustomerReceiptPrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let receiptId: bigint;

  try {
    receiptId = BigInt(params.id);
  } catch {
    notFound();
  }

  const receipt = await prisma.customerReceipt.findFirst({
    where: {
      id: receiptId,
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
    },
  });

  if (!receipt) {
    notFound();
  }

  const business = receipt.branch.business;

  const branchAddress = [
    receipt.branch.addressLine1,
    receipt.branch.addressLine2,
    receipt.branch.city,
    receipt.branch.state,
    receipt.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="print-page mx-auto max-w-4xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={receipt.branch.logoUrl || business.logoUrl}
        legalName={business.legalName}
        tradeName={business.tradeName}
        branchName={receipt.branch.name}
        address={branchAddress}
        gstin={receipt.branch.gstin}
        phone={receipt.branch.phone || business.phone}
        email={receipt.branch.email || business.email}
        title="Payment Receipt"
      />

      <div className="mt-6 grid grid-cols-1 gap-6 text-sm md:grid-cols-2">
        <div className="space-y-1">
          <p>
            <strong>Receipt No:</strong> {receipt.receiptNo}
          </p>
          <p>
            <strong>Receipt Date:</strong>{" "}
            {receipt.receiptDate.toLocaleString("en-IN")}
          </p>
          <p>
            <strong>Payment Mode:</strong> {paymentModeLabel(receipt.mode)}
          </p>
          {receipt.reference && (
            <p>
              <strong>Reference:</strong> {receipt.reference}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p>
            <strong>Received From:</strong> {receipt.customer.name}
          </p>
          {receipt.customer.mobile && (
            <p>
              <strong>Mobile:</strong> {receipt.customer.mobile}
            </p>
          )}
          {receipt.customer.taxId && (
            <p>
              <strong>GSTIN / Tax ID:</strong> {receipt.customer.taxId}
            </p>
          )}
          {receipt.customer.address && (
            <p>
              <strong>Address:</strong> {receipt.customer.address}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-md border-2 border-black p-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-semibold">Amount Received</span>
          <span className="text-3xl font-bold">₹{money(receipt.amount)}</span>
        </div>

        <div className="mt-4 border-t pt-4 text-sm">
          <strong>Amount in words:</strong> {amountInWords(receipt.amount)}
        </div>
      </div>

      {receipt.note && (
        <div className="mt-5 rounded-md border p-4 text-sm">
          <strong>Note:</strong> {receipt.note}
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>
            <strong>Received By:</strong>{" "}
            {receipt.createdBy.fullName || receipt.createdBy.username}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            This receipt records payment received against the customer
            account.
          </p>
        </div>

        <div className="text-right">
          <div className="ml-auto mt-8 w-48 border-t border-black pt-2 text-center">
            Authorized Signatory
          </div>
        </div>
      </div>
    </div>
  );
}
