import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getTenantEntitlement,
  isPlatformSuperAdmin,
} from "@/lib/subscription";
import {
  fetchRazorpaySubscription,
  unixDate,
} from "@/lib/razorpay";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (isPlatformSuperAdmin(session.user.platformRole)) {
    return NextResponse.json({
      status: "PLATFORM",
      canUseApp: true,
      reason: null,
      planName: "Platform",
      trialEndsAt: null,
      currentPeriodEnd: null,
      tenantActive: true,
    });
  }

  const tenantId = session.user.tenantId;

  /*
   * ------------------------------------------------------
   * Reconcile existing Razorpay subscription with IMS
   * ------------------------------------------------------
   *
   * This is useful when:
   *
   * - Razorpay subscription was activated successfully
   * - webhook was not reachable at that time
   * - IMS still shows PAST_DUE / restricted
   *
   * We only attempt reconciliation when an external
   * Razorpay subscription id already exists.
   */
  const localSubscription =
    await prisma.tenantSubscription.findUnique({
      where: {
        tenantId,
      },
      include: {
        plan: true,
      },
    });

  if (
    localSubscription?.externalSubscriptionId &&
    localSubscription.externalSubscriptionId.startsWith("sub_")
  ) {
    try {
      const razorpaySubscription =
        await fetchRazorpaySubscription(
          localSubscription.externalSubscriptionId,
        );

      const razorpayStatus =
        razorpaySubscription.status?.toLowerCase();

      let nextStatus: string | null = null;

      switch (razorpayStatus) {
        case "active":
          nextStatus = "ACTIVE";
          break;

        case "authenticated":
          /*
           * Mandate is authenticated but recurring subscription
           * may not yet have started.
           *
           * Do not force ACTIVE unless Razorpay itself reports active.
           */
          nextStatus = localSubscription.status;
          break;

        case "pending":
          nextStatus = "PAST_DUE";
          break;

        case "halted":
        case "paused":
          nextStatus = "SUSPENDED";
          break;

        case "cancelled":
          nextStatus = "CANCELLED";
          break;

        case "completed":
          nextStatus = "EXPIRED";
          break;

        default:
          nextStatus = null;
      }

      if (nextStatus) {
        const currentPeriodStart =
          unixDate(razorpaySubscription.current_start);

        const currentPeriodEnd =
          unixDate(razorpaySubscription.current_end);

        const nextBillingAt =
          unixDate(razorpaySubscription.charge_at);

        const statusChanged =
          localSubscription.status !== nextStatus;

        const periodChanged =
          localSubscription.currentPeriodStart?.getTime() !==
            currentPeriodStart?.getTime() ||
          localSubscription.currentPeriodEnd?.getTime() !==
            currentPeriodEnd?.getTime() ||
          localSubscription.nextBillingAt?.getTime() !==
            nextBillingAt?.getTime();

        if (statusChanged || periodChanged) {
          await prisma.$transaction(async (tx) => {
            await tx.tenantSubscription.update({
              where: {
                id: localSubscription.id,
              },
              data: {
                status: nextStatus,

                currentPeriodStart:
                  currentPeriodStart ??
                  localSubscription.currentPeriodStart,

                currentPeriodEnd:
                  currentPeriodEnd ??
                  localSubscription.currentPeriodEnd,

                nextBillingAt:
                  nextBillingAt ??
                  localSubscription.nextBillingAt,

                /*
                 * Once Razorpay confirms ACTIVE, any old grace
                 * period should no longer restrict the tenant.
                 */
                ...(nextStatus === "ACTIVE"
                  ? {
                      graceEndsAt: null,
                    }
                  : {}),
              },
            });

            await tx.subscriptionHistory.create({
              data: {
                tenantId,
                subscriptionId: localSubscription.id,

                action: "RAZORPAY_STATUS_SYNC",

                fromStatus: localSubscription.status,
                toStatus: nextStatus,

                fromPlanCode:
                  localSubscription.plan?.code ?? null,

                toPlanCode:
                  localSubscription.plan?.code ?? null,

                note:
                  `Subscription status synchronized from Razorpay (${razorpaySubscription.status}).`,

                metadata: JSON.stringify({
                  razorpaySubscriptionId:
                    razorpaySubscription.id,

                  razorpayStatus:
                    razorpaySubscription.status,

                  currentStart:
                    razorpaySubscription.current_start ??
                    null,

                  currentEnd:
                    razorpaySubscription.current_end ??
                    null,

                  chargeAt:
                    razorpaySubscription.charge_at ??
                    null,
                }),
              },
            });
          });
        }
      }
    } catch (error) {
      /*
       * Do not break the subscription-status page just because
       * Razorpay temporarily cannot be reached.
       *
       * The existing IMS entitlement will still be returned.
       */
      console.error(
        "Razorpay subscription reconciliation failed:",
        error,
      );
    }
  }

  /*
   * Re-read entitlement AFTER synchronization.
   */
  const entitlement =
    await getTenantEntitlement(tenantId);

  return NextResponse.json({
    status: entitlement.status,
    canUseApp: entitlement.canUseApp,
    reason: entitlement.reason,
    planName: entitlement.planName,
    trialEndsAt: entitlement.trialEndsAt,
    currentPeriodEnd:
      entitlement.currentPeriodEnd,
    graceEndsAt:
      entitlement.graceEndsAt,
    tenantActive:
      entitlement.tenantActive,
  });
}