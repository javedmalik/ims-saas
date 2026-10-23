import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";

type Context = {
  params: {
    id: string;
  };
};

const schema = z.object({
  tenantActive: z.boolean().optional(),

  planId: z.coerce.number().int().positive().optional(),

  status: z
    .enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"])
    .optional(),

  billingCycle: z.enum(["MONTHLY", "YEARLY", "MANUAL"]).optional(),

  trialEndsAt: z.string().datetime().nullable().optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
  nextBillingAt: z.string().datetime().nullable().optional(),
  graceEndsAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

function dateOrNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

export async function PATCH(req: NextRequest, { params }: Context) {
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
        error: "Invalid tenant subscription update",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: true,
    },
  });

  if (!tenant || tenant.slug === "__platform__") {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (data.planId) {
    const plan = await prisma.saasPlan.findFirst({
      where: {
        id: data.planId,
        isActive: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
  }

  const beforePlan = tenant.subscription?.planId
    ? await prisma.saasPlan.findUnique({
        where: { id: tenant.subscription.planId },
        select: { code: true },
      })
    : null;

  const afterPlan = data.planId
    ? await prisma.saasPlan.findUnique({
        where: { id: data.planId },
        select: { code: true },
      })
    : beforePlan;

  await prisma.$transaction(async (tx) => {
    if (data.tenantActive !== undefined) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          isActive: data.tenantActive,
        },
      });
    }

    if (tenant.subscription) {
      await tx.tenantSubscription.update({
        where: {
          tenantId,
        },

        data: {
          ...(data.planId !== undefined ? { planId: data.planId } : {}),

          ...(data.status !== undefined ? { status: data.status } : {}),

          ...(data.billingCycle !== undefined
            ? { billingCycle: data.billingCycle }
            : {}),

          ...(data.trialEndsAt !== undefined
            ? { trialEndsAt: dateOrNull(data.trialEndsAt) }
            : {}),

          ...(data.currentPeriodEnd !== undefined
            ? {
                currentPeriodEnd: dateOrNull(data.currentPeriodEnd),
              }
            : {}),

          ...(data.nextBillingAt !== undefined
            ? {
                nextBillingAt: dateOrNull(data.nextBillingAt),
              }
            : {}),

          ...(data.graceEndsAt !== undefined
            ? {
                graceEndsAt: dateOrNull(data.graceEndsAt),
              }
            : {}),

          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });
    } else {
      if (!data.planId) {
        throw new Error(
          "A plan must be selected before creating a subscription",
        );
      }

      const plan = await tx.saasPlan.findUnique({
        where: { id: data.planId },
      });

      if (!plan) {
        throw new Error("Plan not found");
      }

      const now = new Date();

      const defaultTrialEnd =
        plan.trialDays > 0
          ? new Date(now.getTime() + plan.trialDays * 86_400_000)
          : null;

      await tx.tenantSubscription.create({
        data: {
          tenantId,
          planId: plan.id,
          status: data.status || (plan.trialDays > 0 ? "TRIAL" : "ACTIVE"),
          billingCycle: data.billingCycle || "MONTHLY",
          trialStartedAt: plan.trialDays > 0 ? now : null,
          trialEndsAt: dateOrNull(data.trialEndsAt) ?? defaultTrialEnd,
          currentPeriodStart: data.status === "ACTIVE" ? now : null,
          currentPeriodEnd: dateOrNull(data.currentPeriodEnd),
          nextBillingAt: dateOrNull(data.nextBillingAt),
          graceEndsAt: dateOrNull(data.graceEndsAt),
          notes: data.notes || null,
        },
      });
    }

    const currentSubscription = await tx.tenantSubscription.findUnique({
      where: { tenantId },
    });

    if (currentSubscription) {
      await tx.subscriptionHistory.create({
        data: {
          tenantId,
          subscriptionId: currentSubscription.id,
          action: "SUBSCRIPTION_EDIT",
          fromStatus: tenant.subscription?.status || null,
          toStatus: currentSubscription.status,
          fromPlanCode: beforePlan?.code || null,
          toPlanCode: afterPlan?.code || null,
          note: data.notes || "Subscription edited by Super Admin.",
          metadata: JSON.stringify({
            tenantActiveBefore: tenant.isActive,
            tenantActiveAfter: data.tenantActive ?? tenant.isActive,
            changedFields: data,
          }),
          createdById: Number(session.user.id),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: Number(session.user.id),
        action: "SAAS_SUBSCRIPTION_UPDATE",
        entityType: "Tenant",
        entityId: String(tenantId),
        metadata: JSON.stringify(data),
      },
    });
  });

  return NextResponse.json({
    ok: true,
  });
}
