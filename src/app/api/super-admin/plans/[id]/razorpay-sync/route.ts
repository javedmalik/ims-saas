import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";
import { createRazorpayPlan } from "@/lib/razorpay";

type Context = {
  params: {
    id: string;
  };
};

const bodySchema = z.object({
  force: z.boolean().default(false),
});

export async function POST(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
      },
      { status: 400 },
    );
  }

  const plan = await prisma.saasPlan.findUnique({
    where: { id },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const force = parsed.data.force;

  let monthlyPlanId = plan.razorpayMonthlyPlanId;

  let yearlyPlanId = plan.razorpayYearlyPlanId;

  if (Number(plan.monthlyPrice) > 0 && (!monthlyPlanId || force)) {
    const created = await createRazorpayPlan({
      name: `${plan.name} Monthly`,
      description: plan.description,
      amountRupees: Number(plan.monthlyPrice),
      period: "monthly",
      localPlanId: plan.id,
      localPlanCode: plan.code,
    });

    monthlyPlanId = created.id;
  }

  if (Number(plan.yearlyPrice) > 0 && (!yearlyPlanId || force)) {
    const created = await createRazorpayPlan({
      name: `${plan.name} Yearly`,
      description: plan.description,
      amountRupees: Number(plan.yearlyPrice),
      period: "yearly",
      localPlanId: plan.id,
      localPlanCode: plan.code,
    });

    yearlyPlanId = created.id;
  }

  const updated = await prisma.saasPlan.update({
    where: { id },

    data: {
      razorpayMonthlyPlanId: monthlyPlanId,

      razorpayYearlyPlanId: yearlyPlanId,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: Number(session.user.id),
      action: force ? "RAZORPAY_PLAN_RESYNC" : "RAZORPAY_PLAN_SYNC",
      entityType: "SaasPlan",
      entityId: String(plan.id),
      metadata: JSON.stringify({
        monthlyPlanId,
        yearlyPlanId,
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    monthlyPlanId: updated.razorpayMonthlyPlanId,
    yearlyPlanId: updated.razorpayYearlyPlanId,
  });
}
