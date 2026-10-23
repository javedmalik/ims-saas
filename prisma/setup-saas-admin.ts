import {
  PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma =
  new PrismaClient();

function addDays(
  date: Date,
  days: number,
) {
  return new Date(
    date.getTime() +
      days * 86_400_000,
  );
}

async function main() {
  const username =
    process.env.SUPER_ADMIN_USERNAME ||
    "saasadmin";

  const password =
    process.env.SUPER_ADMIN_PASSWORD;

  if (!password || password.length < 10) {
    throw new Error(
      "Set SUPER_ADMIN_PASSWORD to a strong password with at least 10 characters before running this script.",
    );
  }

  const starter =
    await prisma.saasPlan.upsert({
      where: {
        code: "STARTER",
      },

      create: {
        code: "STARTER",
        name: "Starter",
        description:
          "Starter SaaS plan. Adjust pricing and limits before production.",
        monthlyPrice: 999,
        yearlyPrice: 9990,
        currencyCode: "INR",
        maxBranches: 2,
        maxUsers: 5,
        trialDays: 14,
        sortOrder: 10,
      },

      update: {},
    });

  await prisma.saasPlan.upsert({
    where: {
      code: "GROWTH",
    },

    create: {
      code: "GROWTH",
      name: "Growth",
      description:
        "Growth SaaS plan. Adjust pricing and limits before production.",
      monthlyPrice: 2499,
      yearlyPrice: 24990,
      currencyCode: "INR",
      maxBranches: 10,
      maxUsers: 25,
      trialDays: 14,
      sortOrder: 20,
    },

    update: {},
  });

  await prisma.saasPlan.upsert({
    where: {
      code: "ENTERPRISE",
    },

    create: {
      code: "ENTERPRISE",
      name: "Enterprise",
      description:
        "Enterprise SaaS plan. Pricing can be negotiated/manual.",
      monthlyPrice: 0,
      yearlyPrice: 0,
      currencyCode: "INR",
      maxBranches: 1000,
      maxUsers: 10000,
      trialDays: 0,
      sortOrder: 30,
    },

    update: {},
  });

  const platformTenant =
    await prisma.tenant.upsert({
      where: {
        slug: "__platform__",
      },

      create: {
        name: "IMS SaaS Platform",
        slug: "__platform__",
        isActive: true,
      },

      update: {
        isActive: true,
      },
    });

  const platformBusiness =
    await prisma.business.upsert({
      where: {
        tenantId_code: {
          tenantId:
            platformTenant.id,
          code: "PLATFORM",
        },
      },

      create: {
        tenantId:
          platformTenant.id,
        code: "PLATFORM",
        legalName:
          "IMS SaaS Platform",
        tradeName:
          "IMS SaaS",
        currencyCode: "INR",
        isActive: true,
      },

      update: {
        isActive: true,
      },
    });

  let platformBranch =
    await prisma.branch.findFirst({
      where: {
        businessId:
          platformBusiness.id,
        code: "HQ",
      },
    });

  if (!platformBranch) {
    platformBranch =
      await prisma.branch.create({
        data: {
          businessId:
            platformBusiness.id,
          code: "HQ",
          name:
            "Platform HQ",
          invoicePrefix: "PLT",
          isActive: true,
        },
      });
  }

  const passwordHash =
    await bcrypt.hash(
      password,
      12,
    );

  const admin =
    await prisma.user.upsert({
      where: {
        username,
      },

      create: {
        tenantId:
          platformTenant.id,
        defaultBranchId:
          platformBranch.id,
        username,
        fullName:
          "SaaS Super Admin",
        passwordHash,
        role: "ADMIN",
        platformRole:
          "SUPER_ADMIN",
        isActive: true,
      },

      update: {
        passwordHash,
        platformRole:
          "SUPER_ADMIN",
        isActive: true,
        defaultBranchId:
          platformBranch.id,
      },
    });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: admin.id,
        branchId:
          platformBranch.id,
      },
    },

    create: {
      userId: admin.id,
      branchId:
        platformBranch.id,
      role: "ADMIN",
      isActive: true,
    },

    update: {
      role: "ADMIN",
      isActive: true,
    },
  });

  const tenants =
    await prisma.tenant.findMany({
      where: {
        id: {
          not:
            platformTenant.id,
        },
      },

      select: {
        id: true,
      },
    });

  const now =
    new Date();

  for (
    const tenant
    of tenants
  ) {
    await prisma.tenantSubscription.upsert({
      where: {
        tenantId:
          tenant.id,
      },

      create: {
        tenantId:
          tenant.id,
        planId:
          starter.id,
        status: "TRIAL",
        billingCycle:
          "MONTHLY",
        trialStartedAt:
          now,
        trialEndsAt:
          addDays(
            now,
            starter.trialDays,
          ),
      },

      update: {},
    });
  }

  console.log(
    "SaaS plans and Super Admin created.",
  );

  console.log(
    `Super Admin username: ${username}`,
  );

  console.log(
    `${tenants.length} existing tenant(s) now have a subscription record.`,
  );

  console.log(
    "Review seeded plan prices/limits before production.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
