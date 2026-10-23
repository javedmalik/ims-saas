import { NextRequest, NextResponse } from "next/server";

import { refreshExpiredSubscriptions } from "@/lib/subscription-lifecycle";

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.SUBSCRIPTION_CRON_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      {
        error: "SUBSCRIPTION_CRON_SECRET is not configured",
      },
      { status: 503 },
    );
  }

  const suppliedSecret = req.headers.get("x-cron-secret");

  if (!suppliedSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshExpiredSubscriptions();

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
