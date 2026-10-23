import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const subscriptions =
    await prisma.tenantSubscription.findMany({
      where: {
        status: {
          in: [
            "TRIAL",
            "ACTIVE",
            "PAST_DUE",
          ],
        },
      },

      include: {
        plan: {
          select: {
            code: true,
          },
        },
      },
    });

  let changed = 0;

  for (const subscription of subscriptions) {
    let nextStatus: string | null = null;
    let action: string | null = null;
    let note: string | null = null;

    if (
      subscription.status === "TRIAL" &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt < now
    ) {
      nextStatus = "EXPIRED";
      action = "TRIAL_EXPIRED";
      note = "Trial period expired automatically.";
    }

    if (
      subscription.status === "ACTIVE" &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd < now
    ) {
      if (
        subscription.graceEndsAt &&
        subscription.graceEndsAt >= now
      ) {
        nextStatus = "PAST_DUE";
        action = "PERIOD_PAST_DUE";
        note =
          "Billing period ended; subscription entered grace period.";
      } else {
        nextStatus = "EXPIRED";
        action = "SUBSCRIPTION_EXPIRED";
        note = "Billing period expired automatically.";
      }
    }

    if (
      subscription.status === "PAST_DUE" &&
      (!subscription.graceEndsAt ||
        subscription.graceEndsAt < now)
    ) {
      nextStatus = "EXPIRED";
      action = "GRACE_PERIOD_EXPIRED";
      note = "Payment grace period expired automatically.";
    }

    if (!nextStatus || nextStatus === subscription.status) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenantSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: nextStatus!,
        },
      });

      await tx.subscriptionHistory.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          action: action!,
          fromStatus: subscription.status,
          toStatus: nextStatus!,
          fromPlanCode: subscription.plan.code,
          toPlanCode: subscription.plan.code,
          note,
          metadata: JSON.stringify({
            automatic: true,
            processedAt: now.toISOString(),
          }),
        },
      });
    });

    changed += 1;
  }

  console.log(
    `Checked ${subscriptions.length} subscription(s); updated ${changed}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
