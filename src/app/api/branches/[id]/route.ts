import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { assertBranchLimit } from "@/lib/subscription";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user.role, "MANAGE_SETTINGS"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = Number(params.id);
  const body = await req.json();
  if (!Number.isInteger(id))
    return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });

  const branch = await prisma.branch.findFirst({
    where: { id, businessId: session.user.businessId },
  });
  if (!branch)
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  if (id === session.user.branchId && body.isActive === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your current branch." },
      { status: 400 },
    );
  }

  if (!branch.isActive && body.isActive === true) {
    try {
      await assertBranchLimit(session.user.tenantId, session.user.businessId);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Branch limit reached",
        },
        { status: 409 },
      );
    }
  }

  await prisma.branch.update({
    where: { id },
    data: { isActive: Boolean(body.isActive) },
  });
  return NextResponse.json({ ok: true });
}
