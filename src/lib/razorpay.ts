import crypto from "node:crypto";

const BASE_URL = "https://api.razorpay.com/v1";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }

  return { keyId, keySecret };
}

export function razorpayKeyId() {
  return credentials().keyId;
}

export async function razorpayRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
  } = {},
): Promise<T> {
  const { keyId, keySecret } = credentials();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    cache: "no-store",
  });

  const text = await response.text();

  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const description =
      body?.error?.description ||
      body?.error?.reason ||
      body?.message ||
      `Razorpay request failed (${response.status})`;

    throw new Error(description);
  }

  return body as T;
}

export type RazorpayPlan = {
  id: string;
  period: string;
  interval: number;
};

export async function createRazorpayPlan(input: {
  name: string;
  description?: string | null;
  amountRupees: number;
  period: "monthly" | "yearly";
  localPlanId: number;
  localPlanCode: string;
}) {
  return razorpayRequest<RazorpayPlan>("/plans", {
    method: "POST",
    body: {
      period: input.period,
      interval: 1,
      item: {
        name: input.name,
        amount: Math.round(input.amountRupees * 100),
        currency: "INR",
        description: input.description || undefined,
      },
      notes: {
        local_plan_id: String(input.localPlanId),
        local_plan_code: input.localPlanCode,
      },
    },
  });
}

export type RazorpaySubscription = {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  end_at?: number | null;
  short_url?: string | null;
};

export async function createRazorpaySubscription(input: {
  razorpayPlanId: string;
  totalCount: number;
  startAt?: number;
  tenantId: number;
  localPlanId: number;
  billingCycle: "MONTHLY" | "YEARLY";
}) {
  return razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.razorpayPlanId,
      total_count: input.totalCount,
      quantity: 1,
      customer_notify: 1,
      ...(input.startAt ? { start_at: input.startAt } : {}),
      notes: {
        tenant_id: String(input.tenantId),
        local_plan_id: String(input.localPlanId),
        billing_cycle: input.billingCycle,
      },
    },
  });
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export function verifyWebhookSignature(
  rawBody: string,
  suppliedSignature: string,
) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");

  const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function webhookHash(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export function unixDate(value: unknown) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000);
}
