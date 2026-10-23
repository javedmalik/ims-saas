import {
  NextResponse,
} from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(
  _req: Request,
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

  let id: bigint;

  try {
    id = BigInt(params.id);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid transfer id",
      },
      { status: 400 },
    );
  }

  const row =
    await prisma.stockTransfer.findFirst({
      where: {
        id,

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
        fromBranch: true,
        toBranch: true,

        createdBy: {
          select: {
            fullName: true,
            username: true,
          },
        },

        dispatchedBy: {
          select: {
            fullName: true,
            username: true,
          },
        },

        receivedBy: {
          select: {
            fullName: true,
            username: true,
          },
        },

        items: {
          include: {
            sourceBatch: {
              include: {
                product: true,
              },
            },

            destinationBatch: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

  if (!row) {
    return NextResponse.json(
      {
        error:
          "Transfer not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ...row,

    id:
      row.id.toString(),

    items:
      row.items.map(
        (item) => ({
          ...item,

          id:
            item.id.toString(),

          transferId:
            item.transferId.toString(),

          sourceBatch: {
            ...item.sourceBatch,

            mrp:
              Number(
                item.sourceBatch.mrp,
              ),

            costPrice:
              Number(
                item.sourceBatch
                  .costPrice,
              ),

            sellPrice:
              Number(
                item.sourceBatch
                  .sellPrice,
              ),
          },

          destinationBatch:
            item.destinationBatch
              ? {
                  ...item.destinationBatch,

                  mrp:
                    Number(
                      item.destinationBatch
                        .mrp,
                    ),

                  costPrice:
                    Number(
                      item.destinationBatch
                        .costPrice,
                    ),

                  sellPrice:
                    Number(
                      item.destinationBatch
                        .sellPrice,
                    ),
                }
              : null,
        }),
      ),
  });
}
