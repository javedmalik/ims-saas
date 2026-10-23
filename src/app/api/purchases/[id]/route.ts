import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { purchaseSchema } from "@/lib/validations/transaction";

import { money, paymentLabel } from "@/lib/transaction-utils";

import { can } from "@/lib/rbac";

type Context = {
  params: {
    id: string;
  };
};

function serializePurchase(purchase: any) {
  return {
    ...purchase,

    id: purchase.id.toString(),

    grossAmount: Number(purchase.grossAmount),

    totalDiscount: Number(purchase.totalDiscount),

    taxableAmount: Number(purchase.taxableAmount),

    totalTax: Number(purchase.totalTax),

    netAmount: Number(purchase.netAmount),

    paidAmount: Number(purchase.paidAmount),

    dueAmount: Number(purchase.dueAmount),

    items: purchase.items?.map((item: any) => ({
      ...item,

      id: item.id.toString(),

      purchaseId: item.purchaseId.toString(),

      mrp: Number(item.mrp),

      costPrice: Number(item.costPrice),

      sellPrice: Number(item.sellPrice),

      discountPercent: Number(item.discountPercent),

      discountAmount: Number(item.discountAmount),

      taxPercent: Number(item.taxPercent),

      taxAmount: Number(item.taxAmount),

      lineTotal: Number(item.lineTotal),
    })),

    payments: purchase.payments?.map((payment: any) => ({
      ...payment,

      id: payment.id.toString(),

      purchaseId: payment.purchaseId.toString(),

      amount: Number(payment.amount),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const id = BigInt(params.id);

  const purchase = await prisma.purchase.findFirst({
    where: {
      id,
      branchId: session.user.branchId,
    },

    include: {
      supplier: true,

      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },

          batch: {
            select: {
              id: true,
              currentQty: true,
            },
          },
        },
      },

      payments: true,
    },
  });

  if (!purchase) {
    return NextResponse.json(
      {
        error: "Purchase not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json(serializePurchase(purchase));
}

export async function PUT(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MANAGE_PURCHASES")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const id = BigInt(params.id);

  const parsed = purchaseSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid purchase data",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  const existing = await prisma.purchase.findFirst({
    where: {
      id,
      branchId: session.user.branchId,
    },

    include: {
      items: true,
      payments: true,
      supplier: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      {
        error: "Purchase not found",
      },
      {
        status: 404,
      },
    );
  }

  if (existing.isCancelled) {
    return NextResponse.json(
      {
        error: "Cancelled purchase cannot be edited",
      },
      {
        status: 409,
      },
    );
  }

  const branch = await prisma.branch.findUnique({ where: { id: session.user.branchId } });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const supplier = await prisma.supplier.findFirst({
    where: {
      id: data.supplierId,

      businessId: session.user.businessId,

      isActive: true,
    },
  });

  if (!supplier) {
    return NextResponse.json(
      {
        error: "Invalid supplier",
      },
      {
        status: 400,
      },
    );
  }

  const productIds = [...new Set(data.items.map((item) => item.productId))];

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: productIds,
      },

      businessId: session.user.businessId,

      isActive: true,
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      {
        error: "One or more products are invalid",
      },
      {
        status: 400,
      },
    );
  }

  let grossAmount = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalTax = 0;

  const calculatedItems = data.items.map((item) => {
    const gross = money(item.costPrice * item.qty);

    const discountAmount = money((gross * item.discountPercent) / 100);

    const taxable = money(gross - discountAmount);

    const taxAmount = money((taxable * item.taxPercent) / 100);

    const lineTotal = money(taxable + taxAmount);

    grossAmount += gross;

    totalDiscount += discountAmount;

    taxableAmount += taxable;

    totalTax += taxAmount;

    return {
      ...item,

      discountAmount,

      taxAmount,

      lineTotal,
    };
  });

  grossAmount = money(grossAmount);

  totalDiscount = money(totalDiscount);

  taxableAmount = money(taxableAmount);

  totalTax = money(totalTax);

  const netAmount = money(taxableAmount + totalTax);

  const paidAmount = money(
    data.payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (paidAmount > netAmount + 0.01) {
    return NextResponse.json(
      {
        error: "Payments cannot exceed purchase total",
      },
      {
        status: 400,
      },
    );
  }

  const dueAmount = money(netAmount - paidAmount);
  const interstate = !!(supplier.stateCode && branch.stateCode && supplier.stateCode !== branch.stateCode);
  const totalCgst = interstate ? 0 : money(totalTax / 2);
  const totalSgst = interstate ? 0 : money(totalTax - totalCgst);
  const totalIgst = interstate ? totalTax : 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      /*
       * Stock adjustments are calculated as:
       *
       * old purchase quantity = negative
       * new purchase quantity = positive
       */
      const stockChanges = new Map<number, number>();

      for (const oldItem of existing.items) {
        const quantity = oldItem.qty + oldItem.freeQty;

        stockChanges.set(
          oldItem.batchId,
          (stockChanges.get(oldItem.batchId) ?? 0) - quantity,
        );
      }

      const resolvedItems: Array<{
        batchId: number;
        item: (typeof calculatedItems)[number];
      }> = [];

      for (const item of calculatedItems) {
        let batch = await tx.productBatch.findFirst({
          where: {
            branchId: session.user.branchId,

            productId: item.productId,

            batchNo: item.batchNo,
          },
        });

        if (!batch) {
          batch = await tx.productBatch.create({
            data: {
              branchId: session.user.branchId,

              productId: item.productId,

              batchNo: item.batchNo,

              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,

              mrp: item.mrp,

              costPrice: item.costPrice,

              sellPrice: item.sellPrice,

              openingQty: 0,

              currentQty: 0,
            },
          });
        }

        const quantity = item.qty + item.freeQty;

        stockChanges.set(
          batch.id,
          (stockChanges.get(batch.id) ?? 0) + quantity,
        );

        resolvedItems.push({
          batchId: batch.id,

          item,
        });
      }

      /*
       * Validate that reversing the old
       * purchase will not make stock
       * negative.
       */
      for (const [batchId, change] of stockChanges) {
        const batch = await tx.productBatch.findUnique({
          where: {
            id: batchId,
          },
        });

        if (!batch) {
          throw new Error(`Batch ${batchId} was not found`);
        }

        const newStock = batch.currentQty + change;

        if (newStock < 0) {
          throw new Error(
            `Purchase cannot be edited because stock from batch ${batch.batchNo} has already been consumed. Available stock: ${batch.currentQty}.`,
          );
        }
      }

      /*
       * Apply stock differences.
       */
      for (const [batchId, change] of stockChanges) {
        if (change === 0) {
          continue;
        }

        const updatedBatch = await tx.productBatch.update({
          where: { id: batchId },
          data: { currentQty: { increment: change } },
        });
        await tx.stockLedgerEntry.create({
          data: {
            branchId: session.user.branchId,
            batchId,
            movementType: "PURCHASE_EDIT",
            referenceType: "Purchase",
            referenceId: id.toString(),
            qtyChange: change,
            balanceAfter: updatedBatch.currentQty,
            note: `Purchase edited ${existing.invoiceNo}`,
          },
        });
      }

      /*
       * Update current batch commercial
       * details from edited GRN.
       */
      for (const resolved of resolvedItems) {
        await tx.productBatch.update({
          where: {
            id: resolved.batchId,
          },

          data: {
            expiryDate: resolved.item.expiryDate
              ? new Date(resolved.item.expiryDate)
              : null,

            mrp: resolved.item.mrp,

            costPrice: resolved.item.costPrice,

            sellPrice: resolved.item.sellPrice,
          },
        });
      }

      /*
       * Replace purchase details.
       */
      await tx.purchasePayment.deleteMany({
        where: {
          purchaseId: id,
        },
      });

      await tx.purchaseItem.deleteMany({
        where: {
          purchaseId: id,
        },
      });

      for (const resolved of resolvedItems) {
        const item = resolved.item;

        await tx.purchaseItem.create({
          data: {
            purchaseId: id,

            productId: item.productId,

            batchId: resolved.batchId,

            batchNo: item.batchNo,

            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,

            qty: item.qty,

            freeQty: item.freeQty,

            mrp: item.mrp,

            costPrice: item.costPrice,

            sellPrice: item.sellPrice,

            discountPercent: item.discountPercent,

            discountAmount: item.discountAmount,

            taxPercent: item.taxPercent,

            taxAmount: item.taxAmount,

            lineTotal: item.lineTotal,
          },
        });
      }

      for (const payment of data.payments) {
        await tx.purchasePayment.create({
          data: {
            purchaseId: id,

            branchId: session.user.branchId,

            mode: payment.mode,

            amount: payment.amount,

            reference: payment.reference || null,
          },
        });
      }

      const updated = await tx.purchase.update({
        where: {
          id,
        },

        data: {
          supplierId: data.supplierId,

          invoiceNo: data.invoiceNo,

          invoiceDate: new Date(data.invoiceDate),

          grossAmount,

          totalDiscount,

          taxableAmount,

          totalTax,

          totalCgst,

          totalSgst,

          totalIgst,

          placeOfSupplyStateCode: supplier.stateCode || branch.stateCode || null,

          isInterstate: interstate,

          netAmount,

          paymentMode: data.payments.length
            ? paymentLabel(data.payments)
            : "CREDIT",

          paidAmount,

          dueAmount,

          updatedById: Number(session.user.id),

          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,

          branchId: session.user.branchId,

          userId: Number(session.user.id),

          action: "PURCHASE_UPDATE",

          entityType: "Purchase",

          entityId: id.toString(),

          metadata: JSON.stringify({
            before: {
              supplierId: existing.supplierId,

              invoiceNo: existing.invoiceNo,

              netAmount: Number(existing.netAmount),

              paidAmount: Number(existing.paidAmount),

              dueAmount: Number(existing.dueAmount),
            },

            after: {
              supplierId: data.supplierId,

              invoiceNo: data.invoiceNo,

              netAmount,

              paidAmount,

              dueAmount,
            },
          }),
        },
      });

      return updated;
    });

    return NextResponse.json({
      id: result.id.toString(),

      netAmount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update purchase",
      },
      {
        status: 400,
      },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MANAGE_PURCHASES")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const id = BigInt(params.id);

  const body = await req.json();

  if (body.action !== "cancel") {
    return NextResponse.json(
      {
        error: "Unsupported action",
      },
      {
        status: 400,
      },
    );
  }

  const purchase = await prisma.purchase.findFirst({
    where: {
      id,

      branchId: session.user.branchId,
    },

    include: {
      items: true,
    },
  });

  if (!purchase) {
    return NextResponse.json(
      {
        error: "Purchase not found",
      },
      {
        status: 404,
      },
    );
  }

  if (purchase.isCancelled) {
    return NextResponse.json(
      {
        error: "Purchase already cancelled",
      },
      {
        status: 409,
      },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of purchase.items) {
        const quantity = item.qty + item.freeQty;

        const batch = await tx.productBatch.findUnique({
          where: {
            id: item.batchId,
          },
        });

        if (!batch || batch.currentQty < quantity) {
          throw new Error(
            `Cannot cancel purchase because stock from batch ${item.batchNo} has already been consumed.`,
          );
        }

        const updatedBatch = await tx.productBatch.update({
          where: { id: item.batchId },
          data: { currentQty: { decrement: quantity } },
        });
        await tx.stockLedgerEntry.create({
          data: {
            branchId: session.user.branchId,
            batchId: item.batchId,
            movementType: "PURCHASE_CANCEL",
            referenceType: "Purchase",
            referenceId: id.toString(),
            qtyChange: -quantity,
            balanceAfter: updatedBatch.currentQty,
            note: `Cancelled purchase ${purchase.invoiceNo}`,
          },
        });
      }

      await tx.purchase.update({
        where: {
          id,
        },

        data: {
          isCancelled: true,

          cancelReason: String(body.reason || "Cancelled"),

          updatedById: Number(session.user.id),

          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,

          branchId: session.user.branchId,

          userId: Number(session.user.id),

          action: "PURCHASE_CANCEL",

          entityType: "Purchase",

          entityId: id.toString(),

          metadata: JSON.stringify({
            reason: body.reason || "Cancelled",
          }),
        },
      });
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to cancel purchase",
      },
      {
        status: 400,
      },
    );
  }
}
