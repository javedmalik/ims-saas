import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";
import { addBillingPeriod, addDays } from "@/lib/subscription-lifecycle";

type Context = {
  params: {
    id: string;
  };
};

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RENEW"),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]),
    amount: z.coerce.number().positive(),
    paymentDate: z.string().datetime().optional(),
    mode: z.string().trim().min(2).max(30),
    reference: z.string().trim().max(150).optional().nullable(),
    provider: z.string().trim().max(50).optional().nullable(),
    externalPaymentId: z.string().trim().max(150).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    graceDays: z.coerce.number().int().min(0).max(90).default(7),
  }),

  z.object({
    action: z.literal("SUSPEND"),
    note: z.string().trim().min(2).max(500),
  }),

  z.object({
    action: z.literal("CANCEL"),
    note: z.string().trim().min(2).max(500),
  }),

  z.object({
    action: z.literal("ACTIVATE"),
    note: z.string().trim().max(500).optional().nullable(),
  }),

  z.object({
    action: z.literal("MARK_PAST_DUE"),
    graceDays: z.coerce.number().int().min(0).max(90).default(7),
    note: z.string().trim().max(500).optional().nullable(),
  }),

  z.object({
    action: z.literal("EXTEND_TRIAL"),
    days: z.coerce.number().int().min(1).max(365),
    note: z.string().trim().max(500).optional().nullable(),
  }),
]);

export async function POST(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = Number(params.id);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid subscription action",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId,
    },

    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  if (!tenant || tenant.slug === "__platform__" || !tenant.subscription) {
    return NextResponse.json(
      { error: "Tenant subscription not found" },
      { status: 404 },
    );
  }

  const subscription = tenant.subscription;
  const beforeStatus = subscription.status;
  const planCode = subscription.plan.code;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.action === "RENEW") {
        const paymentDate = input.paymentDate
          ? new Date(input.paymentDate)
          : now;

        const periodStart =
          subscription.currentPeriodEnd &&
          subscription.currentPeriodEnd > paymentDate
            ? subscription.currentPeriodEnd
            : paymentDate;

        const periodEnd = addBillingPeriod(periodStart, input.billingCycle);

        const graceEndsAt = addDays(periodEnd, input.graceDays);

        const payment = await tx.subscriptionPayment.create({
          data: {
            tenantId,
            subscriptionId: subscription.id,
            paymentDate,
            amount: input.amount,
            currencyCode: subscription.plan.currencyCode,
            mode: input.mode,
            status: "PAID",
            provider: input.provider || null,
            externalPaymentId: input.externalPaymentId || null,
            reference: input.reference || null,
            billingCycle: input.billingCycle,
            periodStart,
            periodEnd,
            notes: input.notes || null,
            createdById: Number(session.user.id),
          },
        });

        await tx.tenantSubscription.update({
          where: {
            id: subscription.id,
          },

          data: {
            status: "ACTIVE",
            billingCycle: input.billingCycle,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
            graceEndsAt,
          },
        });

        await tx.subscriptionHistory.create({
          data: {
            tenantId,
            subscriptionId: subscription.id,
            action: "RENEW",
            fromStatus: beforeStatus,
            toStatus: "ACTIVE",
            fromPlanCode: planCode,
            toPlanCode: planCode,
            note:
              input.notes || `Subscription renewed (${input.billingCycle}).`,
            metadata: JSON.stringify({
              paymentId: payment.id.toString(),
              amount: input.amount,
              mode: input.mode,
              reference: input.reference || null,
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString(),
            }),
            createdById: Number(session.user.id),
          },
        });

        return {
          paymentId: payment.id.toString(),
          status: "ACTIVE",
          periodStart,
          periodEnd,
        };
      }

      if (input.action === "EXTEND_TRIAL") {
        const base =
          subscription.trialEndsAt && subscription.trialEndsAt > now
            ? subscription.trialEndsAt
            : now;

        const trialEndsAt = addDays(base, input.days);

        await tx.tenantSubscription.update({
          where: {
            id: subscription.id,
          },

          data: {
            status: "TRIAL",
            trialStartedAt: subscription.trialStartedAt || now,
            trialEndsAt,
          },
        });

        await tx.subscriptionHistory.create({
          data: {
            tenantId,
            subscriptionId: subscription.id,
            action: "EXTEND_TRIAL",
            fromStatus: beforeStatus,
            toStatus: "TRIAL",
            fromPlanCode: planCode,
            toPlanCode: planCode,
            note: input.note || `Trial extended by ${input.days} day(s).`,
            metadata: JSON.stringify({
              days: input.days,
              trialEndsAt: trialEndsAt.toISOString(),
            }),
            createdById: Number(session.user.id),
          },
        });

        return {
          status: "TRIAL",
          trialEndsAt,
        };
      }

      let status = beforeStatus;
      let note = "";
      let graceEndsAt: Date | null | undefined = undefined;

      if (input.action === "SUSPEND") {
        status = "SUSPENDED";
        note = input.note;
      }

      if (input.action === "CANCEL") {
        status = "CANCELLED";
        note = input.note;
      }

      if (input.action === "ACTIVATE") {
        status = "ACTIVE";
        note = input.note || "Subscription activated manually.";
      }

      if (input.action === "MARK_PAST_DUE") {
        status = "PAST_DUE";
        note = input.note || "Subscription marked past due.";
        graceEndsAt = addDays(now, input.graceDays);
      }

      await tx.tenantSubscription.update({
        where: {
          id: subscription.id,
        },

        data: {
          status,
          ...(graceEndsAt !== undefined ? { graceEndsAt } : {}),
        },
      });

      await tx.subscriptionHistory.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          action: input.action,
          fromStatus: beforeStatus,
          toStatus: status,
          fromPlanCode: planCode,
          toPlanCode: planCode,
          note,
          metadata:
            input.action === "MARK_PAST_DUE"
              ? JSON.stringify({
                  graceEndsAt: graceEndsAt?.toISOString() || null,
                })
              : null,
          createdById: Number(session.user.id),
        },
      });

      return {
        status,
        graceEndsAt,
      };
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update subscription",
      },
      { status: 400 },
    );
  }
}
