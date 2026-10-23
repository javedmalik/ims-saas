import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { productSchema } from "@/lib/validations/product";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user.role, "MANAGE_CATALOG")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid product id" }, { status: 400 });

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid product data", details: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.product.findFirst({ where: { id, businessId: session.user.businessId } });
  if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const data = parsed.data;
  if (data.sku) {
    const duplicate = await prisma.product.findFirst({
      where: { businessId: session.user.businessId, sku: data.sku, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "SKU already exists in this business." }, { status: 409 });
  }

  const userId = Number(session.user.id);
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        branchId: session.user.branchId,
        userId: Number.isFinite(userId) ? userId : null,
        action: "PRODUCT_UPDATE",
        entityType: "Product",
        entityId: String(id),
        metadata: JSON.stringify({ before: existing, after: data }),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
