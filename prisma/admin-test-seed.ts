import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedProduct = Awaited<ReturnType<typeof prisma.product.create>>;

async function main() {
  console.log("Starting Admin business test seed...");

  /*
  =========================================================
  1. FIND ADMIN
  =========================================================
  */

  const admin = await prisma.user.findUnique({
    where: {
      username: "admin",
    },
  });

  if (!admin) {
    throw new Error('Admin user "admin" not found.');
  }

  if (!admin.defaultBranchId) {
    throw new Error("Admin user does not have a default branch.");
  }

  /*
  =========================================================
  2. FIND ADMIN BRANCH + BUSINESS
  =========================================================
  */

  const branch = await prisma.branch.findUnique({
    where: {
      id: admin.defaultBranchId,
    },

    include: {
      business: {
        include: {
          tenant: true,
        },
      },
    },
  });

  if (!branch) {
    throw new Error("Admin default branch not found.");
  }

  const business = branch.business;

  const tenant = business.tenant;

  console.log("");
  console.log("Target Tenant   :", tenant.name);

  console.log("Target Business :", business.legalName);

  console.log("Target Branch   :", branch.name);

  /*
  =========================================================
  3. PRODUCTS
  =========================================================
  */

  const products = [
    {
      name: "Paracetamol 500mg",

      sku: "ADM-MED001",

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

      sku: "ADM-MED002",

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

      sku: "ADM-GEN001",

      brand: "CleanCare",

      variant: "500 ml",

      category: "Personal Care",

      unit: "pcs",

      hsnCode: "3808",

      defaultTaxPercent: 18,

      reorderLevel: 15,
    },

    {
      name: "Premium Basmati Rice 5kg",

      sku: "ADM-GROC001",

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

      sku: "ADM-GROC002",

      brand: "FreshLeaf",

      variant: "500 g",

      category: "Grocery",

      unit: "pack",

      hsnCode: "0902",

      defaultTaxPercent: 5,

      reorderLevel: 10,
    },

    {
      name: "Mineral Water 1L",

      sku: "ADM-BEV001",

      brand: "Fresh Water",

      variant: "1 Litre",

      category: "Beverages",

      unit: "bottle",

      hsnCode: "2201",

      defaultTaxPercent: 18,

      reorderLevel: 24,
    },

    {
      name: "Bath Soap 100g",

      sku: "ADM-FMCG001",

      brand: "Demo Care",

      variant: "100 g",

      category: "FMCG",

      unit: "pcs",

      hsnCode: "3401",

      defaultTaxPercent: 18,

      reorderLevel: 20,
    },
  ];

  const createdProducts: SeedProduct[] = [];

  for (const item of products) {
    const existing = await prisma.product.findFirst({
      where: {
        businessId: business.id,

        sku: item.sku,
      },
    });

    let product: SeedProduct;

    if (existing) {
      product = await prisma.product.update({
        where: {
          id: existing.id,
        },

        data: {
          name: item.name,

          brand: item.brand,

          variant: item.variant,

          category: item.category,

          unit: item.unit,

          hsnCode: item.hsnCode,

          defaultTaxPercent: item.defaultTaxPercent,

          reorderLevel: item.reorderLevel,

          isActive: true,
        },
      });
    } else {
      product = await prisma.product.create({
        data: {
          businessId: business.id,

          ...item,

          isActive: true,
        },
      });
    }

    createdProducts.push(product);
  }

  /*
  =========================================================
  4. STOCK / PRODUCT BATCHES
  =========================================================
  */

  const batchData = [
    {
      productIndex: 0,

      batchNo: "ADM-PCM001",

      expiryDate: new Date("2027-12-31"),

      mrp: 30,

      costPrice: 18,

      sellPrice: 28,

      openingQty: 100,

      currentQty: 100,

      rackLocation: "A-01",
    },

    {
      productIndex: 1,

      batchNo: "ADM-VIT001",

      expiryDate: new Date("2027-10-31"),

      mrp: 180,

      costPrice: 120,

      sellPrice: 165,

      openingQty: 50,

      currentQty: 50,

      rackLocation: "A-02",
    },

    {
      productIndex: 2,

      batchNo: "ADM-SAN001",

      expiryDate: new Date("2028-01-31"),

      mrp: 220,

      costPrice: 140,

      sellPrice: 199,

      openingQty: 40,

      currentQty: 40,

      rackLocation: "B-01",
    },

    {
      productIndex: 3,

      batchNo: "ADM-RICE001",

      expiryDate: new Date("2027-06-30"),

      mrp: 450,

      costPrice: 350,

      sellPrice: 425,

      openingQty: 30,

      currentQty: 30,

      rackLocation: "C-01",
    },

    {
      productIndex: 4,

      batchNo: "ADM-TEA001",

      expiryDate: new Date("2027-08-31"),

      mrp: 300,

      costPrice: 210,

      sellPrice: 275,

      openingQty: 35,

      currentQty: 35,

      rackLocation: "C-02",
    },

    {
      productIndex: 5,

      batchNo: "ADM-WATER001",

      expiryDate: new Date("2027-04-30"),

      mrp: 25,

      costPrice: 15,

      sellPrice: 20,

      openingQty: 120,

      currentQty: 120,

      rackLocation: "D-01",
    },

    {
      productIndex: 6,

      batchNo: "ADM-SOAP001",

      expiryDate: new Date("2028-03-31"),

      mrp: 55,

      costPrice: 35,

      sellPrice: 50,

      openingQty: 80,

      currentQty: 80,

      rackLocation: "D-02",
    },
  ];

  for (const batch of batchData) {
    const product = createdProducts[batch.productIndex];

    if (!product) {
      throw new Error(`Product not found for index ${batch.productIndex}`);
    }

    const existing = await prisma.productBatch.findFirst({
      where: {
        branchId: branch.id,

        productId: product.id,

        batchNo: batch.batchNo,
      },
    });

    if (existing) {
      await prisma.productBatch.update({
        where: {
          id: existing.id,
        },

        data: {
          expiryDate: batch.expiryDate,

          mrp: batch.mrp,

          costPrice: batch.costPrice,

          sellPrice: batch.sellPrice,

          openingQty: batch.openingQty,

          currentQty: batch.currentQty,

          rackLocation: batch.rackLocation,
        },
      });
    } else {
      await prisma.productBatch.create({
        data: {
          branchId: branch.id,

          productId: product.id,

          batchNo: batch.batchNo,

          expiryDate: batch.expiryDate,

          mrp: batch.mrp,

          costPrice: batch.costPrice,

          sellPrice: batch.sellPrice,

          openingQty: batch.openingQty,

          currentQty: batch.currentQty,

          rackLocation: batch.rackLocation,
        },
      });
    }
  }

  /*
  =========================================================
  5. SUPPLIERS
  =========================================================
  */

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

      phone: "01204112222",

      taxId: "09AAACN5678B1Z2",

      addressLine1: "Sector 62",

      city: "Noida",

      state: "Uttar Pradesh",

      pincode: "201309",
    },

    {
      name: "Metro FMCG Suppliers",

      contactPerson: "Sanjay Jain",

      mobile: "9833333333",

      phone: "01143333333",

      taxId: "07AAACM4321C1Z7",

      addressLine1: "Kirti Nagar",

      city: "New Delhi",

      state: "Delhi",

      pincode: "110015",
    },
  ];

  for (const supplier of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: {
        businessId: business.id,

        name: supplier.name,
      },
    });

    if (existing) {
      await prisma.supplier.update({
        where: {
          id: existing.id,
        },

        data: {
          ...supplier,

          isActive: true,
        },
      });
    } else {
      await prisma.supplier.create({
        data: {
          businessId: business.id,

          ...supplier,

          isActive: true,
        },
      });
    }
  }

  /*
  =========================================================
  6. CUSTOMERS
  =========================================================
  */

  const customers = [
    {
      name: "Rahul Verma",

      mobile: "9876501001",

      address: "Karol Bagh, New Delhi",

      referredBy: "Walk-in",

      taxId: null,

      dueAmount: 0,
    },

    {
      name: "Anjali Gupta",

      mobile: "9876501002",

      address: "Rajouri Garden, New Delhi",

      referredBy: "Existing Customer",

      taxId: null,

      dueAmount: 500,
    },

    {
      name: "ABC Enterprises",

      mobile: "9876501003",

      address: "Connaught Place, New Delhi",

      referredBy: "Business",

      taxId: "07AAACA1111A1Z1",

      dueAmount: 1500,
    },

    {
      name: "Mohit Sharma",

      mobile: "9876501004",

      address: "Janakpuri, New Delhi",

      referredBy: "Walk-in",

      taxId: null,

      dueAmount: 0,
    },

    {
      name: "Delhi Office Solutions",

      mobile: "9876501005",

      address: "Nehru Place, New Delhi",

      referredBy: "Business",

      taxId: "07AAACD2222B1Z4",

      dueAmount: 2500,
    },
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: {
        businessId: business.id,

        mobile: customer.mobile,
      },
    });

    if (existing) {
      await prisma.customer.update({
        where: {
          id: existing.id,
        },

        data: {
          ...customer,
        },
      });
    } else {
      await prisma.customer.create({
        data: {
          businessId: business.id,

          ...customer,
        },
      });
    }
  }

  /*
  =========================================================
  7. PURCHASE TEST DATA
  =========================================================
  */

  console.log("");
  console.log("Creating purchase test data...");

  function round2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  type PurchaseSeedItem = {
    productIndex: number;
    batchNo: string;

    qty: number;
    freeQty: number;

    mrp: number;
    costPrice: number;
    sellPrice: number;

    discountPercent: number;
    taxPercent: number;
  };

  type PurchaseSeed = {
    invoiceNo: string;

    invoiceDate: Date;

    supplierName: string;

    items: PurchaseSeedItem[];

    payments: {
      mode: string;
      amount: number;
      reference?: string;
    }[];
  };

  const purchaseSeeds: PurchaseSeed[] = [
    /*
     * Purchase 1
     * Fully paid by Cash
     */
    {
      invoiceNo: "ADM-PUR-0001",

      invoiceDate: new Date("2026-09-05T11:00:00"),

      supplierName: "Delhi Wholesale Traders",

      items: [
        {
          productIndex: 0,

          batchNo: "ADM-PCM001",

          qty: 50,

          freeQty: 5,

          mrp: 30,

          costPrice: 18,

          sellPrice: 28,

          discountPercent: 0,

          taxPercent: 12,
        },

        {
          productIndex: 1,

          batchNo: "ADM-VIT001",

          qty: 20,

          freeQty: 2,

          mrp: 180,

          costPrice: 120,

          sellPrice: 165,

          discountPercent: 5,

          taxPercent: 12,
        },
      ],

      payments: [],
    },

    /*
     * Purchase 2
     * Split / partial payment.
     *
     * Remaining amount will become Due.
     */
    {
      invoiceNo: "ADM-PUR-0002",

      invoiceDate: new Date("2026-09-12T14:30:00"),

      supplierName: "North India Distributors",

      items: [
        {
          productIndex: 3,

          batchNo: "ADM-RICE001",

          qty: 20,

          freeQty: 1,

          mrp: 450,

          costPrice: 350,

          sellPrice: 425,

          discountPercent: 2,

          taxPercent: 5,
        },

        {
          productIndex: 4,

          batchNo: "ADM-TEA001",

          qty: 15,

          freeQty: 0,

          mrp: 300,

          costPrice: 210,

          sellPrice: 275,

          discountPercent: 0,

          taxPercent: 5,
        },
      ],

      payments: [
        {
          mode: "BANK_TRANSFER",

          amount: 4000,

          reference: "BANK-DEMO-001",
        },

        {
          mode: "UPI",

          amount: 3000,

          reference: "UPI-DEMO-001",
        },
      ],
    },

    /*
     * Purchase 3
     * Completely Credit / Due
     */
    {
      invoiceNo: "ADM-PUR-0003",

      invoiceDate: new Date("2026-09-18T10:15:00"),

      supplierName: "Metro FMCG Suppliers",

      items: [
        {
          productIndex: 2,

          batchNo: "ADM-SAN001",

          qty: 30,

          freeQty: 3,

          mrp: 220,

          costPrice: 140,

          sellPrice: 199,

          discountPercent: 0,

          taxPercent: 18,
        },

        {
          productIndex: 5,

          batchNo: "ADM-WATER001",

          qty: 60,

          freeQty: 5,

          mrp: 25,

          costPrice: 15,

          sellPrice: 20,

          discountPercent: 0,

          taxPercent: 18,
        },

        {
          productIndex: 6,

          batchNo: "ADM-SOAP001",

          qty: 40,

          freeQty: 4,

          mrp: 55,

          costPrice: 35,

          sellPrice: 50,

          discountPercent: 3,

          taxPercent: 18,
        },
      ],

      payments: [],
    },
  ];

  /*
  =========================================================
  PURCHASE CALCULATION
  =========================================================
  */

  for (const seed of purchaseSeeds) {
    /*
     * Avoid duplicate invoice when seed runs again.
     */

    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        branchId: branch.id,

        invoiceNo: seed.invoiceNo,
      },
    });

    if (existingPurchase) {
      console.log(`Purchase ${seed.invoiceNo} already exists - skipped.`);

      continue;
    }

    /*
     * Find supplier belonging to Admin business.
     */

    const supplier = await prisma.supplier.findFirst({
      where: {
        businessId: business.id,

        name: seed.supplierName,
      },
    });

    if (!supplier) {
      throw new Error(`Supplier not found: ${seed.supplierName}`);
    }

    /*
     * Prepare calculated lines.
     */

    const calculatedItems: Array<{
      productId: number;
      batchId: number;

      batchNo: string;

      expiryDate: Date | null;

      qty: number;
      freeQty: number;

      mrp: number;
      costPrice: number;
      sellPrice: number;

      discountPercent: number;

      discountAmount: number;

      taxPercent: number;

      taxAmount: number;

      taxableAmount: number;

      lineTotal: number;
    }> = [];

    let grossAmount = 0;

    let totalDiscount = 0;

    let taxableAmount = 0;

    let totalTax = 0;

    let netAmount = 0;

    for (const seedItem of seed.items) {
      const product = createdProducts[seedItem.productIndex];

      if (!product) {
        throw new Error(
          `Product not found for purchase ${seed.invoiceNo}, index ${seedItem.productIndex}`,
        );
      }

      const batch = await prisma.productBatch.findFirst({
        where: {
          branchId: branch.id,

          productId: product.id,

          batchNo: seedItem.batchNo,
        },
      });

      if (!batch) {
        throw new Error(
          `Batch ${seedItem.batchNo} not found for ${product.name}`,
        );
      }

      /*
       * Free quantity is not charged.
       */

      const gross = round2(seedItem.qty * seedItem.costPrice);

      const discount = round2(gross * (seedItem.discountPercent / 100));

      const taxable = round2(gross - discount);

      const tax = round2(taxable * (seedItem.taxPercent / 100));

      const lineTotal = round2(taxable + tax);

      grossAmount += gross;

      totalDiscount += discount;

      taxableAmount += taxable;

      totalTax += tax;

      netAmount += lineTotal;

      calculatedItems.push({
        productId: product.id,

        batchId: batch.id,

        batchNo: seedItem.batchNo,

        expiryDate: batch.expiryDate,

        qty: seedItem.qty,

        freeQty: seedItem.freeQty,

        mrp: seedItem.mrp,

        costPrice: seedItem.costPrice,

        sellPrice: seedItem.sellPrice,

        discountPercent: seedItem.discountPercent,

        discountAmount: discount,

        taxPercent: seedItem.taxPercent,

        taxAmount: tax,

        taxableAmount: taxable,

        lineTotal,
      });
    }

    grossAmount = round2(grossAmount);

    totalDiscount = round2(totalDiscount);

    taxableAmount = round2(taxableAmount);

    totalTax = round2(totalTax);

    netAmount = round2(netAmount);

    /*
     * Purchase 1 has no manually configured
     * payment, so make it fully CASH paid.
     */

    if (seed.invoiceNo === "ADM-PUR-0001") {
      seed.payments = [
        {
          mode: "CASH",

          amount: netAmount,

          reference: "CASH-DEMO-001",
        },
      ];
    }

    const paidAmount = round2(
      seed.payments.reduce((total, payment) => total + payment.amount, 0),
    );

    if (paidAmount > netAmount) {
      throw new Error(`Payment exceeds purchase total for ${seed.invoiceNo}`);
    }

    const dueAmount = round2(netAmount - paidAmount);

    const paymentMode =
      seed.payments.length === 0
        ? "CREDIT"
        : seed.payments.length === 1
          ? (seed.payments[0]?.mode ?? "CREDIT")
          : "SPLIT";

    /*
     * Create Purchase Header
     */

    const purchase = await prisma.purchase.create({
      data: {
        branchId: branch.id,

        supplierId: supplier.id,

        invoiceNo: seed.invoiceNo,

        invoiceDate: seed.invoiceDate,

        grossAmount,

        totalDiscount,

        taxableAmount,

        totalTax,

        netAmount,

        paymentMode,

        paidAmount,

        dueAmount,

        isCancelled: false,

        createdById: admin.id,
      },
    });

    /*
     * Create Purchase Items
     */

    for (const item of calculatedItems) {
      await prisma.purchaseItem.create({
        data: {
          purchaseId: purchase.id,

          productId: item.productId,

          batchId: item.batchId,

          batchNo: item.batchNo,

          expiryDate: item.expiryDate,

          qty: item.qty,

          freeQty: item.freeQty,

          mrp: item.mrp,

          costPrice: item.costPrice,

          sellPrice: item.sellPrice,

          discountPercent: item.discountPercent,

          discountAmount: item.discountAmount,

          taxPercent: item.taxPercent,

          taxAmount: item.taxAmount,

          lineTotal: item.lineTotal,
        },
      });
    }

    /*
     * Create individual payment records.
     */

    for (const payment of seed.payments) {
      await prisma.purchasePayment.create({
        data: {
          purchaseId: purchase.id,

          branchId: branch.id,

          mode: payment.mode,

          amount: payment.amount,

          reference: payment.reference ?? null,
        },
      });
    }

    /*
     * Audit
     */

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,

        branchId: branch.id,

        userId: admin.id,

        action: "PURCHASE_SEED_CREATE",

        entityType: "Purchase",

        entityId: String(purchase.id),

        metadata: JSON.stringify({
          invoiceNo: seed.invoiceNo,

          supplier: supplier.name,

          netAmount,

          paidAmount,

          dueAmount,

          paymentMode,
        }),
      },
    });

    console.log(
      `Purchase created: ${seed.invoiceNo} | Net ₹${netAmount.toFixed(
        2,
      )} | Paid ₹${paidAmount.toFixed(2)} | Due ₹${dueAmount.toFixed(2)}`,
    );
  }

  /*
  =========================================================
  8. BACKFILL OPENING STOCK LEDGER + SUPPLIER LEDGER
  =========================================================
  */

  const seededBatches = await prisma.productBatch.findMany({
    where: {
      branchId: branch.id,
      productId: { in: createdProducts.map((p) => p.id) },
    },
  });

  for (const batch of seededBatches) {
    const exists = await prisma.stockLedgerEntry.findFirst({
      where: {
        branchId: branch.id,
        batchId: batch.id,
        movementType: "OPENING",
      },
      select: { id: true },
    });
    if (!exists && batch.currentQty !== 0) {
      await prisma.stockLedgerEntry.create({
        data: {
          branchId: branch.id,
          batchId: batch.id,
          movementType: "OPENING",
          referenceType: "Seed",
          referenceId: "ADMIN-TEST-SEED",
          qtyChange: batch.currentQty,
          balanceAfter: batch.currentQty,
          note: "Opening balance created by admin test seed",
        },
      });
    }
  }

  const seededPurchases = await prisma.purchase.findMany({
    where: {
      branchId: branch.id,
      invoiceNo: { in: purchaseSeeds.map((x) => x.invoiceNo) },
      isCancelled: false,
    },
  });

  for (const purchase of seededPurchases) {
    if (Number(purchase.dueAmount) <= 0) continue;
    const exists = await prisma.supplierLedgerEntry.findFirst({
      where: {
        branchId: branch.id,
        supplierId: purchase.supplierId,
        referenceType: "Purchase",
        referenceId: purchase.id.toString(),
      },
      select: { id: true },
    });
    if (!exists) {
      await prisma.supplierLedgerEntry.create({
        data: {
          branchId: branch.id,
          supplierId: purchase.supplierId,
          entryType: "PURCHASE",
          referenceType: "Purchase",
          referenceId: purchase.id.toString(),
          debit: 0,
          credit: purchase.dueAmount,
          note: `Seed purchase ${purchase.invoiceNo}`,
        },
      });
    }
  }

  /*
  =========================================================
  COMPLETED
  =========================================================
  */

  console.log("");
  console.log("Admin test data created successfully.");

  console.log("");
  console.log("Tenant   :", tenant.name);

  console.log("Business :", business.legalName);

  console.log("Branch   :", branch.name);

  console.log("");
  console.log(`Products  : ${products.length}`);

  console.log(`Batches   : ${batchData.length}`);

  console.log(`Suppliers : ${suppliers.length}`);

  console.log(`Customers : ${customers.length}`);

  console.log(`Purchases : ${purchaseSeeds.length}`);

  console.log("");
  console.log("Login with your existing admin account.");
}

main()
  .catch((error) => {
    console.error("Admin test seed failed:");

    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
