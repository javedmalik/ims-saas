import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "MAKE_SALE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [batches, customers, branch] = await Promise.all([
    prisma.productBatch.findMany({
      where: {
        branchId: s.user.branchId,
        currentQty: { gt: 0 },
        product: { businessId: s.user.businessId, isActive: true },
        OR: [{ expiryDate: null }, { expiryDate: { gte: today } }],
      },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { expiryDate: "asc" }],
    }),
    prisma.customer.findMany({ where: { businessId: s.user.businessId, isActive: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.branch.findUnique({ where: { id: s.user.branchId } }),
  ]);

  return NextResponse.json({
    branch: { stateCode: branch?.stateCode, pricesIncludeTax: branch?.pricesIncludeTax, allowNegativeStock: branch?.allowNegativeStock },
    customers: customers.map(c => ({ ...c, dueAmount: Number(c.dueAmount) })),
    batches: batches.map(b => ({ id: b.id, productId: b.productId, name: b.product.name, sku: b.product.sku, unit: b.product.unit, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: b.currentQty, mrp: Number(b.mrp), sellPrice: Number(b.sellPrice), taxPercent: Number(b.product.defaultTaxPercent) })),
  });
}
