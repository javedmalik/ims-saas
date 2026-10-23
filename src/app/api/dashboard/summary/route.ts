import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = session.user.branchId;
  const businessId = session.user.businessId;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nearExpiryHorizon = new Date();
  nearExpiryHorizon.setDate(nearExpiryHorizon.getDate() + 90);

  const [todaySalesAgg, monthSalesAgg, billsToday, totalProducts, branch, nearExpiryCount, recentSales, stockRows] = await Promise.all([
    prisma.sale.aggregate({ _sum: { netAmount: true }, where: { branchId, billDateTime: { gte: startOfToday }, isCancelled: false } }),
    prisma.sale.aggregate({ _sum: { netAmount: true }, where: { branchId, billDateTime: { gte: startOfMonth }, isCancelled: false } }),
    prisma.sale.count({ where: { branchId, billDateTime: { gte: startOfToday }, isCancelled: false } }),
    prisma.product.count({ where: { businessId, isActive: true } }),
    prisma.branch.findUnique({ where: { id: branchId }, include: { business: true } }),
    prisma.productBatch.count({ where: { branchId, expiryDate: { not: null, lte: nearExpiryHorizon, gte: now }, currentQty: { gt: 0 } } }),
    prisma.sale.findMany({
      where: { branchId, isCancelled: false },
      orderBy: { billDateTime: "desc" },
      take: 5,
      select: { id: true, billNo: true, billDateTime: true, netAmount: true, customer: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { businessId, isActive: true },
      select: { reorderLevel: true, batches: { where: { branchId }, select: { currentQty: true } } },
    }),
  ]);

  const lowStockCount = stockRows.filter((p) => p.batches.reduce((sum, b) => sum + b.currentQty, 0) <= p.reorderLevel).length;

  return NextResponse.json({
    todaySales: Number(todaySalesAgg._sum.netAmount ?? 0),
    monthSales: Number(monthSalesAgg._sum.netAmount ?? 0),
    billsToday,
    totalProducts,
    lowStockCount,
    nearExpiryCount,
    currencyCode: branch?.business.currencyCode ?? "INR",
    businessName: branch?.business.legalName ?? "Business",
    branchName: branch?.name ?? "Branch",
    recentSales: recentSales.map((s) => ({
      id: s.id.toString(),
      billNo: s.billNo,
      billDateTime: s.billDateTime,
      netAmount: Number(s.netAmount),
      customerName: s.customer?.name ?? "Walk-in",
    })),
  });
}
