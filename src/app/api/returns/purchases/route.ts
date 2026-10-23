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
  purchaseId: z.string().min(1),

  reason: z
    .string()
    .trim()
    .min(3)
    .max(250),

  items: z
    .array(
      z.object({
        purchaseItemId: z
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

    purchaseId:
      row.purchaseId.toString(),

    taxableAmount:
      Number(
        row.taxableAmount,
      ),

    taxAmount:
      Number(row.taxAmount),

    netAmount:
      Number(row.netAmount),

    items:
      row.items?.map(
        (item: any) => ({
          ...item,

          id:
            item.id.toString(),

          purchaseReturnId:
            item.purchaseReturnId.toString(),

          purchaseItemId:
            item.purchaseItemId.toString(),

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
    await prisma.purchaseReturn.findMany({
      where: {
        branchId:
          session.user.branchId,
      },

      include: {
        purchase: {
          select: {
            invoiceNo: true,
            invoiceDate: true,
            grnNo: true,
          },
        },

        supplier: {
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
          "Invalid purchase return",
        details:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data =
    parsed.data;

  let purchaseId: bigint;

  try {
    purchaseId =
      BigInt(data.purchaseId);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid purchase id",
      },
      { status: 400 },
    );
  }

  const purchase =
    await prisma.purchase.findFirst({
      where: {
        id: purchaseId,

        branchId:
          session.user.branchId,

        isCancelled: false,
      },

      include: {
        supplier: true,

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

  if (!purchase) {
    return NextResponse.json(
      {
        error:
          "Purchase not found",
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
            purchase.items.find(
              (row) =>
                row.id ===
                BigInt(
                  requested.purchaseItemId,
                ),
            );

          if (!item) {
            throw new Error(
              "Purchase item not found",
            );
          }

          const alreadyReturned =
            purchase.returns
              .flatMap(
                (row) =>
                  row.items,
              )
              .filter(
                (row) =>
                  row.purchaseItemId ===
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

          const totalReceivedQty =
            item.qty +
            item.freeQty;

          const availableReturnQty =
            totalReceivedQty -
            alreadyReturned;

          if (
            requested.qty >
            availableReturnQty
          ) {
            throw new Error(
              `Return quantity exceeds available return quantity for batch ${item.batchNo}`,
            );
          }

          /*
           * Free quantity carries no separate
           * purchase value. Paid quantity is
           * valued first, and the line value is
           * capped at the original purchase line.
           */
          const paidQty =
            item.qty || 1;

          const chargeableReturnQty =
            Math.min(
              requested.qty,
              item.qty,
            );

          const proportion =
            Math.min(
              1,
              chargeableReturnQty /
                paidQty,
            );

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

    if (netTotal <= 0) {
      throw new Error(
        "The selected return contains only zero-value/free quantity. Include at least one paid quantity in the Debit Note.",
      );
    }

    const result =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Keep the formal Debit Note
           * sequence separate by branch
           * and financial year.
           */
          const debitNoteDate =
            new Date();

          const financialYear =
            financialYearFor(
              debitNoteDate,
              purchase.branch
                .business
                .financialYearStartMonth,
            );

          const sequence =
            await tx.documentSequence.upsert({
              where: {
                branchId_documentType_financialYear:
                  {
                    branchId:
                      session.user
                        .branchId,

                    documentType:
                      "DEBIT_NOTE",

                    financialYear,
                  },
              },

              create: {
                branchId:
                  session.user
                    .branchId,

                documentType:
                  "DEBIT_NOTE",

                financialYear,

                nextNumber: 1,
              },

              update: {
                nextNumber: {
                  increment: 1,
                },
              },
            });

          /*
           * No debitNotePrefix currently
           * exists on Branch, so DN is used
           * as the dedicated short prefix.
           */
          const returnNo =
            `DN/${financialYearShort(
              debitNoteDate,
              purchase.branch
                .business
                .financialYearStartMonth,
            )}/${String(
              sequence.nextNumber,
            ).padStart(
              6,
              "0",
            )}`;

          if (
            returnNo.length >
            16
          ) {
            throw new Error(
              `Debit note number "${returnNo}" exceeds 16 characters.`,
            );
          }

          const header =
            await tx.purchaseReturn.create({
              data: {
                branchId:
                  session.user
                    .branchId,

                purchaseId,

                supplierId:
                  purchase.supplierId,

                returnNo,

                returnDate:
                  debitNoteDate,

                reason:
                  data.reason,

                taxableAmount:
                  taxableTotal,

                taxAmount:
                  taxTotal,

                netAmount:
                  netTotal,

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
            const batch =
              await tx.productBatch.findFirst({
                where: {
                  id:
                    line.item
                      .batchId,

                  branchId:
                    session.user
                      .branchId,
                },
              });

            if (!batch) {
              throw new Error(
                "Batch not found",
              );
            }

            if (
              batch.currentQty <
              line.qty
            ) {
              throw new Error(
                `Cannot return ${line.qty}; only ${batch.currentQty} available in ${batch.batchNo}`,
              );
            }

            const updated =
              await tx.productBatch.update({
                where: {
                  id:
                    batch.id,
                },

                data: {
                  currentQty: {
                    decrement:
                      line.qty,
                  },
                },
              });

            await tx.purchaseReturnItem.create({
              data: {
                purchaseReturnId:
                  header.id,

                purchaseItemId:
                  line.item.id,

                batchId:
                  batch.id,

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

            await tx.stockLedgerEntry.create({
              data: {
                branchId:
                  session.user
                    .branchId,

                batchId:
                  batch.id,

                movementType:
                  "PURCHASE_RETURN",

                referenceType:
                  "PurchaseReturn",

                referenceId:
                  header.id.toString(),

                qtyChange:
                  -line.qty,

                balanceAfter:
                  updated.currentQty,

                note:
                  `${returnNo} against supplier invoice ${purchase.invoiceNo}`,
              },
            });
          }

          /*
           * A purchase return reduces the
           * amount payable to the supplier.
           * Supplier ledger convention:
           * credit = payable raised,
           * debit = payable reduced.
           */
          await tx.supplierLedgerEntry.create({
            data: {
              branchId:
                session.user
                  .branchId,

              supplierId:
                purchase.supplierId,

              entryType:
                "PURCHASE_RETURN",

              referenceType:
                "PurchaseReturn",

              referenceId:
                header.id.toString(),

              debit:
                netTotal,

              credit: 0,

              note:
                `Debit note ${returnNo} against supplier invoice ${purchase.invoiceNo}`,
            },
          });

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
                "PURCHASE_RETURN_DEBIT_NOTE",

              entityType:
                "PurchaseReturn",

              entityId:
                header.id.toString(),

              metadata:
                JSON.stringify({
                  debitNoteNo:
                    returnNo,

                  originalSupplierInvoice:
                    purchase.invoiceNo,

                  grnNo:
                    purchase.grnNo,

                  purchaseId:
                    data.purchaseId,

                  supplierId:
                    purchase.supplierId,

                  taxableTotal,
                  taxTotal,
                  netTotal,

                  isInterstate:
                    purchase.isInterstate,

                  placeOfSupplyStateCode:
                    purchase.placeOfSupplyStateCode,
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

        debitNoteNo:
          result.returnNo,

        netAmount:
          netTotal,

        taxableAmount:
          taxableTotal,

        taxAmount:
          taxTotal,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Purchase return failed",
      },
      { status: 400 },
    );
  }
}
