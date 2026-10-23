import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { money } from "@/lib/transaction-utils";
import {
  financialYearFor,
  financialYearShort,
} from "@/lib/financial-year";

const schema = z.object({
  saleId: z.string().min(1),

  reason: z
    .string()
    .trim()
    .min(3)
    .max(250),

  refundMode: z
    .enum([
      "CASH",
      "UPI",
      "CARD",
      "BANK_TRANSFER",
      "OTHER",
    ])
    .optional()
    .nullable(),

  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  items: z
    .array(
      z.object({
        saleItemId: z
          .string()
          .min(1),

        qty: z.coerce
          .number()
          .int()
          .positive(),
      }),
    )
    .min(1),
});

function serializeReturn(row: any) {
  return {
    ...row,

    id:
      row.id.toString(),

    saleId:
      row.saleId.toString(),

    taxableAmount:
      Number(
        row.taxableAmount,
      ),

    taxAmount:
      Number(row.taxAmount),

    netAmount:
      Number(row.netAmount),

    creditApplied:
      Number(
        row.creditApplied,
      ),

    refundAmount:
      Number(
        row.refundAmount,
      ),

    items:
      row.items?.map(
        (item: any) => ({
          ...item,

          id:
            item.id.toString(),

          saleReturnId:
            item.saleReturnId.toString(),

          saleItemId:
            item.saleItemId.toString(),

          taxableAmount:
            Number(
              item.taxableAmount,
            ),

          taxAmount:
            Number(
              item.taxAmount,
            ),

          lineTotal:
            Number(
              item.lineTotal,
            ),
        }),
      ),
  };
}

export async function GET() {
  const session =
    await getServerSession(
      authOptions,
    );

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const rows =
    await prisma.saleReturn.findMany({
      where: {
        branchId:
          session.user.branchId,
      },

      include: {
        sale: {
          select: {
            billNo: true,
            billDateTime: true,
          },
        },

        customer: {
          select: {
            name: true,
          },
        },

        items: true,
      },

      orderBy: {
        returnDate: "desc",
      },

      take: 200,
    });

  return NextResponse.json(
    rows.map(serializeReturn),
  );
}

