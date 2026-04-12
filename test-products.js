const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.platformProduct.findMany({
    where: {
      status: "APPROVED"
    },
    select: {
      barcode: true,
      name: true,
      brand: true,
      businessActivities: true,
    },
    take: 100
  });

  const unique = Array.from(new Set(products.map(p => JSON.stringify(p)))).map(p => JSON.parse(p));
  console.log(JSON.stringify(unique, null, 2));
}

main().finally(() => prisma.$disconnect());
