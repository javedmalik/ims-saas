import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(
  _req: Request,
  { params }: Context,
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const tenantId = Number(params.id);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json(
      { error: "Invalid tenant id" },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId,
    },

    include: {
      subscription: {
        include: {
          plan: true,

          payments: {
            include: {
              createdBy: {
                select: {
                  fullName: true,
                  username: true,
                },
              },
            },

            orderBy: {
              paymentDate: "desc",
            },

            take: 100,
          },

          history: {
            include: {
              createdBy: {
                select: {
                  fullName: true,
                  username: true,
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            take: 100,
          },
        },
      },
    },
  });

  if (!tenant || tenant.slug === "__platform__") {
    return NextResponse.json(
      { error: "Tenant not found" },
      { status: 404 },
    );
  }

  const subscription = tenant.subscription;

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      isActive: tenant.isActive,
    },

    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          trialStartedAt: subscription.trialStartedAt,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          nextBillingAt: subscription.nextBillingAt,
          graceEndsAt: subscription.graceEndsAt,
          notes: subscription.notes,

          plan: {
            id: subscription.plan.id,
            code: subscription.plan.code,
            name: subscription.plan.name,
            monthlyPrice: Number(
              subscription.plan.monthlyPrice,
            ),
            yearlyPrice: Number(
              subscription.plan.yearlyPrice,
            ),
            currencyCode: subscription.plan.currencyCode,
            maxBranches: subscription.plan.maxBranches,
            maxUsers: subscription.plan.maxUsers,
          },
        }
      : null,

    payments:
      subscription?.payments.map((payment) => ({
        id: payment.id.toString(),
        paymentDate: payment.paymentDate,
        amount: Number(payment.amount),
        currencyCode: payment.currencyCode,
        mode: payment.mode,
        status: payment.status,
        provider: payment.provider,
        externalPaymentId: payment.externalPaymentId,
        reference: payment.reference,
        billingCycle: payment.billingCycle,
        periodStart: payment.periodStart,
        periodEnd: payment.periodEnd,
        notes: payment.notes,
        createdBy:
          payment.createdBy?.fullName ||
          payment.createdBy?.username ||
          "System",
      })) || [],

    history:
      subscription?.history.map((item) => ({
        id: item.id.toString(),
        action: item.action,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        fromPlanCode: item.fromPlanCode,
        toPlanCode: item.toPlanCode,
        note: item.note,
        metadata: item.metadata,
        createdAt: item.createdAt,
        createdBy:
          item.createdBy?.fullName ||
          item.createdBy?.username ||
          "System",
      })) || [],
  });
}
