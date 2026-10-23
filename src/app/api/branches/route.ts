import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { branchCreateSchema } from "@/lib/validations/settings";
import { assertBranchLimit } from "@/lib/subscription";

const nil = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branches = await prisma.branch.findMany({
    where: { businessId: session.user.businessId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,

      city: true,
      state: true,

      gstin: true,

      logoUrl: true,

      isActive: true,
    },
  });
  return NextResponse.json(branches);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user.role, "MANAGE_SETTINGS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await assertBranchLimit(session.user.tenantId, session.user.businessId);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Branch limit reached",
      },
      { status: 409 },
    );
  }

  const parsed = branchCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid branch data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const code = d.code.toUpperCase();

  const duplicate = await prisma.branch.findFirst({
    where: { businessId: session.user.businessId, code },
  });
  if (duplicate)
    return NextResponse.json(
      { error: "Branch code already exists." },
      { status: 409 },
    );

  const userId = Number(session.user.id);
  const branch = await prisma.$transaction(async (tx: any) => {
    const created = await tx.branch.create({
      data: {
        businessId: session.user.businessId,
        code,
        name: d.name,
        city: nil(d.city),
        state: nil(d.state),
        stateCode: nil(d.stateCode),
        gstin: nil(d.gstin)?.toUpperCase() ?? null,
        invoicePrefix: d.invoicePrefix.toUpperCase(),
      },
    });
    await tx.userBranchAccess.create({
      data: {
        userId,
        branchId: created.id,
        role: session.user.role,
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        branchId: created.id,
        userId,
        action: "BRANCH_CREATE",
        entityType: "Branch",
        entityId: String(created.id),
        metadata: JSON.stringify({ code: created.code, name: created.name }),
      },
    });
    return created;
  });

  return NextResponse.json({ id: branch.id }, { status: 201 });
}
