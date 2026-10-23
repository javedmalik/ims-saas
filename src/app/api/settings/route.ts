import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { settingsSchema } from "@/lib/validations/settings";

const nil = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branch = await prisma.branch.findFirst({
    where: {
      id: session.user.branchId,
      businessId: session.user.businessId,
      business: { tenantId: session.user.tenantId },
    },
    include: { business: true },
  });

  if (!branch) return NextResponse.json({ error: "Branch context not found" }, { status: 404 });

  return NextResponse.json({
    tenantId: session.user.tenantId,
    businessId: branch.businessId,
    branchId: branch.id,
    businessCode: branch.business.code,
    legalName: branch.business.legalName,
    tradeName: branch.business.tradeName ?? "",
    businessType: branch.business.businessType ?? "",
    pan: branch.business.pan ?? "",
    businessEmail: branch.business.email ?? "",
    businessPhone: branch.business.phone ?? "",
    website: branch.business.website ?? "",
    currencyCode: branch.business.currencyCode,
    financialYearStartMonth: branch.business.financialYearStartMonth,
    branchCode: branch.code,
    branchName: branch.name,
    addressLine1: branch.addressLine1 ?? "",
    addressLine2: branch.addressLine2 ?? "",
    city: branch.city ?? "",
    state: branch.state ?? "",
    stateCode: branch.stateCode ?? "",
    pincode: branch.pincode ?? "",
    branchPhone: branch.phone ?? "",
    branchEmail: branch.email ?? "",
    gstin: branch.gstin ?? "",
    invoicePrefix: branch.invoicePrefix,
    purchasePrefix: branch.purchasePrefix,
    creditNotePrefix: branch.creditNotePrefix,
    lowStockGlobal: branch.lowStockGlobal,
    allowNegativeStock: branch.allowNegativeStock,
    pricesIncludeTax: branch.pricesIncludeTax,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.user.role, "MANAGE_SETTINGS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = settingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings", details: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const current = await prisma.branch.findFirst({
    where: {
      id: session.user.branchId,
      businessId: session.user.businessId,
      business: { tenantId: session.user.tenantId },
    },
    include: { business: true },
  });
  if (!current) return NextResponse.json({ error: "Branch context not found" }, { status: 404 });

  const userId = Number(session.user.id);
  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: current.businessId },
      data: {
        legalName: d.legalName,
        tradeName: nil(d.tradeName),
        businessType: nil(d.businessType),
        pan: nil(d.pan)?.toUpperCase() ?? null,
        email: nil(d.businessEmail),
        phone: nil(d.businessPhone),
        website: nil(d.website),
        currencyCode: d.currencyCode.toUpperCase(),
        financialYearStartMonth: d.financialYearStartMonth,
      },
    });

    await tx.branch.update({
      where: { id: current.id },
      data: {
        name: d.branchName,
        addressLine1: nil(d.addressLine1),
        addressLine2: nil(d.addressLine2),
        city: nil(d.city),
        state: nil(d.state),
        stateCode: nil(d.stateCode),
        pincode: nil(d.pincode),
        phone: nil(d.branchPhone),
        email: nil(d.branchEmail),
        gstin: nil(d.gstin)?.toUpperCase() ?? null,
        invoicePrefix: d.invoicePrefix.toUpperCase(),
        purchasePrefix: d.purchasePrefix.toUpperCase(),
        creditNotePrefix: d.creditNotePrefix.toUpperCase(),
        lowStockGlobal: d.lowStockGlobal,
        allowNegativeStock: d.allowNegativeStock,
        pricesIncludeTax: d.pricesIncludeTax,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        branchId: current.id,
        userId: Number.isFinite(userId) ? userId : null,
        action: "SETTINGS_UPDATE",
        entityType: "Branch",
        entityId: String(current.id),
        metadata: JSON.stringify({ businessId: current.businessId, branchId: current.id }),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
