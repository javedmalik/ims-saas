import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { productSchema } from "@/lib/validations/product";

function decimalToNumber(value: unknown) {
  return Number(value ?? 0);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  console.log("PRODUCT SESSION CONTEXT", {
  userId: session.user.id,
  username: session.user.username,
  role: session.user.role,
  tenantId: session.user.tenantId,
  businessId: session.user.businessId,
  branchId: session.user.branchId,
});

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const status = req.nextUrl.searchParams.get("status") ?? "active";

  const products = await prisma.product.findMany({
    where: {
      businessId: session.user.businessId,
      ...(status === "active"
        ? { isActive: true }
        : status === "inactive"
          ? { isActive: false }
          : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { sku: { contains: search } },
              { brand: { contains: search } },
              { category: { contains: search } },
              { hsnCode: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      batches: {
        where: { branchId: session.user.branchId },
        select: { currentQty: true },
      },
    },
  });

  console.log("PRODUCT QUERY RESULT", {
  businessId: session.user.businessId,
  branchId: session.user.branchId,
  count: products.length,

  products: products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,

    stockQty: p.batches.reduce(
      (sum, b) =>
        sum + b.currentQty,
      0
    ),
  })),
});

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.brand,
      variant: p.variant,
      category: p.category,
      unit: p.unit,
      hsnCode: p.hsnCode,
      defaultTaxPercent: decimalToNumber(p.defaultTaxPercent),
      reorderLevel: p.reorderLevel,
      isActive: p.isActive,
      stockQty: p.batches.reduce((sum, b) => sum + b.currentQty, 0),
      batchCount: p.batches.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user.role, "MANAGE_CATALOG"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid product data", details: parsed.error.flatten() },
      { status: 400 },
    );

  const data = parsed.data;
  if (data.sku) {
    const duplicate = await prisma.product.findFirst({
      where: { businessId: session.user.businessId, sku: data.sku },
      select: { id: true },
    });
    if (duplicate)
      return NextResponse.json(
        { error: "SKU already exists in this business." },
        { status: 409 },
      );
  }

  const userId = Number(session.user.id);
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: { ...data, businessId: session.user.businessId },
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        branchId: session.user.branchId,
        userId: Number.isFinite(userId) ? userId : null,
        action: "PRODUCT_CREATE",
        entityType: "Product",
        entityId: String(created.id),
        metadata: JSON.stringify({ name: created.name, sku: created.sku }),
      },
    });
    return created;
  });

  return NextResponse.json({ id: product.id }, { status: 201 });
}
