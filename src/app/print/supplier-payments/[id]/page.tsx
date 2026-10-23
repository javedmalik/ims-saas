import {
  notFound,
  redirect,
} from "next/navigation";
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

function paymentModeLabel(mode: string) {
  return mode
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase(),
    );
}

function integerToWords(
  value: number,
): string {
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

  const belowThousand = (
    num: number,
  ): string => {
    const parts: string[] = [];

    if (num >= 100) {
      parts.push(
        `${ones[Math.floor(num / 100)]} Hundred`,
      );

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

  const crore = Math.floor(
    value / 10000000,
  );

  value %= 10000000;

  const lakh = Math.floor(
    value / 100000,
  );

  value %= 100000;

  const thousand = Math.floor(
    value / 1000,
  );

  value %= 1000;

  if (crore) {
    parts.push(
      `${belowThousand(crore)} Crore`,
    );
  }

  if (lakh) {
    parts.push(
      `${belowThousand(lakh)} Lakh`,
    );
  }

  if (thousand) {
    parts.push(
      `${belowThousand(thousand)} Thousand`,
    );
  }

  if (value) {
    parts.push(
      belowThousand(value),
    );
  }

  return parts.join(" ");
}

function amountInWords(
  value: unknown,
) {
  const amount = Number(value ?? 0);

  const rupees =
    Math.floor(amount);

  const paise = Math.round(
    (amount - rupees) * 100,
  );

  let result =
    `${integerToWords(rupees)} Rupees`;

  if (paise > 0) {
    result +=
      ` and ${integerToWords(paise)} Paise`;
  }

  return `${result} Only`;
}

export default async function SupplierPaymentPrintPage({
  params,
}: Props) {
  const session =
    await getServerSession(
      authOptions,
    );

  if (!session) {
    redirect("/login");
  }

  if (
    !can(
      session.user.role,
      "OPERATE_FINANCE",
    )
  ) {
    redirect(
      "/dashboard?error=forbidden",
    );
  }

  let paymentId: bigint;

  try {
    paymentId =
      BigInt(params.id);
  } catch {
    notFound();
  }

  const payment =
    await prisma.supplierPayment.findFirst({
      where: {
        id: paymentId,
        branchId:
          session.user.branchId,
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
      },
    });

  if (!payment) {
    notFound();
  }

  const business =
    payment.branch.business;

  const branchAddress = [
    payment.branch.addressLine1,
    payment.branch.addressLine2,
    payment.branch.city,
    payment.branch.state,
    payment.branch.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const supplierAddress = [
    payment.supplier.addressLine1,
    payment.supplier.addressLine2,
    payment.supplier.city,
    payment.supplier.state,
    payment.supplier.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="print-page mx-auto max-w-4xl bg-white p-6 text-black">
      <PrintButton />

      <PrintHeader
        logoUrl={
          payment.branch.logoUrl ||
          business.logoUrl
        }
        legalName={
          business.legalName
        }
        tradeName={
          business.tradeName
        }
        branchName={
          payment.branch.name
        }
        address={branchAddress}
        gstin={
          payment.branch.gstin
        }
        phone={
          payment.branch.phone ||
          business.phone
        }
        email={
          payment.branch.email ||
          business.email
        }
        title="Supplier Payment Voucher"
      />

      <div className="mt-6 grid grid-cols-1 gap-6 text-sm md:grid-cols-2">
        <div className="space-y-1">
          <p>
            <strong>
              Payment No:
            </strong>{" "}
            {payment.paymentNo}
          </p>

          <p>
            <strong>
              Payment Date:
            </strong>{" "}
            {payment.paymentDate.toLocaleString(
              "en-IN",
            )}
          </p>

          <p>
            <strong>
              Payment Mode:
            </strong>{" "}
            {paymentModeLabel(
              payment.mode,
            )}
          </p>

          {payment.reference && (
            <p>
              <strong>
                Reference:
              </strong>{" "}
              {payment.reference}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p>
            <strong>
              Paid To:
            </strong>{" "}
            {payment.supplier.name}
          </p>

          {payment.supplier
            .contactPerson && (
            <p>
              <strong>
                Contact Person:
              </strong>{" "}
              {
                payment.supplier
                  .contactPerson
              }
            </p>
          )}

          {(payment.supplier.mobile ||
            payment.supplier.phone) && (
            <p>
              <strong>
                Contact:
              </strong>{" "}
              {payment.supplier
                .mobile ||
                payment.supplier
                  .phone}
            </p>
          )}

          {payment.supplier
            .taxId && (
            <p>
              <strong>
                GSTIN / Tax ID:
              </strong>{" "}
              {
                payment.supplier
                  .taxId
              }
            </p>
          )}

          {supplierAddress && (
            <p>
              <strong>
                Address:
              </strong>{" "}
              {supplierAddress}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-md border-2 border-black p-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-semibold">
            Amount Paid
          </span>

          <span className="text-3xl font-bold">
            ₹{money(payment.amount)}
          </span>
        </div>

        <div className="mt-4 border-t pt-4 text-sm">
          <strong>
            Amount in words:
          </strong>{" "}
          {amountInWords(
            payment.amount,
          )}
        </div>
      </div>

      {payment.note && (
        <div className="mt-5 rounded-md border p-4 text-sm">
          <strong>Note:</strong>{" "}
          {payment.note}
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>
            <strong>
              Prepared By:
            </strong>{" "}
            {payment.createdBy
              .fullName ||
              payment.createdBy
                .username}
          </p>

          <p className="mt-1 text-xs text-gray-600">
            This voucher records a
            payment made to the
            supplier against the
            branch payable account.
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
