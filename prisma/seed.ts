import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "default-tenant" },
    update: {},
    create: {
      name: process.env.NEXT_PUBLIC_APP_NAME || "IMS Demo Tenant",
      slug: "default-tenant",
      isActive: true,
    },
  });

  const business = await prisma.business.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "MAIN",
      legalName: process.env.SEED_BUSINESS_NAME || process.env.NEXT_PUBLIC_APP_NAME || "My Business",
      tradeName: process.env.NEXT_PUBLIC_APP_NAME || "My Business",
      businessType: "Retail",
      currencyCode: "INR",
      financialYearStartMonth: 4,
      isActive: true,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { businessId_code: { businessId: business.id, code: "HO" } },
    update: {},
    create: {
      businessId: business.id,
      code: "HO",
      name: "Head Office",
      invoicePrefix: "INV",
      purchasePrefix: "PUR",
      creditNotePrefix: "CN",
      lowStockGlobal: 10,
      pricesIncludeTax: true,
      allowNegativeStock: false,
      isActive: true,
    },
  });

  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@123";

  let admin = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        defaultBranchId: branch.id,
        username: adminUsername,
        fullName: "Administrator",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    console.log(`Created admin user "${adminUsername}" — change the password after first login.`);
  } else {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { tenantId: tenant.id, defaultBranchId: branch.id },
    });
    console.log(`Admin user "${adminUsername}" already exists; tenant/branch context refreshed.`);
  }

  await prisma.userBranchAccess.upsert({
    where: { userId_branchId: { userId: admin.id, branchId: branch.id } },
    update: { role: "ADMIN", isActive: true },
    create: { userId: admin.id, branchId: branch.id, role: "ADMIN", isActive: true },
  });

  console.log(`Tenant ready: ${tenant.name}`);
  console.log(`Business ready: ${business.legalName}`);
  console.log(`Branch ready: ${branch.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
