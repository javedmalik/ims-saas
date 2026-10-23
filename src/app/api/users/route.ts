import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import bcrypt from "bcryptjs";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/db";

import { can } from "@/lib/rbac";

import { userSchema } from "@/lib/validations/user";
import { assertUserLimit } from "@/lib/subscription";

function invalidContext() {
  return NextResponse.json(
    {
      error:
        "Your login session is missing tenant or branch information. Please sign out and sign in again.",
    },
    {
      status: 401,
    },
  );
}

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

  if (
    !session.user.tenantId ||
    !session.user.businessId ||
    !session.user.branchId
  ) {
    return invalidContext();
  }

  if (!can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const rows = await prisma.user.findMany({
    where: {
      tenantId: session.user.tenantId,
    },

    select: {
      id: true,

      username: true,

      fullName: true,

      role: true,

      isActive: true,

      lastLoginAt: true,

      defaultBranchId: true,

      defaultBranch: {
        select: {
          name: true,
        },
      },

      branchAccess: {
        select: {
          branchId: true,
          isActive: true,
          role: true,
        },
      },
    },

    orderBy: {
      fullName: "asc",
    },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
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

  if (
    !session.user.tenantId ||
    !session.user.businessId ||
    !session.user.branchId
  ) {
    return invalidContext();
  }

  if (!can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  try {
    await assertUserLimit(session.user.tenantId);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "User limit reached",
      },
      { status: 409 },
    );
  }

  const body = await req.json();

  const parsed = userSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid user data",
        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const data = parsed.data;

  const password = data.password;

  if (!password || password.length < 8) {
    return NextResponse.json(
      {
        error: "Valid password (8+ characters) is required",
      },
      {
        status: 400,
      },
    );
  }

  const requestedBranchIds = [
    ...new Set([data.defaultBranchId, ...data.branchIds]),
  ];
  const validBranches = await prisma.branch.findMany({
    where: {
      id: { in: requestedBranchIds },
      business: { tenantId: session.user.tenantId },
      isActive: true,
    },
    select: { id: true },
  });
  if (validBranches.length !== requestedBranchIds.length) {
    return NextResponse.json(
      { error: "One or more selected branches are invalid" },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      username: data.username,
    },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        error: "Username already exists",
      },
      {
        status: 409,
      },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: session.user.tenantId,

        defaultBranchId: data.defaultBranchId,

        username: data.username.trim(),

        fullName: data.fullName.trim(),

        passwordHash,

        role: data.role,

        isActive: data.isActive,
      },
    });

    for (const branchId of requestedBranchIds) {
      await tx.userBranchAccess.create({
        data: { userId: user.id, branchId, role: data.role, isActive: true },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,

        branchId: session.user.branchId,

        userId: Number(session.user.id),

        action: "USER_CREATE",

        entityType: "User",

        entityId: String(user.id),

        metadata: JSON.stringify({
          username: user.username,

          role: user.role,

          defaultBranchId: user.defaultBranchId,
          branchIds: requestedBranchIds,
        }),
      },
    });

    return user;
  });

  return NextResponse.json(
    {
      id: created.id,
    },
    {
      status: 201,
    },
  );
}
