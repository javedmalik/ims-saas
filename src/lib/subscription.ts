import { prisma } from "@/lib/db";

export const SubscriptionStatus = {
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export type TenantEntitlement = {
  tenantId: number;
  tenantActive: boolean;
  subscriptionId: number | null;
  status: string;
  planId: number | null;
  planCode: string | null;
  planName: string | null;
  maxBranches: number;
  maxUsers: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  canUseApp: boolean;
  reason: string | null;
};

function effectiveAccess(
  tenantActive: boolean,
  status: string,
  trialEndsAt: Date | null,
  currentPeriodEnd: Date | null,
  graceEndsAt: Date | null,
) {
  if (!tenantActive) {
    return {
      canUseApp: false,
      reason: "Tenant account is inactive.",
    };
  }

  const now = new Date();

  if (status === SubscriptionStatus.TRIAL) {
    if (trialEndsAt && trialEndsAt < now) {
      return {
        canUseApp: false,
        reason: "Trial period has expired.",
      };
    }

    return {
      canUseApp: true,
      reason: null,
    };
  }

  if (status === SubscriptionStatus.ACTIVE) {
    if (currentPeriodEnd && currentPeriodEnd < now) {
      if (graceEndsAt && graceEndsAt >= now) {
        return {
          canUseApp: true,
          reason: null,
        };
      }

      return {
        canUseApp: false,
        reason: "Subscription period has expired.",
      };
    }

    return {
      canUseApp: true,
      reason: null,
    };
  }

  if (status === SubscriptionStatus.PAST_DUE) {
    if (graceEndsAt && graceEndsAt >= now) {
      return {
        canUseApp: true,
        reason: null,
      };
    }

    return {
      canUseApp: false,
      reason: "Subscription payment is past due.",
    };
  }

  return {
    canUseApp: false,
    reason: `Subscription status is ${status}.`,
  };
}

export async function getTenantEntitlement(
  tenantId: number,
): Promise<TenantEntitlement> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },

    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  if (!tenant) {
    return {
      tenantId,
      tenantActive: false,
      subscriptionId: null,
      status: "MISSING",
      planId: null,
      planCode: null,
      planName: null,
      maxBranches: 0,
      maxUsers: 0,
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      canUseApp: false,
      reason: "Tenant not found.",
    };
  }

  const subscription = tenant.subscription;

  if (!subscription) {
    return {
      tenantId,
      tenantActive: tenant.isActive,
      subscriptionId: null,
      status: "MISSING",
      planId: null,
      planCode: null,
      planName: null,
      maxBranches: 0,
      maxUsers: 0,
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      canUseApp: false,
      reason: "No SaaS subscription is assigned.",
    };
  }

  const access = effectiveAccess(
    tenant.isActive,
    subscription.status,
    subscription.trialEndsAt,
    subscription.currentPeriodEnd,
    subscription.graceEndsAt,
  );

  return {
    tenantId,
    tenantActive: tenant.isActive,
    subscriptionId: subscription.id,
    status: subscription.status,
    planId: subscription.planId,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    maxBranches: subscription.plan.maxBranches,
    maxUsers: subscription.plan.maxUsers,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    graceEndsAt: subscription.graceEndsAt,
    canUseApp: access.canUseApp,
    reason: access.reason,
  };
}

export async function assertTenantCanUseApp(tenantId: number) {
  const entitlement = await getTenantEntitlement(tenantId);

  if (!entitlement.canUseApp) {
    throw new Error(
      entitlement.reason ||
        "Your subscription does not currently allow access.",
    );
  }

  return entitlement;
}

export async function assertBranchLimit(tenantId: number, businessId: number) {
  const entitlement = await assertTenantCanUseApp(tenantId);

  const branchCount = await prisma.branch.count({
    where: {
      businessId,
      isActive: true,
    },
  });

  if (branchCount >= entitlement.maxBranches) {
    throw new Error(
      `Your ${entitlement.planName || "current"} plan allows up to ${entitlement.maxBranches} active branch(es).`,
    );
  }

  return entitlement;
}

export async function assertUserLimit(tenantId: number) {
  const entitlement = await assertTenantCanUseApp(tenantId);

  const activeUsers = await prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      platformRole: null,
    },
  });

  if (activeUsers >= entitlement.maxUsers) {
    throw new Error(
      `Your ${entitlement.planName || "current"} plan allows up to ${entitlement.maxUsers} active user(s).`,
    );
  }

  return entitlement;
}

export function isPlatformSuperAdmin(platformRole: string | null | undefined) {
  return platformRole === "SUPER_ADMIN";
}
