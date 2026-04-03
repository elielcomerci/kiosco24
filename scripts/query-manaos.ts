import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { name: { contains: 'manaos', mode: 'insensitive' } },
    include: {
      inventory: true,
      restockItems: {
        include: {
          restockEvent: true,
        },
        orderBy: {
          restockEvent: { createdAt: 'desc' }
        },
        take: 5
      }
    }
  });

  console.log(JSON.stringify(products, null, 2));

  // Also look at sale items
  for (const product of products) {
    const sold = await prisma.saleItem.findMany({
      where: { productId: product.id },
      orderBy: { sale: { createdAt: 'desc'} },
      take: 5,
      include: { sale: true }
    });
    console.log(`Sales for ${product.name}:`);
    sold.forEach(s => console.log(`${s.sale.createdAt} - Qty: ${s.quantity}`));
  }
}

main().finally(() => prisma.$disconnect());
