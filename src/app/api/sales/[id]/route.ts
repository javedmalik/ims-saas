import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { saleSchema } from "@/lib/validations/transaction";

import { money, paymentLabel } from "@/lib/transaction-utils";

import { can } from "@/lib/rbac";

type Context = {
  params: {
    id: string;
  };
};

function serializeSale(sale: any) {
  return {
    ...sale,

    id: sale.id.toString(),

    grossAmount: Number(sale.grossAmount),

    totalDiscount: Number(sale.totalDiscount),

    taxableAmount: Number(sale.taxableAmount),

    totalCgst: Number(sale.totalCgst),

    totalSgst: Number(sale.totalSgst),

    totalIgst: Number(sale.totalIgst),

    netAmount: Number(sale.netAmount),

    receivedAmount: Number(sale.receivedAmount),

    dueAmount: Number(sale.dueAmount),

    items: sale.items?.map((item: any) => ({
      ...item,

      id: item.id.toString(),

      saleId: item.saleId.toString(),

      rate: Number(item.rate),

      discountPercent: Number(item.discountPercent),

      discountAmount: Number(item.discountAmount),

      taxPercent: Number(item.taxPercent),

      taxAmount: Number(item.taxAmount),

      lineTotal: Number(item.lineTotal),

      batch: {
        ...item.batch,

        mrp: Number(item.batch.mrp),

        costPrice: Number(item.batch.costPrice),

        sellPrice: Number(item.batch.sellPrice),
      },
    })),

    payments: sale.payments?.map((payment: any) => ({
      ...payment,

      id: payment.id.toString(),

      saleId: payment.saleId.toString(),

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

  const sale = await prisma.sale.findFirst({
    where: {
      id: BigInt(params.id),

      branchId: session.user.branchId,
    },

    include: {
      customer: true,

      items: {
        include: {
          batch: {
            include: {
              product: true,
            },
          },
        },
      },

      payments: true,
    },
  });

  if (!sale) {
    return NextResponse.json(
      {
        error: "Sale not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json(serializeSale(sale));
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

  if (!can(session.user.role, "MAKE_SALE")) {
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

  const parsed = saleSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid sale data",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  const existing = await prisma.sale.findFirst({
    where: {
      id,

      branchId: session.user.branchId,
    },

    include: {
      items: true,
      payments: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      {
        error: "Sale not found",
      },
      {
        status: 404,
      },
    );
  }

  if (existing.isCancelled) {
    return NextResponse.json(
      {
        error: "Cancelled sale cannot be edited",
      },
      {
        status: 409,
      },
    );
  }

  const branch = await prisma.branch.findUnique({
    where: {
      id: session.user.branchId,
    },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Branch not found",
      },
      {
        status: 400,
      },
    );
  }

  let customer: any = null;

  if (data.customerId) {
    customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,

        businessId: session.user.businessId,

        isActive: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Invalid customer",
        },
        {
          status: 400,
        },
      );
    }
  }

  const batchIds = [...new Set(data.items.map((item) => item.batchId))];

  const batches = await prisma.productBatch.findMany({
    where: {
      id: {
        in: batchIds,
      },

      branchId: session.user.branchId,
    },

    include: {
      product: true,
    },
  });

  if (batches.length !== batchIds.length) {
    return NextResponse.json(
      {
        error: "One or more sale batches are invalid",
      },
      {
        status: 400,
      },
    );
  }

  for (const batch of batches) {
    if (batch.expiryDate) {
      const expiry = new Date(batch.expiryDate);
      expiry.setHours(23, 59, 59, 999);
      if (expiry < new Date()) {
        return NextResponse.json(
          {
            error: `Expired batch cannot be used: ${batch.product.name} / ${batch.batchNo}`,
          },
          { status: 400 },
        );
      }
    }
  }

  let grossAmount = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalTax = 0;

  const calculatedItems = data.items.map((item: any) => {
    const batch = batches.find((b:any) => b.id === item.batchId)!;

    const rate = item.rate ?? Number(batch.sellPrice);

    const taxPercent = Number(batch.product.defaultTaxPercent);

    const gross = money(rate * item.qty);

    const discountAmount = money((gross * item.discountPercent) / 100);

    const afterDiscount = money(gross - discountAmount);

    let taxable: number;
    let taxAmount: number;

    if (branch.pricesIncludeTax && taxPercent > 0) {
      taxable = money(afterDiscount / (1 + taxPercent / 100));

      taxAmount = money(afterDiscount - taxable);
    } else {
      taxable = afterDiscount;

      taxAmount = money((taxable * taxPercent) / 100);
    }

    grossAmount += gross;

    totalDiscount += discountAmount;

    taxableAmount += taxable;

    totalTax += taxAmount;

    return {
      input: item,

      batch,

      rate,

      taxPercent,

      discountAmount,

      taxAmount,

      costPriceAtSale: money(Number(batch.costPrice)),

      costAmount: money(Number(batch.costPrice) * item.qty),

      lineTotal: money(taxable + taxAmount),
    };
  });

  grossAmount = money(grossAmount);

  totalDiscount = money(totalDiscount);

  taxableAmount = money(taxableAmount);

  totalTax = money(totalTax);

  const netAmount = money(taxableAmount + totalTax);

  const paymentTotal = money(
    data.payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (Math.abs(paymentTotal - netAmount) > 0.02) {
    return NextResponse.json(
      {
        error: `Payments must equal bill total ₹${netAmount.toFixed(
          2,
        )}. Current payment total ₹${paymentTotal.toFixed(2)}.`,
      },
      {
        status: 400,
      },
    );
  }

  const creditAmount = money(
    data.payments
      .filter((payment) => payment.mode === "CREDIT")
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  if (creditAmount > 0 && !customer) {
    return NextResponse.json(
      {
        error: "Customer is required for credit sale",
      },
      {
        status: 400,
      },
    );
  }

  const receivedAmount = money(netAmount - creditAmount);

  const interstate = !!(
    customer?.stateCode &&
    branch.stateCode &&
    customer.stateCode !== branch.stateCode
  );

  const totalCgst = interstate ? 0 : money(totalTax / 2);

  const totalSgst = interstate ? 0 : money(totalTax - totalCgst);

  const totalIgst = interstate ? totalTax : 0;

  try {
    const updated = await prisma.$transaction(async (tx: any) => {
      /*
       * Stock formula:
       *
       * restore old quantities
       * then subtract edited quantities.
       */
      const stockChanges = new Map<number, number>();

      for (const oldItem of existing.items) {
        stockChanges.set(
          oldItem.batchId,
          (stockChanges.get(oldItem.batchId) ?? 0) + oldItem.qty,
        );
      }

      for (const item of calculatedItems) {
        stockChanges.set(
          item.batch.id,
          (stockChanges.get(item.batch.id) ?? 0) - item.input.qty,
        );
      }

      for (const [batchId, change] of stockChanges) {
        const batch = await tx.productBatch.findUnique({
          where: {
            id: batchId,
          },
        });

        if (!batch) {
          throw new Error(`Batch ${batchId} not found`);
        }

        const finalStock = batch.currentQty + change;

        if (!branch.allowNegativeStock && finalStock < 0) {
          throw new Error(`Insufficient stock in batch ${batch.batchNo}.`);
        }
      }

      /*
       * Existing credit sale reversal.
       */
      if (existing.customerId && Number(existing.dueAmount) > 0) {
        const oldCustomer = await tx.customer.findUnique({
          where: {
            id: existing.customerId,
          },
        });

        if (!oldCustomer) {
          throw new Error("Original customer not found");
        }

        const oldDue = Number(existing.dueAmount);

        /*
         * If old credit has already been
         * settled, editing the historical
         * sale is unsafe.
         */
        if (Number(oldCustomer.dueAmount) + 0.01 < oldDue) {
          throw new Error(
            "This sale cannot be edited because its credit amount appears to have already been settled.",
          );
        }

        await tx.customer.update({
          where: {
            id: existing.customerId,
          },

          data: {
            dueAmount: {
              decrement: existing.dueAmount,
            },
          },
        });
      }

      await tx.customerLedgerEntry.deleteMany({
        where: {
          saleId: id,
        },
      });

      /*
       * Apply stock difference.
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
            movementType: "SALE_EDIT",
            referenceType: "Sale",
            referenceId: id.toString(),
            qtyChange: change,
            balanceAfter: updatedBatch.currentQty,
            note: `Sale edited ${existing.billNo}`,
          },
        });
      }

      await tx.salePayment.deleteMany({
        where: {
          saleId: id,
        },
      });

      await tx.saleItem.deleteMany({
        where: {
          saleId: id,
        },
      });

      for (const item of calculatedItems) {
        await tx.saleItem.create({
          data: {
            saleId: id,

            batchId: item.batch.id,

            qty: item.input.qty,

            rate: item.rate,

            discountPercent: item.input.discountPercent,

            discountAmount: item.discountAmount,

            taxPercent: item.taxPercent,

            taxAmount: item.taxAmount,

            costPriceAtSale: item.costPriceAtSale,

            costAmount: item.costAmount,

            lineTotal: item.lineTotal,
          },
        });
      }

      for (const payment of data.payments) {
        await tx.salePayment.create({
          data: {
            saleId: id,

            branchId: session.user.branchId,

            mode: payment.mode,

            amount: payment.amount,

            reference: payment.reference || null,
          },
        });
      }

      if (customer && creditAmount > 0) {
        await tx.customer.update({
          where: {
            id: customer.id,
          },

          data: {
            dueAmount: {
              increment: creditAmount,
            },
          },
        });

        await tx.customerLedgerEntry.create({
          data: {
            branchId: session.user.branchId,

            customerId: customer.id,

            saleId: id,

            debit: creditAmount,

            credit: 0,

            note: `Credit sale ${existing.billNo}`,
          },
        });
      }

      const sale = await tx.sale.update({
        where: {
          id,
        },

        data: {
          customerId: data.customerId || null,

          grossAmount,

          totalDiscount,

          taxableAmount,

          totalCgst,

          totalSgst,

          totalIgst,

          placeOfSupplyStateCode:
            customer?.stateCode || branch.stateCode || null,

          isInterstate: interstate,

          netAmount,

          paymentMode: paymentLabel(data.payments),

          receivedAmount,

          dueAmount: creditAmount,

          updatedById: Number(session.user.id),

          updatedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,

          branchId: session.user.branchId,

          userId: Number(session.user.id),

          action: "SALE_UPDATE",

          entityType: "Sale",

          entityId: id.toString(),

          metadata: JSON.stringify({
            before: {
              customerId: existing.customerId,

              netAmount: Number(existing.netAmount),

              receivedAmount: Number(existing.receivedAmount),

              dueAmount: Number(existing.dueAmount),
            },

            after: {
              customerId: data.customerId || null,

              netAmount,

              receivedAmount,

              dueAmount: creditAmount,
            },
          }),
        },
      });

      return sale;
    });

    return NextResponse.json({
      id: updated.id.toString(),

      billNo: updated.billNo,

      netAmount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update sale",
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

  if (!can(session.user.role, "CANCEL_SALE")) {
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

  const sale = await prisma.sale.findFirst({
    where: {
      id,

      branchId: session.user.branchId,
    },

    include: {
      items: true,
    },
  });

  if (!sale) {
    return NextResponse.json(
      {
        error: "Sale not found",
      },
      {
        status: 404,
      },
    );
  }

  if (sale.isCancelled) {
    return NextResponse.json(
      {
        error: "Sale already cancelled",
      },
      {
        status: 409,
      },
    );
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      for (const item of sale.items) {
        const updatedBatch = await tx.productBatch.update({
          where: { id: item.batchId },
          data: { currentQty: { increment: item.qty } },
        });
        await tx.stockLedgerEntry.create({
          data: {
            branchId: session.user.branchId,
            batchId: item.batchId,
            movementType: "SALE_CANCEL",
            referenceType: "Sale",
            referenceId: id.toString(),
            qtyChange: item.qty,
            balanceAfter: updatedBatch.currentQty,
            note: `Cancelled sale ${sale.billNo}`,
          },
        });
      }

      if (sale.customerId && Number(sale.dueAmount) > 0) {
        const customer = await tx.customer.findUnique({
          where: {
            id: sale.customerId,
          },
        });

        if (
          !customer ||
          Number(customer.dueAmount) + 0.01 < Number(sale.dueAmount)
        ) {
          throw new Error(
            "Sale cannot be cancelled because its credit balance appears to have already been settled.",
          );
        }

        await tx.customer.update({
          where: {
            id: sale.customerId,
          },

          data: {
            dueAmount: {
              decrement: sale.dueAmount,
            },
          },
        });

        await tx.customerLedgerEntry.create({
          data: {
            branchId: session.user.branchId,

            customerId: sale.customerId,

            saleId: sale.id,

            debit: 0,

            credit: sale.dueAmount,

            note: `Cancelled sale ${sale.billNo}`,
          },
        });
      }

      await tx.sale.update({
        where: {
          id,
        },

        data: {
          isCancelled: true,

          cancelledAt: new Date(),

          cancelledById: Number(session.user.id),

          cancelReason: String(body.reason || "Cancelled"),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,

          branchId: session.user.branchId,

          userId: Number(session.user.id),

          action: "SALE_CANCEL",

          entityType: "Sale",

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
        error: error instanceof Error ? error.message : "Unable to cancel sale",
      },
      {
        status: 400,
      },
    );
  }
}
