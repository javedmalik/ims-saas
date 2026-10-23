import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getTenantEntitlement, isPlatformSuperAdmin } from "@/lib/subscription";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const entitlement = await getTenantEntitlement(session.user.tenantId);

  return NextResponse.json({
    status: entitlement.status,
    canUseApp: entitlement.canUseApp,
    reason: entitlement.reason,
    planName: entitlement.planName,
    trialEndsAt: entitlement.trialEndsAt,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    graceEndsAt: entitlement.graceEndsAt,
    tenantActive: entitlement.tenantActive,
  });
}
