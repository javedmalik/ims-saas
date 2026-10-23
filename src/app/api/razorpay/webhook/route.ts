import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { unixDate, verifyWebhookSignature, webhookHash } from "@/lib/razorpay";

export const runtime = "nodejs";

type RazorpayEntity = {
  id?: string;
  status?: string;
  customer_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  amount?: number;
  currency?: string;
  method?: string;
};

function graceDate() {
  const days = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);

  return new Date(Date.now() + Math.max(0, days) * 86_400_000);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("x-razorpay-signature") || "";

  let valid = false;

  try {
    valid = verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook verification unavailable",
      },
      { status: 503 },
    );
  }

  if (!valid) {
    return NextResponse.json(
      {
        error: "Invalid webhook signature",
      },
      { status: 400 },
    );
  }

  let event: any;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid webhook payload",
      },
      { status: 400 },
    );
  }

  const hash = webhookHash(rawBody);

  const existingEvent = await prisma.razorpayWebhookEvent.findUnique({
    where: {
      eventHash: hash,
    },
    select: {
      id: true,
    },
  });

  if (existingEvent) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
    });
  }

  const eventType = String(event.event || "");

  const subscription = event?.payload?.subscription?.entity as
    | RazorpayEntity
    | undefined;

  const payment = event?.payload?.payment?.entity as RazorpayEntity | undefined;

  const externalSubscriptionId = subscription?.id || null;
  const externalPaymentId = payment?.id || null;

  if (!subscription) {
    await prisma.razorpayWebhookEvent.create({
      data: {
        eventHash: hash,
        eventType,
        externalSubscriptionId: null,
        externalPaymentId,
        payloadJson: rawBody,
      },
    });

    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  /*
   * Store unknown-but-valid Razorpay events as processed so retries
   * remain idempotent.
   */
  if (!externalSubscriptionId) {
    await prisma.razorpayWebhookEvent.create({
      data: {
        eventHash: hash,
        eventType,
        externalSubscriptionId: null,
        externalPaymentId,
        payloadJson: rawBody,
      },
    });

    return NextResponse.json({
      ok: true,
      ignored: true,
    });
  }

  const local = await prisma.tenantSubscription.findFirst({
    where: {
      externalSubscriptionId,
    },

    include: {
      plan: true,
    },
  });

  if (!local) {
    await prisma.razorpayWebhookEvent.create({
      data: {
        eventHash: hash,
        eventType,
        externalSubscriptionId,
        externalPaymentId,
        payloadJson: rawBody,
      },
    });

    return NextResponse.json({
      ok: true,
      unmatched: true,
    });
  }

  const periodStart = unixDate(subscription.current_start);

  const periodEnd = unixDate(subscription.current_end);

  const nextBilling = unixDate(subscription.charge_at);

  await prisma.$transaction(async (tx) => {
    await tx.razorpayWebhookEvent.create({
      data: {
        eventHash: hash,
        eventType,
        externalSubscriptionId,
        externalPaymentId,
        payloadJson: rawBody,
      },
    });

    let nextStatus: string | null = null;

    let historyAction = `RAZORPAY_${eventType
      .replace(/[^a-z0-9]+/gi, "_")
      .toUpperCase()}`;

    if (
      eventType === "subscription.activated" ||
      eventType === "subscription.resumed"
    ) {
      nextStatus = "ACTIVE";
    }

    if (eventType === "subscription.charged") {
      nextStatus = "ACTIVE";

      if (payment?.id && Number(payment.amount) > 0) {
        const alreadyRecorded = await tx.subscriptionPayment.findFirst({
          where: {
            externalPaymentId: payment.id,
          },
          select: {
            id: true,
          },
        });

        if (!alreadyRecorded) {
          await tx.subscriptionPayment.create({
            data: {
              tenantId: local.tenantId,
              subscriptionId: local.id,
              paymentDate: new Date(),
              amount: Number(payment.amount) / 100,
              currencyCode: payment.currency || local.plan.currencyCode,
              mode: String(payment.method || "RAZORPAY").toUpperCase(),
              status: "PAID",
              provider: "RAZORPAY",
              externalPaymentId: payment.id,
              reference: externalSubscriptionId,
              billingCycle: local.billingCycle,
              periodStart: periodStart || new Date(),
              periodEnd: periodEnd || new Date(),
              notes: "Razorpay subscription charge",
            },
          });
        }
      }
    }

    if (eventType === "subscription.pending") {
      nextStatus = "PAST_DUE";
    }

    if (
      eventType === "subscription.halted" ||
      eventType === "subscription.paused"
    ) {
      nextStatus = "SUSPENDED";
    }

    if (eventType === "subscription.cancelled") {
      nextStatus = "CANCELLED";
    }

    if (eventType === "subscription.completed") {
      nextStatus = "EXPIRED";
    }

    const shouldUpdate =
      nextStatus !== null ||
      eventType === "subscription.updated" ||
      eventType === "subscription.authenticated" ||
      eventType === "subscription.charged";

    if (shouldUpdate) {
      await tx.tenantSubscription.update({
        where: {
          id: local.id,
        },

        data: {
          ...(nextStatus
            ? {
                status: nextStatus,
              }
            : {}),

          ...(subscription.customer_id
            ? {
                externalCustomerId: subscription.customer_id,
              }
            : {}),

          ...(periodStart
            ? {
                currentPeriodStart: periodStart,
              }
            : {}),

          ...(periodEnd
            ? {
                currentPeriodEnd: periodEnd,
              }
            : {}),

          ...(nextBilling
            ? {
                nextBillingAt: nextBilling,
              }
            : {}),

          ...(eventType === "subscription.pending"
            ? {
                graceEndsAt: graceDate(),
              }
            : {}),

          ...(nextStatus === "ACTIVE"
            ? {
                graceEndsAt: null,
              }
            : {}),
        },
      });

      await tx.subscriptionHistory.create({
        data: {
          tenantId: local.tenantId,
          subscriptionId: local.id,
          action: historyAction,
          fromStatus: local.status,
          toStatus: nextStatus || local.status,
          fromPlanCode: local.plan.code,
          toPlanCode: local.plan.code,
          note: `Processed Razorpay webhook ${eventType}.`,
          metadata: JSON.stringify({
            externalSubscriptionId,
            externalPaymentId,
            razorpayStatus: subscription.status || null,
            periodStart: periodStart?.toISOString() || null,
            periodEnd: periodEnd?.toISOString() || null,
          }),
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
  });
}