export async function POST(
  req: NextRequest,
) {
  const session =
    await getServerSession(
      authOptions,
    );

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (
    !can(
      session.user.role,
      "OPERATE_FINANCE",
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const parsed =
    schema.safeParse(
      await req.json(),
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid sales return",
        details:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data =
    parsed.data;

  let saleId: bigint;

  try {
    saleId =
      BigInt(data.saleId);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid sale id",
      },
      { status: 400 },
    );
  }

  const sale =
    await prisma.sale.findFirst({
      where: {
        id: saleId,

        branchId:
          session.user.branchId,

        isCancelled: false,
      },

      include: {
        customer: true,

        branch: {
          include: {
            business: true,
          },
        },

        items: true,

        returns: {
          include: {
            items: true,
          },
        },
      },
    });

  if (!sale) {
    return NextResponse.json(
      {
        error:
          "Sale not found",
      },
      { status: 404 },
    );
  }

  try {
    let taxableTotal = 0;
    let taxTotal = 0;
    let netTotal = 0;

    const lines =
      data.items.map(
        (requested) => {
          const item =
            sale.items.find(
              (row) =>
                row.id ===
                BigInt(
                  requested.saleItemId,
                ),
            );

          if (!item) {
            throw new Error(
              "Sale item not found",
            );
          }

          const alreadyReturned =
            sale.returns
              .flatMap(
                (row) =>
                  row.items,
              )
              .filter(
                (row) =>
                  row.saleItemId ===
                  item.id,
              )
              .reduce(
                (
                  total,
                  row,
                ) =>
                  total +
                  row.qty,
                0,
              );

          const availableQty =
            item.qty -
            alreadyReturned;

          if (
            requested.qty >
            availableQty
          ) {
            throw new Error(
              `Return quantity exceeds available return quantity for item ${item.id.toString()}`,
            );
          }

          const proportion =
            requested.qty /
            item.qty;

          const tax =
            money(
              Number(
                item.taxAmount,
              ) * proportion,
            );

          const lineTotal =
            money(
              Number(
                item.lineTotal,
              ) * proportion,
            );

          const taxable =
            money(
              lineTotal - tax,
            );

          taxableTotal +=
            taxable;

          taxTotal += tax;

          netTotal +=
            lineTotal;

          return {
            item,
            qty:
              requested.qty,
            taxable,
            tax,
            lineTotal,
          };
        },
      );

    taxableTotal =
      money(taxableTotal);

    taxTotal =
      money(taxTotal);

    netTotal =
      money(netTotal);

    const result =
      await prisma.$transaction(
        async (tx) => {
          const creditNoteDate =
            new Date();

          const financialYear =
            financialYearFor(
              creditNoteDate,
              sale.branch
                .business
                .financialYearStartMonth,
            );

          const sequenceRow =
            await tx.documentSequence.upsert({
              where: {
                branchId_documentType_financialYear:
                  {
                    branchId:
                      session.user
                        .branchId,

                    documentType:
                      "CREDIT_NOTE",

                    financialYear,
                  },
              },

              create: {
                branchId:
                  session.user
                    .branchId,

                documentType:
                  "CREDIT_NOTE",

                financialYear,

                nextNumber: 1,
              },

              update: {
                nextNumber: {
                  increment: 1,
                },
              },
            });

          const returnNo =
            `${sale.branch.creditNotePrefix}/${financialYearShort(
              creditNoteDate,
              sale.branch.business
                .financialYearStartMonth,
            )}/${String(
              sequenceRow.nextNumber,
            ).padStart(
              6,
              "0",
            )}`;

          /*
           * GST Rule 53 credit/debit-note
           * serial numbers are limited to
           * 16 characters.
           */
          if (
            returnNo.length >
            16
          ) {
            throw new Error(
              `Credit note number "${returnNo}" exceeds 16 characters. Shorten the Credit Note Prefix in Settings.`,
            );
          }

          /*
           * A sales return should only
           * reduce credit to the extent
           * the original sale itself had
           * credit and the customer still
           * has an outstanding balance.
           */
          const originalSaleDue =
            Number(
              sale.dueAmount,
            );

          const currentCustomerDue =
            sale.customer
              ? Number(
                  sale.customer
                    .dueAmount,
                )
              : 0;

          const creditApplied =
            sale.customerId &&
            sale.customer
              ? money(
                  Math.min(
                    netTotal,
                    originalSaleDue,
                    currentCustomerDue,
                  ),
                )
              : 0;

          const refundAmount =
            money(
              netTotal -
                creditApplied,
            );

          if (
            refundAmount > 0 &&
            !data.refundMode
          ) {
            throw new Error(
              "Refund mode is required when a cash/bank refund is due",
            );
          }

          const header =
            await tx.saleReturn.create({
              data: {
                branchId:
                  session.user
                    .branchId,

                saleId,

                customerId:
                  sale.customerId,

                returnNo,

                returnDate:
                  creditNoteDate,

                reason:
                  data.reason,

                taxableAmount:
                  taxableTotal,

                taxAmount:
                  taxTotal,

                netAmount:
                  netTotal,

                creditApplied,

                refundAmount,

                refundMode:
                  data.refundMode ||
                  null,

                reference:
                  data.reference ||
                  null,

                createdById:
                  Number(
                    session.user.id,
                  ),
              },
            });

          for (
            const line
            of lines
          ) {
            await tx.saleReturnItem.create({
              data: {
                saleReturnId:
                  header.id,

                saleItemId:
                  line.item.id,

                batchId:
                  line.item
                    .batchId,

                qty:
                  line.qty,

                taxableAmount:
                  line.taxable,

                taxAmount:
                  line.tax,

                lineTotal:
                  line.lineTotal,
              },
            });

            const batch =
              await tx.productBatch.update({
                where: {
                  id:
                    line.item
                      .batchId,
                },

                data: {
                  currentQty: {
                    increment:
                      line.qty,
                  },
                },
              });

            await tx.stockLedgerEntry.create({
              data: {
                branchId:
                  session.user
                    .branchId,

                batchId:
                  line.item
                    .batchId,

                movementType:
                  "SALE_RETURN",

                referenceType:
                  "SaleReturn",

                referenceId:
                  header.id.toString(),

                qtyChange:
                  line.qty,

                balanceAfter:
                  batch.currentQty,

                note:
                  `${returnNo} against ${sale.billNo}`,
              },
            });
          }

          if (
            sale.customerId &&
            creditApplied > 0
          ) {
            await tx.customer.update({
              where: {
                id:
                  sale.customerId,
              },

              data: {
                dueAmount: {
                  decrement:
                    creditApplied,
                },
              },
            });

            await tx.customerLedgerEntry.create({
              data: {
                branchId:
                  session.user
                    .branchId,

                customerId:
                  sale.customerId,

                saleId,

                debit: 0,

                credit:
                  creditApplied,

                note:
                  `Credit note ${returnNo} against ${sale.billNo}`,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              tenantId:
                session.user
                  .tenantId,

              branchId:
                session.user
                  .branchId,

              userId:
                Number(
                  session.user.id,
                ),

              action:
                "SALE_RETURN_CREDIT_NOTE",

              entityType:
                "SaleReturn",

              entityId:
                header.id.toString(),

              metadata:
                JSON.stringify({
                  creditNoteNo:
                    returnNo,

                  originalInvoice:
                    sale.billNo,

                  saleId:
                    data.saleId,

                  taxableTotal,
                  taxTotal,
                  netTotal,
                  creditApplied,
                  refundAmount,

                  isInterstate:
                    sale.isInterstate,

                  placeOfSupplyStateCode:
                    sale.placeOfSupplyStateCode,
                }),
            },
          });

          return header;
        },
      );

    return NextResponse.json(
      {
        id:
          result.id.toString(),

        returnNo:
          result.returnNo,

        creditNoteNo:
          result.returnNo,

        netAmount:
          netTotal,

        taxableAmount:
          taxableTotal,

        taxAmount:
          taxTotal,

        creditApplied:
          Number(
            result.creditApplied,
          ),

        refundAmount:
          Number(
            result.refundAmount,
          ),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sales return failed",
      },
      { status: 400 },
    );
  }
}
