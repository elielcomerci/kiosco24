import type { Prisma } from "@prisma/client";
import {
  DEFAULT_KIOSCO_CATEGORIES,
  DEFAULT_KIOSCO_PRODUCTS,
} from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";

type ProvisionOwnerKioscoInput = {
  ownerId: string;
  kioscoName: string;
  mainBusinessActivity?: string | null;
  seedDefaultCatalog?: boolean;
};

async function provisionOwnerKioscoWithClient(
  tx: Prisma.TransactionClient,
  {
    ownerId,
    kioscoName,
    mainBusinessActivity = null,
    seedDefaultCatalog = true,
  }: ProvisionOwnerKioscoInput,
) {
  const kiosco = await tx.kiosco.create({
    data: {
      name: kioscoName,
      ownerId,
      mainBusinessActivity,
    },
  });

  const mainBranch = await tx.branch.create({
    data: {
      name: "Sucursal Principal",
      kioscoId: kiosco.id,
    },
  });

  if (!seedDefaultCatalog) {
    return {
      kiosco,
      mainBranch,
    };
  }

  const createdCategories = await Promise.all(
    DEFAULT_KIOSCO_CATEGORIES.map((category) =>
      tx.category.create({
        data: {
          name: category.name,
          color: category.color,
          kioscoId: kiosco.id,
          showInGrid: true,
        },
      }),
    ),
  );

  const categoryIdByKey = new Map(
    createdCategories.map((category, index) => [DEFAULT_KIOSCO_CATEGORIES[index].key, category.id]),
  );

  const createdProducts = [];

  for (const product of DEFAULT_KIOSCO_PRODUCTS) {
    const createdProduct = await tx.product.create({
      data: {
        name: product.name,
        barcode: product.barcode,
        brand: product.brand ?? null,
        description: product.description ?? null,
        presentation: product.presentation ?? null,
        categoryId: categoryIdByKey.get(product.categoryKey) ?? null,
        kioscoId: kiosco.id,
      },
    });

    createdProducts.push(createdProduct);
  }

  await tx.inventoryRecord.createMany({
    data: createdProducts.map((product, index) => ({
      productId: product.id,
      branchId: mainBranch.id,
      price: DEFAULT_KIOSCO_PRODUCTS[index].price,
      cost: DEFAULT_KIOSCO_PRODUCTS[index].cost,
      stock: 0,
      minStock: 0,
      showInGrid: true,
    })),
  });

  return {
    kiosco,
    mainBranch,
  };
}

export async function provisionOwnerKiosco({
  ownerId,
  kioscoName,
  mainBusinessActivity = null,
  seedDefaultCatalog = true,
}: ProvisionOwnerKioscoInput, tx?: Prisma.TransactionClient) {
  if (tx) {
    return provisionOwnerKioscoWithClient(tx, {
      ownerId,
      kioscoName,
      mainBusinessActivity,
      seedDefaultCatalog,
    });
  }

  return prisma.$transaction((transaction) =>
    provisionOwnerKioscoWithClient(transaction, {
      ownerId,
      kioscoName,
      mainBusinessActivity,
      seedDefaultCatalog,
    }),
  );
}
