import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

const schema = z.object({
  supplierId: z.coerce
    .number()
    .int()
    .positive(),

  amount: z.coerce
    .number()
    .positive(),

  mode: z.enum([
    "CASH",
    "UPI",
    "CARD",
    "BANK_TRANSFER",
    "OTHER",
  ]),

  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),

  note: z
    .string()
    .trim()
    .max(250)
    .optional()
    .nullable(),
});

async function outstanding(
  branchId: number,
  supplierId: number,
) {
  const [
    purchases,
    payments,
    returns,
  ] = await Promise.all([
    prisma.purchase.aggregate({
      where: {
        branchId,
        supplierId,
        isCancelled: false,
      },
      _sum: {
        dueAmount: true,
      },
    }),

    prisma.supplierPayment.aggregate({
      where: {
        branchId,
        supplierId,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.purchaseReturn.aggregate({
      where: {
        branchId,
        supplierId,
      },
      _sum: {
        netAmount: true,
      },
    }),
  ]);

  return Math.max(
    0,
    Number(
      purchases._sum.dueAmount ??
        0,
    ) -
      Number(
        payments._sum.amount ??
          0,
      ) -
      Number(
        returns._sum.netAmount ??
          0,
      ),
  );
}

export async function GET(
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

  const supplierId = Number(
    req.nextUrl.searchParams.get(
      "supplierId",
    ) || 0,
  );

  if (supplierId) {
    const supplier =
      await prisma.supplier.findFirst({
        where: {
          id: supplierId,
          businessId:
            session.user.businessId,
          isActive: true,
        },

        select: {
          id: true,
          name: true,
        },
      });

    if (!supplier) {
      return NextResponse.json(
        {
          error:
            "Supplier not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      supplierId,
      supplierName:
        supplier.name,
      outstanding:
        await outstanding(
          session.user.branchId,
          supplierId,
        ),
    });
  }

  const suppliers =
    await prisma.supplier.findMany({
      where: {
        businessId:
          session.user.businessId,
        isActive: true,
      },

      select: {
        id: true,
        name: true,
      },

      orderBy: {
        name: "asc",
      },
    });

  const rows =
    await Promise.all(
      suppliers.map(
        async (supplier) => ({
          id: supplier.id,
          name: supplier.name,

          outstanding:
            await outstanding(
              session.user
                .branchId,
              supplier.id,
            ),
        }),
      ),
    );

  return NextResponse.json(
    rows,
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
          "Invalid supplier payment",
        details:
          parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data =
    parsed.data;

  const supplier =
    await prisma.supplier.findFirst({
      where: {
        id: data.supplierId,
        businessId:
          session.user.businessId,
        isActive: true,
      },
    });

  if (!supplier) {
    return NextResponse.json(
      {
        error:
          "Supplier not found",
      },
      { status: 404 },
    );
  }

  const dueBefore =
    await outstanding(
      session.user.branchId,
      data.supplierId,
    );

  if (
    data.amount >
    dueBefore + 0.01
  ) {
    return NextResponse.json(
      {
        error:
          `Payment cannot exceed payable ₹${dueBefore.toFixed(
            2,
          )}`,
      },
      { status: 400 },
    );
  }

  const row =
    await prisma.$transaction(
      async (tx) => {
        const last =
          await tx.supplierPayment.findFirst({
            where: {
              branchId:
                session.user.branchId,
            },

            orderBy: {
              id: "desc",
            },

            select: {
              id: true,
            },
          });

        const paymentNo =
          `SPAY-${String(
            Number(
              last?.id ?? 0,
            ) + 1,
          ).padStart(6, "0")}`;

        const payment =
          await tx.supplierPayment.create({
            data: {
              branchId:
                session.user.branchId,

              supplierId:
                data.supplierId,

              paymentNo,

              mode: data.mode,

              amount:
                data.amount,

              reference:
                data.reference ||
                null,

              note:
                data.note || null,

              createdById:
                Number(
                  session.user.id,
                ),
            },
          });

        await tx.supplierLedgerEntry.create({
          data: {
            branchId:
              session.user.branchId,

            supplierId:
              data.supplierId,

            entryType:
              "PAYMENT",

            referenceType:
              "SupplierPayment",

            referenceId:
              payment.id.toString(),

            debit:
              data.amount,

            credit: 0,

            note:
              `Supplier payment ${paymentNo}` +
              (data.note
                ? ` - ${data.note}`
                : ""),
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId:
              session.user.tenantId,

            branchId:
              session.user.branchId,

            userId:
              Number(
                session.user.id,
              ),

            action:
              "SUPPLIER_PAYMENT",

            entityType:
              "SupplierPayment",

            entityId:
              payment.id.toString(),

            metadata:
              JSON.stringify({
                paymentNo,
                supplierId:
                  data.supplierId,
                supplierName:
                  supplier.name,
                amount:
                  data.amount,
                mode:
                  data.mode,
                dueBefore,
                dueAfter:
                  Math.max(
                    0,
                    dueBefore -
                      data.amount,
                  ),
              }),
          },
        });

        return payment;
      },
    );

  const dueAfter =
    Math.max(
      0,
      dueBefore - data.amount,
    );

  return NextResponse.json(
    {
      id: row.id.toString(),
      paymentNo: row.paymentNo,
      supplierId:
        row.supplierId,
      supplierName:
        supplier.name,
      amount:
        Number(row.amount),
      outstandingAfter:
        dueAfter,
    },
    { status: 201 },
  );
}
