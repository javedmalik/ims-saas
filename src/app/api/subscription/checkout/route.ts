import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  razorpayKeyId,
} from "@/lib/razorpay";

const schema = z.object({
  planId: z.coerce.number().int().positive(),

  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
});

function futureUnix(date: Date | null) {
  if (!date) return undefined;

  const now = Date.now();

  if (date.getTime() < now + 5 * 60 * 1000) {
    return undefined;
  }

  return Math.floor(date.getTime() / 1000);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.platformRole === "SUPER_ADMIN") {
    return NextResponse.json(
      {
        error: "Platform Super Admin does not use tenant checkout.",
      },
      { status: 400 },
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      {
        error: "Only the tenant administrator can manage the subscription.",
      },
      { status: 403 },
    );
  }

  const parsed = schema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid checkout request",
      },
      { status: 400 },
    );
  }

  const { planId, billingCycle } = parsed.data;

  const [plan, tenant, business] = await Promise.all([
    prisma.saasPlan.findFirst({
      where: {
        id: planId,
        isActive: true,
      },
    }),

    prisma.tenant.findUnique({
      where: {
        id: session.user.tenantId,
      },

      include: {
        subscription: true,
      },
    }),

    prisma.business.findFirst({
      where: {
        id: session.user.businessId,
        tenantId: session.user.tenantId,
      },

      select: {
        legalName: true,
        email: true,
        phone: true,
      },
    }),
  ]);

  if (!plan || !tenant || !tenant.subscription || !business) {
    return NextResponse.json(
      {
        error: "Subscription checkout is not available.",
      },
      { status: 400 },
    );
  }

  const externalPlanId =
    billingCycle === "YEARLY"
      ? plan.razorpayYearlyPlanId
      : plan.razorpayMonthlyPlanId;

  if (!externalPlanId) {
    return NextResponse.json(
      {
        error:
          "This plan is not yet synced with Razorpay. Please contact support.",
      },
      { status: 409 },
    );
  }

  const localSubscription = tenant.subscription;

  /*
   * Reuse a still-actionable Razorpay subscription if checkout
   * was already created. This helps avoid duplicate mandates.
   */
  if (
    localSubscription.externalSubscriptionId &&
    localSubscription.planId === plan.id &&
    localSubscription.billingCycle === billingCycle
  ) {
    try {
      const existing = await fetchRazorpaySubscription(
        localSubscription.externalSubscriptionId,
      );

      if (
        ["created", "authenticated", "pending", "active"].includes(
          existing.status,
        )
      ) {
        return NextResponse.json({
          keyId: razorpayKeyId(),
          subscriptionId: existing.id,
          planName: plan.name,
          billingCycle,
          amount:
            billingCycle === "YEARLY"
              ? Number(plan.yearlyPrice)
              : Number(plan.monthlyPrice),
          currency: plan.currencyCode,
          businessName: business.legalName,
          email: business.email || "",
          phone: business.phone || "",
          existing: true,
        });
      }
    } catch {
      // If the old external subscription can no longer be fetched,
      // create a fresh one below.
    }
  }

  const trialStart =
    localSubscription.status === "TRIAL"
      ? futureUnix(localSubscription.trialEndsAt)
      : undefined;

  const created = await createRazorpaySubscription({
    razorpayPlanId: externalPlanId,

    totalCount: billingCycle === "YEARLY" ? 10 : 120,

    startAt: trialStart,

    tenantId: tenant.id,

    localPlanId: plan.id,

    billingCycle,
  });

  await prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.update({
      where: {
        id: localSubscription.id,
      },

      data: {
        planId: plan.id,
        billingCycle,
        externalSubscriptionId: created.id,
        externalCustomerId:
          created.customer_id || localSubscription.externalCustomerId,
      },
    });

    await tx.subscriptionHistory.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: localSubscription.id,
        action: "RAZORPAY_CHECKOUT_CREATED",
        fromStatus: localSubscription.status,
        toStatus: localSubscription.status,
        fromPlanCode: null,
        toPlanCode: plan.code,
        note: "Razorpay subscription checkout created.",
        metadata: JSON.stringify({
          razorpaySubscriptionId: created.id,
          razorpayPlanId: externalPlanId,
          billingCycle,
          startAt: trialStart || null,
        }),
        createdById: Number(session.user.id),
      },
    });
  });

  return NextResponse.json({
    keyId: razorpayKeyId(),
    subscriptionId: created.id,
    planName: plan.name,
    billingCycle,
    amount:
      billingCycle === "YEARLY"
        ? Number(plan.yearlyPrice)
        : Number(plan.monthlyPrice),
    currency: plan.currencyCode,
    businessName: business.legalName,
    email: business.email || "",
    phone: business.phone || "",
    existing: false,
  });
}
