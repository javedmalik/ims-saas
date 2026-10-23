import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";

const schema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),

  monthlyPrice: z.coerce.number().min(0),
  yearlyPrice: z.coerce.number().min(0),

  maxBranches: z.coerce.number().int().positive(),
  maxUsers: z.coerce.number().int().positive(),
  trialDays: z.coerce.number().int().min(0).max(365),

  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

async function guard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return {
      session,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session, response: null };
}

export async function POST(req: NextRequest) {
  const { response } = await guard();
  if (response) return response;

  const parsed = schema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid plan",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const duplicate = await prisma.saasPlan.findUnique({
    where: {
      code: data.code.toUpperCase(),
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { error: "Plan code already exists" },
      { status: 409 },
    );
  }

  const plan = await prisma.saasPlan.create({
    data: {
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description || null,
      monthlyPrice: data.monthlyPrice,
      yearlyPrice: data.yearlyPrice,
      currencyCode: "INR",
      maxBranches: data.maxBranches,
      maxUsers: data.maxUsers,
      trialDays: data.trialDays,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    },
  });

  return NextResponse.json(
    {
      id: plan.id,
    },
    { status: 201 },
  );
}
