import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  const plans = await prisma.saasPlan.findMany({
    where: {
      isActive: true,
    },

    orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
  });

  return NextResponse.json(
    plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPrice: Number(plan.monthlyPrice),
      yearlyPrice: Number(plan.yearlyPrice),
      currencyCode: plan.currencyCode,
      maxBranches: plan.maxBranches,
      maxUsers: plan.maxUsers,
      trialDays: plan.trialDays,
      featuresJson: plan.featuresJson,
    })),
  );
}
