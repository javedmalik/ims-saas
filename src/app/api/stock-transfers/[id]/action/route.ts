import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

type Context = {
  params: {
    id: string;
  };
};

const actionSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "DISPATCH",
          ),
      }),

      z.object({
        action:
          z.literal(
            "IN_TRANSIT",
          ),
      }),

      z.object({
        action:
          z.literal(
            "RECEIVE",
          ),

        receiveNote: z
          .string()
          .trim()
          .max(250)
          .optional()
          .nullable(),

        items: z
          .array(
            z.object({
              transferItemId:
                z.string()
                  .min(1),

              receivedQty:
                z.coerce
                  .number()
                  .int()
                  .min(0),
            }),
          )
          .min(1),
      }),
    ],
  );

async function loadTransfer(
  id: bigint,
) {
  return prisma.stockTransfer.findUnique({
    where: {
      id,
    },

    include: {
      fromBranch: {
        include: {
          business: true,
        },
      },

      toBranch: true,

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
}

export async function POST(
  req: NextRequest,
  { params }: Context,
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
      "MANAGE_STOCK",
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  let transferId: bigint;

  try {
    transferId =
      BigInt(params.id);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid transfer id",
      },
      { status: 400 },
    );
  }

  const parsed =
    actionSchema.safeParse(
      await req.json(),
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid transfer action",
        details:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data =
    parsed.data;

  const transfer =
    await loadTransfer(
      transferId,
    );

  if (!transfer) {
    return NextResponse.json(
      {
        error:
          "Transfer not found",
      },
      { status: 404 },
    );
  }

  if (
    transfer.fromBranch
      .businessId !==
    session.user.businessId
  ) {
    return NextResponse.json(
      {
        error:
          "Transfer belongs to another business",
      },
      { status: 403 },
    );
  }

  try {
    if (
      data.action ===
      "DISPATCH"
    ) {
      if (
        session.user.branchId !==
        transfer.fromBranchId
      ) {
        throw new Error(
          "Switch to the source branch to dispatch this transfer",
        );
      }

      if (
        transfer.status !==
        "DRAFT"
      ) {
        throw new Error(
          "Only Draft transfers can be dispatched",
        );
      }

      await prisma.$transaction(
        async (tx) => {
          for (
            const item
            of transfer.items
          ) {
            const batch =
              await tx.productBatch.findFirst({
                where: {
                  id:
                    item.sourceBatchId,

                  branchId:
                    transfer.fromBranchId,
                },

                include: {
                  product: true,
                },
              });

            if (!batch) {
              throw new Error(
                `Source batch ${item.sourceBatchId} not found`,
              );
            }

            if (
              !transfer.fromBranch.allowNegativeStock &&
              batch.currentQty <
                item.qty
            ) {
              throw new Error(
                `Insufficient stock for ${batch.product.name} / ${batch.batchNo}. Available ${batch.currentQty}, required ${item.qty}.`,
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
                      item.qty,
                  },
                },
              });

            await tx.stockLedgerEntry.create({
              data: {
                branchId:
                  transfer.fromBranchId,

                batchId:
                  batch.id,

                movementType:
                  "TRANSFER_OUT",

                referenceType:
                  "StockTransfer",

                referenceId:
                  transfer.id.toString(),

                qtyChange:
                  -item.qty,

                balanceAfter:
                  updated.currentQty,

                note:
                  `Dispatched ${transfer.transferNo} to ${transfer.toBranch.name}`,
              },
            });
          }

          const now =
            new Date();

          await tx.stockTransfer.update({
            where: {
              id:
                transfer.id,
            },

            data: {
              status:
                "DISPATCHED",

              dispatchedAt:
                now,

              dispatchedById:
                Number(
                  session.user.id,
                ),
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId:
                session.user
                  .tenantId,

              branchId:
                transfer.fromBranchId,

              userId:
                Number(
                  session.user.id,
                ),

              action:
                "STOCK_TRANSFER_DISPATCH",

              entityType:
                "StockTransfer",

              entityId:
                transfer.id.toString(),

              metadata:
                JSON.stringify({
                  transferNo:
                    transfer.transferNo,
                  toBranchId:
                    transfer.toBranchId,
                }),
            },
          });
        },
      );

      return NextResponse.json({
        id:
          transfer.id.toString(),

        transferNo:
          transfer.transferNo,

        status:
          "DISPATCHED",
      });
    }

    if (
      data.action ===
      "IN_TRANSIT"
    ) {
      if (
        session.user.branchId !==
        transfer.fromBranchId
      ) {
        throw new Error(
          "Switch to the source branch to mark this transfer In Transit",
        );
      }

      if (
        transfer.status !==
        "DISPATCHED"
      ) {
        throw new Error(
          "Only Dispatched transfers can be marked In Transit",
        );
      }

      const now =
        new Date();

      await prisma.stockTransfer.update({
        where: {
          id:
            transfer.id,
        },

        data: {
          status:
            "IN_TRANSIT",

          inTransitAt:
            now,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId:
            session.user
              .tenantId,

          branchId:
            transfer.fromBranchId,

          userId:
            Number(
              session.user.id,
            ),

          action:
            "STOCK_TRANSFER_IN_TRANSIT",

          entityType:
            "StockTransfer",

          entityId:
            transfer.id.toString(),

          metadata:
            JSON.stringify({
              transferNo:
                transfer.transferNo,
              toBranchId:
                transfer.toBranchId,
            }),
        },
      });

      return NextResponse.json({
        id:
          transfer.id.toString(),

        transferNo:
          transfer.transferNo,

        status:
          "IN_TRANSIT",
      });
    }

    /*
     * RECEIVE
     */
    if (
      session.user.branchId !==
      transfer.toBranchId
    ) {
      throw new Error(
        "Switch to the destination branch to receive this transfer",
      );
    }

    if (
      ![
        "DISPATCHED",
        "IN_TRANSIT",
      ].includes(
        transfer.status,
      )
    ) {
      throw new Error(
        "Only Dispatched or In Transit transfers can be received",
      );
    }

    const requestedMap =
      new Map(
        data.items.map(
          (item) => [
            item.transferItemId,
            item.receivedQty,
          ],
        ),
      );

    for (
      const item
      of transfer.items
    ) {
      const receivedQty =
        requestedMap.get(
          item.id.toString(),
        );

      if (
        receivedQty ===
        undefined
      ) {
        throw new Error(
          `Received quantity is required for ${item.sourceBatch.product.name} / ${item.sourceBatch.batchNo}`,
        );
      }

      if (
        receivedQty >
        item.qty
      ) {
        throw new Error(
          `Received quantity cannot exceed dispatched quantity for ${item.sourceBatch.product.name} / ${item.sourceBatch.batchNo}`,
        );
      }
    }

    const receiveResult =
      await prisma.$transaction(
        async (tx) => {
          for (
            const item
            of transfer.items
          ) {
            const receivedQty =
              requestedMap.get(
                item.id.toString(),
              ) ?? 0;

            let destinationBatchId:
              number | null =
                item.destinationBatchId;

            if (
              receivedQty > 0
            ) {
              let destinationBatch =
                await tx.productBatch.findFirst({
                  where: {
                    branchId:
                      transfer.toBranchId,

                    productId:
                      item.sourceBatch
                        .productId,

                    batchNo:
                      item.sourceBatch
                        .batchNo,
                  },
                });

              if (
                !destinationBatch
              ) {
                destinationBatch =
                  await tx.productBatch.create({
                    data: {
                      branchId:
                        transfer.toBranchId,

                      productId:
                        item.sourceBatch
                          .productId,

                      batchNo:
                        item.sourceBatch
                          .batchNo,

                      expiryDate:
                        item.sourceBatch
                          .expiryDate,

                      mrp:
                        item.sourceBatch
                          .mrp,

                      costPrice:
                        item.sourceBatch
                          .costPrice,

                      sellPrice:
                        item.sourceBatch
                          .sellPrice,

                      openingQty:
                        0,

                      currentQty:
                        receivedQty,

                      rackLocation:
                        item.sourceBatch
                          .rackLocation,
                    },
                  });
              } else {
                destinationBatch =
                  await tx.productBatch.update({
                    where: {
                      id:
                        destinationBatch.id,
                    },

                    data: {
                      currentQty: {
                        increment:
                          receivedQty,
                      },

                      expiryDate:
                        item.sourceBatch
                          .expiryDate,

                      mrp:
                        item.sourceBatch
                          .mrp,

                      costPrice:
                        item.sourceBatch
                          .costPrice,

                      sellPrice:
                        item.sourceBatch
                          .sellPrice,
                    },
                  });
              }

              destinationBatchId =
                destinationBatch.id;

              await tx.stockLedgerEntry.create({
                data: {
                  branchId:
                    transfer.toBranchId,

                  batchId:
                    destinationBatch.id,

                  movementType:
                    "TRANSFER_IN",

                  referenceType:
                    "StockTransfer",

                  referenceId:
                    transfer.id.toString(),

                  qtyChange:
                    receivedQty,

                  balanceAfter:
                    destinationBatch.currentQty,

                  note:
                    `Received ${transfer.transferNo} from ${transfer.fromBranch.name}`,
                },
              });
            }

            await tx.stockTransferItem.update({
              where: {
                id:
                  item.id,
              },

              data: {
                receivedQty,

                destinationBatchId,
              },
            });
          }

          const totalDispatched =
            transfer.items.reduce(
              (
                total,
                item,
              ) =>
                total +
                item.qty,
              0,
            );

          const totalReceived =
            transfer.items.reduce(
              (
                total,
                item,
              ) =>
                total +
                (
                  requestedMap.get(
                    item.id.toString(),
                  ) ?? 0
                ),
              0,
            );

          const variance =
            totalDispatched -
            totalReceived;

          const updated =
            await tx.stockTransfer.update({
              where: {
                id:
                  transfer.id,
              },

              data: {
                status:
                  "RECEIVED",

                receivedAt:
                  new Date(),

                receivedById:
                  Number(
                    session.user.id,
                  ),

                receiveNote:
                  data.receiveNote ||
                  (variance > 0
                    ? `Short receipt: ${variance} unit(s)`
                    : null),
              },
            });

          await tx.auditLog.create({
            data: {
              tenantId:
                session.user
                  .tenantId,

              branchId:
                transfer.toBranchId,

              userId:
                Number(
                  session.user.id,
                ),

              action:
                "STOCK_TRANSFER_RECEIVE",

              entityType:
                "StockTransfer",

              entityId:
                transfer.id.toString(),

              metadata:
                JSON.stringify({
                  transferNo:
                    transfer.transferNo,

                  fromBranchId:
                    transfer.fromBranchId,

                  totalDispatched,
                  totalReceived,
                  variance,

                  items:
                    data.items,
                }),
            },
          });

          return {
            updated,
            totalDispatched,
            totalReceived,
            variance,
          };
        },
      );

    return NextResponse.json({
      id:
        transfer.id.toString(),

      transferNo:
        transfer.transferNo,

      status:
        "RECEIVED",

      totalDispatched:
        receiveResult.totalDispatched,

      totalReceived:
        receiveResult.totalReceived,

      variance:
        receiveResult.variance,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transfer action failed",
      },
      { status: 400 },
    );
  }
}
