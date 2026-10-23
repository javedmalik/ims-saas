import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { userSchema } from "@/lib/validations/user";
import { assertUserLimit } from "@/lib/subscription";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "MANAGE_USERS"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(params.id);
  const existing = await prisma.user.findFirst({
    where: { id, tenantId: s.user.tenantId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = userSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid user", details: parsed.error.flatten() },
      { status: 400 },
    );
  const d = parsed.data;

  if (!existing.isActive && d.isActive) {
    try {
      await assertUserLimit(s.user.tenantId);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "User limit reached",
        },
        { status: 409 },
      );
    }
  }

  const duplicate = await prisma.user.findFirst({
    where: { username: d.username, NOT: { id } },
  });
  if (duplicate)
    return NextResponse.json(
      { error: "Username already exists" },
      { status: 409 },
    );
  const branchIds = [...new Set([d.defaultBranchId, ...d.branchIds])];
  const branches = await prisma.branch.findMany({
    where: {
      id: { in: branchIds },
      business: { tenantId: s.user.tenantId },
      isActive: true,
    },
    select: { id: true },
  });
  if (branches.length !== branchIds.length)
    return NextResponse.json(
      { error: "One or more selected branches are invalid" },
      { status: 400 },
    );

  const data: any = {
    defaultBranchId: d.defaultBranchId,
    username: d.username,
    fullName: d.fullName,
    role: d.role,
    isActive: d.isActive,
  };
  if (d.password) data.passwordHash = await bcrypt.hash(d.password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    const current = await tx.userBranchAccess.findMany({
      where: { userId: id },
      select: { branchId: true },
    });
    for (const row of current) {
      await tx.userBranchAccess.update({
        where: { userId_branchId: { userId: id, branchId: row.branchId } },
        data: { isActive: branchIds.includes(row.branchId), role: d.role },
      });
    }
    for (const branchId of branchIds.filter(
      (x) => !current.some((c) => c.branchId === x),
    )) {
      await tx.userBranchAccess.create({
        data: { userId: id, branchId, role: d.role, isActive: true },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: s.user.tenantId,
        branchId: s.user.branchId,
        userId: Number(s.user.id),
        action: "USER_UPDATE",
        entityType: "User",
        entityId: String(id),
        metadata: JSON.stringify({
          username: d.username,
          role: d.role,
          defaultBranchId: d.defaultBranchId,
          branchIds,
        }),
      },
    });
  });
  return NextResponse.json({ ok: true });
}
