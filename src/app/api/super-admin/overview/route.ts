import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [plans, tenants] = await Promise.all([
    prisma.saasPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
    }),

    prisma.tenant.findMany({
      include: {
        businesses: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            isActive: true,
            _count: {
              select: {
                branches: true,
              },
            },
          },
        },

        users: {
          where: {
            platformRole: null,
          },
          select: {
            id: true,
            isActive: true,
          },
        },

        subscription: {
          include: {
            plan: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const rows = tenants
    .filter((tenant) => tenant.slug !== "__platform__")
    .map((tenant) => {
      const activeUsers = tenant.users.filter((user) => user.isActive).length;

      const totalBranches = tenant.businesses.reduce(
        (sum, business) => sum + business._count.branches,
        0,
      );

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,

        businesses: tenant.businesses.map((business) => ({
          id: business.id,
          legalName: business.legalName,
          tradeName: business.tradeName,
          isActive: business.isActive,
          branches: business._count.branches,
        })),

        activeUsers,
        totalBranches,

        subscription: tenant.subscription
          ? {
              id: tenant.subscription.id,
              status: tenant.subscription.status,
              billingCycle: tenant.subscription.billingCycle,
              trialStartedAt: tenant.subscription.trialStartedAt,
              trialEndsAt: tenant.subscription.trialEndsAt,
              currentPeriodStart: tenant.subscription.currentPeriodStart,
              currentPeriodEnd: tenant.subscription.currentPeriodEnd,
              nextBillingAt: tenant.subscription.nextBillingAt,
              graceEndsAt: tenant.subscription.graceEndsAt,
              notes: tenant.subscription.notes,

              plan: {
                id: tenant.subscription.plan.id,
                code: tenant.subscription.plan.code,
                name: tenant.subscription.plan.name,
                monthlyPrice: Number(tenant.subscription.plan.monthlyPrice),
                yearlyPrice: Number(tenant.subscription.plan.yearlyPrice),
                currencyCode: tenant.subscription.plan.currencyCode,
                maxBranches: tenant.subscription.plan.maxBranches,
                maxUsers: tenant.subscription.plan.maxUsers,
              },
            }
          : null,
      };
    });

  return NextResponse.json({
    plans: plans.map((plan) => ({
      ...plan,
      monthlyPrice: Number(plan.monthlyPrice),
      yearlyPrice: Number(plan.yearlyPrice),
    })),

    tenants: rows,

    summary: {
      tenants: rows.length,
      activeTenants: rows.filter((row) => row.isActive).length,
      trialTenants: rows.filter((row) => row.subscription?.status === "TRIAL")
        .length,
      activeSubscriptions: rows.filter(
        (row) => row.subscription?.status === "ACTIVE",
      ).length,
      suspended: rows.filter(
        (row) => row.subscription?.status === "SUSPENDED" || !row.isActive,
      ).length,
    },
  });
}
