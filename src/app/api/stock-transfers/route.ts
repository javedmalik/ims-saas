import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import {
  financialYearFor,
  financialYearShort,
} from "@/lib/financial-year";

const createSchema = z.object({
  toBranchId: z.coerce
    .number()
    .int()
    .positive(),

  note: z
    .string()
    .trim()
    .max(250)
    .optional()
    .nullable(),

  items: z
    .array(
      z.object({
        batchId: z.coerce
          .number()
          .int()
          .positive(),

        qty: z.coerce
          .number()
          .int()
          .positive(),
      }),
    )
    .min(1),
});

function serializeTransfer(
  row: any,
) {
  return {
    ...row,

    id:
      row.id.toString(),

    items:
      row.items?.map(
        (item: any) => ({
          ...item,

          id:
            item.id.toString(),

          transferId:
            item.transferId.toString(),

          sourceBatch: item.sourceBatch
            ? {
                ...item.sourceBatch,
                mrp: Number(
                  item.sourceBatch.mrp,
                ),
                costPrice: Number(
                  item.sourceBatch
                    .costPrice,
                ),
                sellPrice: Number(
                  item.sourceBatch
                    .sellPrice,
                ),
              }
            : item.sourceBatch,
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
    await prisma.stockTransfer.findMany({
      where: {
        OR: [
          {
            fromBranchId:
              session.user
                .branchId,
          },
          {
            toBranchId:
              session.user
                .branchId,
          },
        ],
      },

      include: {
        fromBranch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },

        toBranch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },

        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },

        dispatchedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },

        receivedBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },

        items: {
          include: {
            sourceBatch: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    unit: true,
                  },
                },
              },
            },

            destinationBatch: {
              select: {
                id: true,
                batchNo: true,
              },
            },
          },
        },
      },

      orderBy: {
        transferDate: "desc",
      },

      take: 300,
    });

  return NextResponse.json(
    rows.map(
      serializeTransfer,
    ),
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
      "MANAGE_STOCK",
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const parsed =
    createSchema.safeParse(
      await req.json(),
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid stock transfer",
        details:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data =
    parsed.data;

  if (
    data.toBranchId ===
    session.user.branchId
  ) {
    return NextResponse.json(
      {
        error:
          "Destination branch must be different",
      },
      { status: 400 },
    );
  }

  const [
    sourceBranch,
    destinationBranch,
    destinationAccess,
  ] = await Promise.all([
    prisma.branch.findFirst({
      where: {
        id:
          session.user.branchId,

        businessId:
          session.user
            .businessId,

        isActive: true,
      },

      include: {
        business: true,
      },
    }),

    prisma.branch.findFirst({
      where: {
        id:
          data.toBranchId,

        businessId:
          session.user
            .businessId,

        isActive: true,
      },
    }),

    prisma.userBranchAccess.findFirst({
      where: {
        userId:
          Number(
            session.user.id,
          ),

        branchId:
          data.toBranchId,

        isActive: true,
      },

      select: {
        branchId: true,
      },
    }),
  ]);

  if (!sourceBranch) {
    return NextResponse.json(
      {
        error:
          "Source branch not found",
      },
      { status: 404 },
    );
  }

  if (!destinationBranch) {
    return NextResponse.json(
      {
        error:
          "Destination branch not found",
      },
      { status: 404 },
    );
  }

  if (!destinationAccess) {
    return NextResponse.json(
      {
        error:
          "You do not have access to the destination branch",
      },
      { status: 403 },
    );
  }

  try {
    const result =
      await prisma.$transaction(
        async (tx) => {
          const sourceBatches =
            await tx.productBatch.findMany({
              where: {
                branchId:
                  session.user
                    .branchId,

                id: {
                  in: data.items.map(
                    (item) =>
                      item.batchId,
                  ),
                },
              },

              include: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            });

          const batchMap =
            new Map(
              sourceBatches.map(
                (batch) => [
                  batch.id,
                  batch,
                ],
              ),
            );

          for (
            const requested
            of data.items
          ) {
            const batch =
              batchMap.get(
                requested.batchId,
              );

            if (!batch) {
              throw new Error(
                `Source batch ${requested.batchId} not found`,
              );
            }

            if (
              !sourceBranch.allowNegativeStock &&
              batch.currentQty <
                requested.qty
            ) {
              throw new Error(
                `Insufficient stock for ${batch.product.name} / ${batch.batchNo}`,
              );
            }
          }

          const transferDate =
            new Date();

          const financialYear =
            financialYearFor(
              transferDate,
              sourceBranch.business
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
                      "STOCK_TRANSFER",

                    financialYear,
                  },
              },

              create: {
                branchId:
                  session.user
                    .branchId,

                documentType:
                  "STOCK_TRANSFER",

                financialYear,

                nextNumber: 1,
              },

              update: {
                nextNumber: {
                  increment: 1,
                },
              },
            });

          const transferNo =
            `TRF/${financialYearShort(
              transferDate,
              sourceBranch.business
                .financialYearStartMonth,
            )}/${String(
              sequence.nextNumber,
            ).padStart(
              6,
              "0",
            )}`;

          const header =
            await tx.stockTransfer.create({
              data: {
                fromBranchId:
                  session.user
                    .branchId,

                toBranchId:
                  data.toBranchId,

                transferNo,

                transferDate,

                status:
                  "DRAFT",

                note:
                  data.note ||
                  null,

                createdById:
                  Number(
                    session.user.id,
                  ),
              },
            });

          await tx.stockTransferItem.createMany({
            data:
              data.items.map(
                (item) => ({
                  transferId:
                    header.id,

                  sourceBatchId:
                    item.batchId,

                  qty:
                    item.qty,

                  receivedQty:
                    0,
                }),
              ),
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
                "STOCK_TRANSFER_DRAFT_CREATE",

              entityType:
                "StockTransfer",

              entityId:
                header.id.toString(),

              metadata:
                JSON.stringify({
                  transferNo,
                  fromBranchId:
                    session.user
                      .branchId,
                  toBranchId:
                    data.toBranchId,
                  items:
                    data.items,
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

        transferNo:
          result.transferNo,

        status:
          result.status,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transfer draft creation failed",
      },
      { status: 400 },
    );
  }
}
