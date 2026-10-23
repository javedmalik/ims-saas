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

/*
=========================================================
GET BRANDING

Any authenticated user with valid
tenant/business/branch context may read branding.

This is intentionally NOT restricted by
VIEW_REPORTS or MANAGE_SETTINGS because the same
branding is needed by:
- invoices
- GRN
- reports
- POS print
- other printable documents
=========================================================
*/

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const tenantId = session.user.tenantId;

  const businessId = session.user.businessId;

  const branchId = session.user.branchId;

  if (!tenantId || !businessId || !branchId) {
    return NextResponse.json(
      {
        error: "Invalid session context. Please logout and login again.",
      },
      {
        status: 401,
      },
    );
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,

      businessId: businessId,

      isActive: true,

      business: {
        tenantId: tenantId,

        isActive: true,
      },
    },

    include: {
      business: {
        select: {
          id: true,

          legalName: true,

          tradeName: true,

          logoUrl: true,

          phone: true,

          email: true,

          website: true,

          pan: true,

          businessType: true,
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Business or branch context not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    /*
     * Business branding
     */

    logoUrl: branch.logoUrl ?? branch.business.logoUrl ?? "",

    legalName: branch.business.legalName,

    tradeName: branch.business.tradeName ?? "",

    website: branch.business.website ?? "",

    pan: branch.business.pan ?? "",

    businessType: branch.business.businessType ?? "",

    /*
     * Branch information
     */

    branchId: branch.id,

    branchName: branch.name,

    branchCode: branch.code,

    gstin: branch.gstin ?? "",

    state: branch.state ?? "",

    stateCode: branch.stateCode ?? "",

    address: [
      branch.addressLine1,
      branch.addressLine2,
      branch.city,
      branch.state,
      branch.pincode,
    ]
      .filter(Boolean)
      .join(", "),

    /*
     * Prefer branch contact information,
     * otherwise fall back to business contact.
     */

    phone: branch.phone ?? branch.business.phone ?? "",

    email: branch.email ?? branch.business.email ?? "",
  });
}

/*
=========================================================
PUT BRANDING

Only users having MANAGE_SETTINGS
permission may modify company branding.
=========================================================
*/

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const tenantId = session.user.tenantId;

  const businessId = session.user.businessId;

  const branchId = session.user.branchId;

  if (!tenantId || !businessId || !branchId) {
    return NextResponse.json(
      {
        error: "Invalid session context. Please logout and login again.",
      },
      {
        status: 401,
      },
    );
  }

  /*
   * Updating branding is restricted.
   */

  if (!can(session.user.role, "MANAGE_SETTINGS")) {
    return NextResponse.json(
      {
        error: "You do not have permission to update company branding.",
      },
      {
        status: 403,
      },
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = brandingSchema.safeParse(body);

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

  /*
   * Ensure current business belongs to
   * current tenant.
   */

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,

      tenantId: tenantId,

      isActive: true,
    },
  });

  if (!business) {
    return NextResponse.json(
      {
        error: "Business not found",
      },
      {
        status: 404,
      },
    );
  }

  /*
   * Also verify the user's active branch
   * belongs to this same business.
   */

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,

      businessId: businessId,

      isActive: true,
    },
  });

  if (!branch) {
    return NextResponse.json(
      {
        error: "Branch not found",
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
        id: business.id,
      },

      data: {
        logoUrl,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenantId,

        branchId: branchId,

        userId: Number(session.user.id),

        action: "BRANDING_UPDATE",

        entityType: "Business",

        entityId: String(business.id),

        metadata: JSON.stringify({
          before: {
            logoUrl: business.logoUrl,
          },

          after: {
            logoUrl,
          },
        }),
      },
    });
  });

  return NextResponse.json({
    ok: true,

    message: "Company branding updated successfully.",

    logoUrl,
  });
}
