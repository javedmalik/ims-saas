import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

const schema = z.object({ reason: z.enum(["PHYSICAL_COUNT", "DAMAGE", "EXPIRY", "BREAKAGE", "LOSS", "CORRECTION", "OTHER"]), note: z.string().trim().max(250).optional().nullable(), items: z.array(z.object({ batchId: z.coerce.number().int().positive(), qtyChange: z.coerce.number().int().refine(v => v !== 0, "Change cannot be zero") })).min(1) });

export async function GET() {
  const s = await getServerSession(authOptions); if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.stockAdjustment.findMany({ where: { branchId: s.user.branchId }, include: { items: { include: { batch: { include: { product: { select: { name: true } } } } } }, createdBy: { select: { fullName: true } } }, orderBy: { adjustmentDate: "desc" }, take: 200 });
  return NextResponse.json(rows.map(r => ({ ...r, id: r.id.toString(), items: r.items.map(i => ({ ...i, id: i.id.toString(), adjustmentId: i.adjustmentId.toString() })) })));
}

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions); if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "MANAGE_STOCK")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid adjustment", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const branch = await prisma.branch.findUnique({ where: { id: s.user.branchId } }); if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  try {
    const result = await prisma.$transaction(async tx => {
      const last = await tx.stockAdjustment.findFirst({ where: { branchId: s.user.branchId }, orderBy: { id: "desc" }, select: { id: true } });
      const adjustmentNo = `ADJ-${String(Number(last?.id ?? 0) + 1).padStart(6, "0")}`;
      const header = await tx.stockAdjustment.create({ data: { branchId: s.user.branchId, adjustmentNo, reason: d.reason, note: d.note || null, createdById: Number(s.user.id) } });
      for (const item of d.items) {
        const batch = await tx.productBatch.findFirst({ where: { id: item.batchId, branchId: s.user.branchId } });
        if (!batch) throw new Error(`Batch ${item.batchId} not found`);
        const newQty = batch.currentQty + item.qtyChange;
        if (!branch.allowNegativeStock && newQty < 0) throw new Error(`Adjustment would make batch ${batch.batchNo} negative.`);
        const updated = await tx.productBatch.update({ where: { id: batch.id }, data: { currentQty: newQty } });
        await tx.stockAdjustmentItem.create({ data: { adjustmentId: header.id, batchId: batch.id, qtyChange: item.qtyChange, previousQty: batch.currentQty, newQty } });
        await tx.stockLedgerEntry.create({ data: { branchId: s.user.branchId, batchId: batch.id, movementType: "ADJUSTMENT", referenceType: "StockAdjustment", referenceId: header.id.toString(), qtyChange: item.qtyChange, balanceAfter: updated.currentQty, note: `${d.reason}${d.note ? ` - ${d.note}` : ""}` } });
      }
      await tx.auditLog.create({ data: { tenantId: s.user.tenantId, branchId: s.user.branchId, userId: Number(s.user.id), action: "STOCK_ADJUSTMENT", entityType: "StockAdjustment", entityId: header.id.toString(), metadata: JSON.stringify({ adjustmentNo, reason: d.reason, items: d.items }) } });
      return header;
    });
    return NextResponse.json({ id: result.id.toString(), adjustmentNo: result.adjustmentNo }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Adjustment failed" }, { status: 400 }); }
}
