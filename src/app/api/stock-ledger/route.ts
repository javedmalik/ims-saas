import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions); if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  const rows = await prisma.stockLedgerEntry.findMany({
    where: { branchId: s.user.branchId, ...(search ? { batch: { OR: [{ batchNo: { contains: search } }, { product: { name: { contains: search } } }] } } : {}) },
    include: { batch: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { txnDate: "desc" }, take: 1000,
  });
  return NextResponse.json(rows.map(r => ({ ...r, id: r.id.toString(), product: r.batch.product.name, sku: r.batch.product.sku, batchNo: r.batch.batchNo })));
}
