import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await prisma.userBranchAccess.findMany({
    where: { userId: Number(session.user.id), isActive: true, branch: { isActive: true, business: { isActive: true, tenantId: session.user.tenantId } } },
    include: { branch: { include: { business: { select: { id: true, legalName: true } } } } },
    orderBy: { branch: { name: "asc" } },
  });

  return NextResponse.json(access.map((x) => ({
    id: x.branch.id,
    name: x.branch.name,
    code: x.branch.code,
    businessId: x.branch.businessId,
    businessName: x.branch.business.legalName,
    role: x.role || session.user.role,
    current: x.branch.id === session.user.branchId,
  })));
}
