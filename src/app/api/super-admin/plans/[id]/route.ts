import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPlatformSuperAdmin } from "@/lib/subscription";

type Context = {
  params: {
    id: string;
  };
};

const updateSchema = z.object({
  code: z.string().trim().min(2).max(30).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),

  monthlyPrice: z.coerce.number().min(0).optional(),
  yearlyPrice: z.coerce.number().min(0).optional(),

  maxBranches: z.coerce.number().int().positive().optional(),
  maxUsers: z.coerce.number().int().positive().optional(),
  trialDays: z.coerce.number().int().min(0).max(365).optional(),

  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

async function guard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!isPlatformSuperAdmin(session.user.platformRole)) {
    return {
      session,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  return {
    session,
    response: null,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: Context,
) {
  const { session, response } = await guard();
  if (response || !session) return response;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid plan id" },
      { status: 400 },
    );
  }

  const parsed = updateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid plan",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const existing = await prisma.saasPlan.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Plan not found" },
      { status: 404 },
    );
  }

  if (parsed.data.code) {
    const duplicate = await prisma.saasPlan.findFirst({
      where: {
        code: parsed.data.code.toUpperCase(),
        id: {
          not: id,
        },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "Plan code already exists" },
        { status: 409 },
      );
    }
  }

  const plan = await prisma.saasPlan.update({
    where: { id },

    data: {
      ...(parsed.data.code
        ? { code: parsed.data.code.toUpperCase() }
        : {}),

      ...(parsed.data.name !== undefined
        ? { name: parsed.data.name }
        : {}),

      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),

      ...(parsed.data.monthlyPrice !== undefined
        ? { monthlyPrice: parsed.data.monthlyPrice }
        : {}),

      ...(parsed.data.yearlyPrice !== undefined
        ? { yearlyPrice: parsed.data.yearlyPrice }
        : {}),

      ...(parsed.data.maxBranches !== undefined
        ? { maxBranches: parsed.data.maxBranches }
        : {}),

      ...(parsed.data.maxUsers !== undefined
        ? { maxUsers: parsed.data.maxUsers }
        : {}),

      ...(parsed.data.trialDays !== undefined
        ? { trialDays: parsed.data.trialDays }
        : {}),

      ...(parsed.data.isActive !== undefined
        ? { isActive: parsed.data.isActive }
        : {}),

      ...(parsed.data.sortOrder !== undefined
        ? { sortOrder: parsed.data.sortOrder }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: Number(session.user.id),
      action: "SAAS_PLAN_UPDATE",
      entityType: "SaasPlan",
      entityId: String(id),
      metadata: JSON.stringify({
        before: {
          code: existing.code,
          name: existing.name,
          monthlyPrice: Number(existing.monthlyPrice),
          yearlyPrice: Number(existing.yearlyPrice),
          maxBranches: existing.maxBranches,
          maxUsers: existing.maxUsers,
          trialDays: existing.trialDays,
          isActive: existing.isActive,
        },
        after: parsed.data,
      }),
    },
  });

  return NextResponse.json({
    id: plan.id,
    ok: true,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: Context,
) {
  const { session, response } = await guard();
  if (response || !session) return response;

  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid plan id" },
      { status: 400 },
    );
  }

  const existing = await prisma.saasPlan.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          subscriptions: true,
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Plan not found" },
      { status: 404 },
    );
  }

  /*
   * Plans are never physically deleted once referenced.
   * Deactivation preserves subscription history.
   */
  if (existing._count.subscriptions > 0) {
    await prisma.saasPlan.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      ok: true,
      deactivated: true,
    });
  }

  await prisma.saasPlan.delete({
    where: { id },
  });

  return NextResponse.json({
    ok: true,
    deleted: true,
  });
}
