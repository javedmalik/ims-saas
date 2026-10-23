import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { z } from "zod";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { can } from "@/lib/rbac";

const brandingSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .url("Please enter a valid image URL")
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
});

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: session.user.branchId,

      businessId: session.user.businessId,

      business: {
        tenantId: session.user.tenantId,
      },
    },

    include: {
      business: true,
    },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Business context not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    logoUrl: branch.business.logoUrl ?? "",

    legalName: branch.business.legalName,

    tradeName: branch.business.tradeName ?? "",

    branchName: branch.name,

    gstin: branch.gstin ?? "",

    address: [
      branch.addressLine1,
      branch.addressLine2,
      branch.city,
      branch.state,
      branch.pincode,
    ]
      .filter(Boolean)
      .join(", "),

    phone: branch.phone ?? branch.business.phone ?? "",

    email: branch.email ?? branch.business.email ?? "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!can(session.user.role, "MANAGE_SETTINGS")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const parsed = brandingSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid branding data",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: session.user.branchId,

      businessId: session.user.businessId,

      business: {
        tenantId: session.user.tenantId,
      },
    },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Business context not found",
      },
      {
        status: 404,
      },
    );
  }

  const logoUrl = parsed.data.logoUrl?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: {
        id: branch.businessId,
      },

      data: {
        logoUrl,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,

        branchId: session.user.branchId,

        userId: Number(session.user.id),

        action: "BRANDING_UPDATE",

        entityType: "Business",

        entityId: String(branch.businessId),

        metadata: JSON.stringify({
          logoUrl,
        }),
      },
    });
  });

  return NextResponse.json({
    ok: true,
    logoUrl,
  });
}
