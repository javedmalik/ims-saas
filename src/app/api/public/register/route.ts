import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  tenantName: z.string().trim().min(2).max(150),
  businessName: z.string().trim().min(2).max(200),
  businessType: z.string().trim().max(80).optional().nullable(),

  fullName: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .min(4)
    .max(50)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Username may contain letters, numbers, dot, underscore and hyphen only",
    ),

  password: z.string().min(10).max(128),

  email: z.string().trim().email().max(120).optional().nullable(),

  phone: z.string().trim().max(30).optional().nullable(),

  planId: z.coerce.number().int().positive(),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(name: string) {
  const root = slugify(name) || "tenant";

  for (let i = 0; i < 100; i += 1) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;

    const existing = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) return slug;
  }

  return `${root}-${Date.now()}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const allowed = await checkRateLimit(`public-register:${ip}`, 5, 3600);

  if (!allowed) {
    return NextResponse.json(
      {
        error: "Too many registration attempts. Please try again later.",
      },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid registration details",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [plan, duplicateUser] = await Promise.all([
    prisma.saasPlan.findFirst({
      where: {
        id: data.planId,
        isActive: true,
      },
    }),

    prisma.user.findUnique({
      where: {
        username: data.username,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!plan) {
    return NextResponse.json(
      { error: "Selected plan is not available" },
      { status: 400 },
    );
  }

  if (duplicateUser) {
    return NextResponse.json(
      { error: "Username is already in use" },
      { status: 409 },
    );
  }

  const slug = await uniqueSlug(data.tenantName);

  const passwordHash = await bcrypt.hash(data.password, 12);

  const now = new Date();

  const trialEndsAt = plan.trialDays > 0 ? addDays(now, plan.trialDays) : null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          slug,
          isActive: true,
        },
      });

      const business = await tx.business.create({
        data: {
          tenantId: tenant.id,
          code: "MAIN",
          legalName: data.businessName,
          tradeName: data.businessName,
          businessType: data.businessType || null,
          email: data.email || null,
          phone: data.phone || null,
          currencyCode: plan.currencyCode,
          isActive: true,
        },
      });

      const branch = await tx.branch.create({
        data: {
          businessId: business.id,
          code: "MAIN",
          name: "Main Branch",
          email: data.email || null,
          phone: data.phone || null,
          invoicePrefix: "INV",
          purchasePrefix: "PUR",
          creditNotePrefix: "CN",
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          defaultBranchId: branch.id,
          username: data.username,
          fullName: data.fullName,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      });

      await tx.userBranchAccess.create({
        data: {
          userId: user.id,
          branchId: branch.id,
          role: "ADMIN",
          isActive: true,
        },
      });

      const subscription = await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: plan.trialDays > 0 ? "TRIAL" : "PAST_DUE",
          billingCycle: "MONTHLY",
          trialStartedAt: plan.trialDays > 0 ? now : null,
          trialEndsAt,
          notes: "Self-service tenant registration",
        },
      });

      await tx.subscriptionHistory.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          action: "TENANT_REGISTERED",
          fromStatus: null,
          toStatus: subscription.status,
          fromPlanCode: null,
          toPlanCode: plan.code,
          note: "Tenant registered through self-service onboarding.",
          metadata: JSON.stringify({
            businessId: business.id,
            branchId: branch.id,
            userId: user.id,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          userId: user.id,
          action: "TENANT_SELF_REGISTER",
          entityType: "Tenant",
          entityId: String(tenant.id),
          metadata: JSON.stringify({
            planCode: plan.code,
          }),
        },
      });

      return {
        tenantId: tenant.id,
        username: user.username,
        status: subscription.status,
        trialEndsAt,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        ...created,
        loginUrl: "/login",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create account",
      },
      { status: 400 },
    );
  }
}
