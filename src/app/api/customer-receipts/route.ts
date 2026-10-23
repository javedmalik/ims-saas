import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

const schema = z.object({
  customerId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  mode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(250).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "OPERATE_FINANCE"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const customerId = Number(req.nextUrl.searchParams.get("customerId") || 0);
  const rows = await prisma.customerReceipt.findMany({
    where: { branchId: s.user.branchId, ...(customerId ? { customerId } : {}) },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { receiptDate: "desc" },
    take: 300,
  });
  return NextResponse.json(
    rows.map((r) => ({ ...r, id: r.id.toString(), amount: Number(r.amount) })),
  );
}

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.user.role, "OPERATE_FINANCE"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid receipt", details: parsed.error.flatten() },
      { status: 400 },
    );
  const d = parsed.data;
  const customer = await prisma.customer.findFirst({
    where: { id: d.customerId, businessId: s.user.businessId, isActive: true },
  });
  if (!customer)
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const due = Number(customer.dueAmount);
  if (d.amount > due + 0.01)
    return NextResponse.json(
      { error: `Receipt cannot exceed outstanding ₹${due.toFixed(2)}` },
      { status: 400 },
    );

  const receipt = await prisma.$transaction(async (tx) => {
    const last = await tx.customerReceipt.findFirst({
      where: { branchId: s.user.branchId },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    const receiptNo = `RCPT-${String(Number(last?.id ?? 0) + 1).padStart(6, "0")}`;
    const row = await tx.customerReceipt.create({
      data: {
        branchId: s.user.branchId,
        customerId: d.customerId,
        receiptNo,
        mode: d.mode,
        amount: d.amount,
        reference: d.reference || null,
        note: d.note || null,
        createdById: Number(s.user.id),
      },
    });
    await tx.customer.update({
      where: { id: d.customerId },
      data: { dueAmount: { decrement: d.amount } },
    });
    await tx.customerLedgerEntry.create({
      data: {
        branchId: s.user.branchId,
        customerId: d.customerId,
        debit: 0,
        credit: d.amount,
        note: `Receipt ${receiptNo}${d.note ? ` - ${d.note}` : ""}`,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: s.user.tenantId,
        branchId: s.user.branchId,
        userId: Number(s.user.id),
        action: "CUSTOMER_RECEIPT",
        entityType: "CustomerReceipt",
        entityId: row.id.toString(),
        metadata: JSON.stringify({
          receiptNo,
          customerId: d.customerId,
          amount: d.amount,
          mode: d.mode,
        }),
      },
    });
    return row;
  });
  return NextResponse.json(
    {
      id: receipt.id.toString(),
      receiptNo: receipt.receiptNo,
      printUrl: `/print/customer-receipts/${receipt.id.toString()}`,
    },
    { status: 201 },
  );
}
