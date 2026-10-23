import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.saleItem.findMany({
    where: {
      OR: [{ costPriceAtSale: null }, { costAmount: null }],
    },
    include: {
      batch: {
        select: {
          costPrice: true,
          batchNo: true,
          product: { select: { name: true } },
        },
      },
      sale: {
        select: { billNo: true },
      },
    },
  });

  let updated = 0;

  for (const row of rows) {
    const costPriceAtSale = Number(row.batch.costPrice);
    const costAmount = costPriceAtSale * row.qty;

    await prisma.saleItem.update({
      where: { id: row.id },
      data: { costPriceAtSale, costAmount },
    });

    updated += 1;
    console.log(
      `${row.sale.billNo} | ${row.batch.product.name} | ${row.batch.batchNo} | estimated cost ${costPriceAtSale}`,
    );
  }

  console.log(`Backfilled ${updated} sale item(s).`);
  console.log(
    "Historical backfill uses the CURRENT batch cost. It is an estimate, not guaranteed original historical COGS.",
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
