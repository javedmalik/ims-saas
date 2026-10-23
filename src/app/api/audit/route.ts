import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions); if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "VIEW_AUDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("search")?.trim() || "";
  const rows = await prisma.auditLog.findMany({
    where: { tenantId: s.user.tenantId, ...(s.user.role === "ADMIN" ? {} : { branchId: s.user.branchId }), ...(q ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }, { entityId: { contains: q } }] } : {}) },
    include: { user: { select: { fullName: true, username: true } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1000,
  });
  return NextResponse.json(rows.map(r => ({ ...r, id: r.id.toString() })));
}
