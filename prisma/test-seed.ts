import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const createdProducts = [];

const prisma = new PrismaClient();

async function main() {
  console.log("Starting test data seed...");

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: "demo-tenant",
    },
    update: {},
    create: {
      name: "Demo Retail Group",
      slug: "demo-tenant",
      isActive: true,
    },
  });

  const business = await prisma.business.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "DEMO",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "DEMO",
      legalName: "Demo Retail Private Limited",
      tradeName: "Demo Mart",
      businessType: "Retail",
      pan: "ABCDE1234F",
      email: "demo@example.com",
      phone: "9876543210",
      currencyCode: "INR",
      financialYearStartMonth: 4,
      isActive: true,
    },
  });

  const delhiBranch = await prisma.branch.upsert({
    where: {
      businessId_code: {
        businessId: business.id,
        code: "DELHI",
      },
    },
    update: {},
    create: {
      businessId: business.id,
      code: "DELHI",
      name: "Delhi Main Branch",
      addressLine1: "Karol Bagh",
      city: "New Delhi",
      state: "Delhi",
      stateCode: "07",
      pincode: "110005",
      phone: "01140000001",
      email: "delhi@example.com",
      gstin: "07ABCDE1234F1Z5",
      invoicePrefix: "DEL-INV",
      purchasePrefix: "DEL-PUR",
      creditNotePrefix: "DEL-CN",
      lowStockGlobal: 10,
      allowNegativeStock: false,
      pricesIncludeTax: true,
      isActive: true,
    },
  });

  const noidaBranch = await prisma.branch.upsert({
    where: {
      businessId_code: {
        businessId: business.id,
        code: "NOIDA",
      },
    },
    update: {},
    create: {
      businessId: business.id,
      code: "NOIDA",
      name: "Noida Branch",
      addressLine1: "Sector 18",
      city: "Noida",
      state: "Uttar Pradesh",
      stateCode: "09",
      pincode: "201301",
      phone: "01204000001",
      email: "noida@example.com",
      gstin: "09ABCDE1234F1Z1",
      invoicePrefix: "NOI-INV",
      purchasePrefix: "NOI-PUR",
      creditNotePrefix: "NOI-CN",
      lowStockGlobal: 10,
      allowNegativeStock: false,
      pricesIncludeTax: true,
      isActive: true,
    },
  });

  const passwordHash = await bcrypt.hash("Test@123", 12);

  const manager = await prisma.user.upsert({
    where: {
      username: "manager",
    },

    update: {
      tenantId: tenant.id,
      defaultBranchId: delhiBranch.id,
      fullName: "Demo Manager",
      passwordHash,
      role: "MANAGER",
      isActive: true,
    },

    create: {
      tenantId: tenant.id,
      defaultBranchId: delhiBranch.id,
      username: "manager",
      fullName: "Demo Manager",
      passwordHash,
      role: "MANAGER",
      isActive: true,
    },
  });

  const cashier = await prisma.user.upsert({
    where: {
      username: "cashier",
    },

    update: {
      tenantId: tenant.id,
      defaultBranchId: delhiBranch.id,
      fullName: "Demo Cashier",
      passwordHash,
      role: "CASHIER",
      isActive: true,
    },

    create: {
      tenantId: tenant.id,
      defaultBranchId: delhiBranch.id,
      username: "cashier",
      fullName: "Demo Cashier",
      passwordHash,
      role: "CASHIER",
      isActive: true,
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: manager.id,
        branchId: delhiBranch.id,
      },
    },
    update: {
      role: "MANAGER",
      isActive: true,
    },
    create: {
      userId: manager.id,
      branchId: delhiBranch.id,
      role: "MANAGER",
      isActive: true,
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: manager.id,
        branchId: noidaBranch.id,
      },
    },
    update: {
      role: "MANAGER",
      isActive: true,
    },
    create: {
      userId: manager.id,
      branchId: noidaBranch.id,
      role: "MANAGER",
      isActive: true,
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: cashier.id,
        branchId: delhiBranch.id,
      },
    },
    update: {
      role: "CASHIER",
      isActive: true,
    },
    create: {
      userId: cashier.id,
      branchId: delhiBranch.id,
      role: "CASHIER",
      isActive: true,
    },
  });

  const products = [
    {
      name: "Paracetamol 500mg",
      sku: "MED001",
      brand: "Demo Pharma",
      variant: "10 Tablets",
      category: "Medicine",
      unit: "strip",
      hsnCode: "3004",
      defaultTaxPercent: 12,
      reorderLevel: 20,
    },
    {
      name: "Vitamin C Tablets",
      sku: "MED002",
      brand: "HealthPlus",
      variant: "20 Tablets",
      category: "Supplements",
      unit: "bottle",
      hsnCode: "3004",
      defaultTaxPercent: 12,
      reorderLevel: 10,
    },
    {
      name: "Hand Sanitizer 500ml",
      sku: "GEN001",
      brand: "CleanCare",
      variant: "500 ml",
      category: "Personal Care",
      unit: "pcs",
      hsnCode: "3808",
      defaultTaxPercent: 18,
      reorderLevel: 15,
    },
    {
      name: "Rice 5kg",
      sku: "GROC001",
      brand: "Daily Choice",
      variant: "5 kg",
      category: "Grocery",
      unit: "bag",
      hsnCode: "1006",
      defaultTaxPercent: 5,
      reorderLevel: 10,
    },
    {
      name: "Premium Tea 500g",
      sku: "GROC002",
      brand: "FreshLeaf",
      variant: "500 g",
      category: "Grocery",
      unit: "pack",
      hsnCode: "0902",
      defaultTaxPercent: 5,
      reorderLevel: 10,
    },
  ];

  const createdProducts = [];

  for (const item of products) {
    const existing = await prisma.product.findFirst({
      where: {
        businessId: business.id,
        sku: item.sku,
      },
    });

    const product =
      existing ??
      (await prisma.product.create({
        data: {
          businessId: business.id,
          ...item,
          isActive: true,
        },
      }));

    createdProducts.push(product);
  }

  const batchData = [
    {
      productIndex: 0,
      batchNo: "PCM2401",
      mrp: 30,
      costPrice: 18,
      sellPrice: 28,
      openingQty: 100,
      currentQty: 100,
    },
    {
      productIndex: 1,
      batchNo: "VIT2401",
      mrp: 180,
      costPrice: 120,
      sellPrice: 165,
      openingQty: 50,
      currentQty: 50,
    },
    {
      productIndex: 2,
      batchNo: "SAN2401",
      mrp: 220,
      costPrice: 140,
      sellPrice: 199,
      openingQty: 40,
      currentQty: 40,
    },
    {
      productIndex: 3,
      batchNo: "RIC2401",
      mrp: 450,
      costPrice: 350,
      sellPrice: 425,
      openingQty: 30,
      currentQty: 30,
    },
    {
      productIndex: 4,
      batchNo: "TEA2401",
      mrp: 300,
      costPrice: 210,
      sellPrice: 275,
      openingQty: 35,
      currentQty: 35,
    },
  ];

  for (const batch of batchData) {
    const product = createdProducts[batch.productIndex];

    if (!product) {
      throw new Error(
        `Product not found for batch index ${batch.productIndex}`,
      );
    }

    const existingBatch = await prisma.productBatch.findFirst({
      where: {
        branchId: delhiBranch.id,
        productId: product.id,
        batchNo: batch.batchNo,
      },
    });

    if (!existingBatch) {
      await prisma.productBatch.create({
        data: {
          branchId: delhiBranch.id,
          productId: product.id,
          batchNo: batch.batchNo,
          expiryDate: new Date("2027-12-31"),
          mrp: batch.mrp,
          costPrice: batch.costPrice,
          sellPrice: batch.sellPrice,
          openingQty: batch.openingQty,
          currentQty: batch.currentQty,
          rackLocation: `R-${batch.productIndex + 1}`,
        },
      });
    }
  }

  const suppliers = [
    {
      name: "Delhi Wholesale Traders",
      contactPerson: "Ramesh Kumar",
      mobile: "9811111111",
      phone: "01141111111",
      taxId: "07AAACD1234A1Z5",
      addressLine1: "Sadar Bazaar",
      city: "Delhi",
      state: "Delhi",
      pincode: "110006",
    },
    {
      name: "North India Distributors",
      contactPerson: "Amit Sharma",
      mobile: "9822222222",
      taxId: "09AAACN5678B1Z2",
      addressLine1: "Sector 62",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201309",
    },
  ];

  for (const supplier of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: {
        businessId: business.id,
        name: supplier.name,
      },
    });

    if (!existing) {
      await prisma.supplier.create({
        data: {
          businessId: business.id,
          ...supplier,
          isActive: true,
        },
      });
    }
  }

  const customers = [
    {
      name: "Rahul Verma",
      mobile: "9876500001",
      address: "Karol Bagh, New Delhi",
      referredBy: "Walk-in",
      taxId: null,
      dueAmount: 0,
    },
    {
      name: "Anjali Gupta",
      mobile: "9876500002",
      address: "Rajouri Garden, New Delhi",
      referredBy: "Existing Customer",
      taxId: null,
      dueAmount: 500,
    },
    {
      name: "ABC Enterprises",
      mobile: "9876500003",
      address: "Connaught Place, New Delhi",
      referredBy: "Business",
      taxId: "07AAACA1111A1Z1",
      dueAmount: 1500,
    },
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: {
        businessId: business.id,
        mobile: customer.mobile,
      },
    });

    if (!existing) {
      await prisma.customer.create({
        data: {
          businessId: business.id,
          ...customer,
        },
      });
    }
  }

  console.log("");
  console.log("Test data created successfully.");
  console.log("");
  console.log("Tenant       :", tenant.name);
  console.log("Business     :", business.legalName);
  console.log("Delhi Branch :", delhiBranch.name);
  console.log("Noida Branch :", noidaBranch.name);
  console.log("");
  console.log("Manager Login");
  console.log("Username: manager");
  console.log("Password: Test@123");
  console.log("");
  console.log("Cashier Login");
  console.log("Username: cashier");
  console.log("Password: Test@123");
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
