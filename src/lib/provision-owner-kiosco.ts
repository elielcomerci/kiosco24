import type { Prisma } from "@prisma/client";
import {
  DEFAULT_SEED_BY_ACTIVITY,
  DEFAULT_SEED_FALLBACK,
} from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";
import { findApprovedPlatformProductByBarcode } from "@/lib/platform-catalog";

type ProvisionOwnerKioscoInput = {
  ownerId: string;
  kioscoName: string;
  mainBusinessActivity?: string | null;
  subscriptionOfferPriceArs?: number | null;
  subscriptionOfferFreezeEndsAt?: Date | null;
};

async function provisionOwnerKioscoWithClient(
  tx: Prisma.TransactionClient,
  {
    ownerId,
    kioscoName,
    mainBusinessActivity = null,
    subscriptionOfferPriceArs = null,
    subscriptionOfferFreezeEndsAt = null,
  }: ProvisionOwnerKioscoInput,
) {
  const kiosco = await tx.kiosco.create({
    data: {
      name: kioscoName,
      ownerId,
      mainBusinessActivity,
      subscriptionOfferPriceArs,
      subscriptionOfferFreezeEndsAt,
    },
  });

  const mainBranch = await tx.branch.create({
    data: {
      name: "Sucursal Principal",
      kioscoId: kiosco.id,
    },
  });

  // Siempre sembramos 1 producto representativo del rubro elegido,
  // para que la grilla no quede vacía al primer ingreso.
  const activityKey = (mainBusinessActivity ?? "OTRO").toUpperCase();
  const seed = DEFAULT_SEED_BY_ACTIVITY[activityKey] ?? DEFAULT_SEED_FALLBACK;

  const createdCategory = await tx.category.create({
    data: {
      name: seed.category.name,
      color: seed.category.color,
      kioscoId: kiosco.id,
      showInGrid: true,
    },
  });

  const platformProduct = seed.product.barcode 
    ? await findApprovedPlatformProductByBarcode(seed.product.barcode) 
    : null;

  const createdProduct = await tx.product.create({
    data: {
      name: platformProduct?.name ?? seed.product.name,
      barcode: seed.product.barcode,
      brand: platformProduct?.brand ?? seed.product.brand ?? null,
      description: platformProduct?.description ?? seed.product.description ?? null,
      presentation: platformProduct?.presentation ?? seed.product.presentation ?? null,
      image: platformProduct?.image ?? null,
      platformProductId: platformProduct?.id ?? null,
      categoryId: createdCategory.id,
      kioscoId: kiosco.id,
    },
  });

  await tx.inventoryRecord.create({
    data: {
      productId: createdProduct.id,
      branchId: mainBranch.id,
      price: seed.product.price,
      cost: seed.product.cost,
      stock: 0,
      minStock: 0,
      showInGrid: true,
    },
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
  subscriptionOfferPriceArs = null,
  subscriptionOfferFreezeEndsAt = null,
}: ProvisionOwnerKioscoInput, tx?: Prisma.TransactionClient) {
  if (tx) {
    return provisionOwnerKioscoWithClient(tx, {
      ownerId,
      kioscoName,
      mainBusinessActivity,
      subscriptionOfferPriceArs,
      subscriptionOfferFreezeEndsAt,
    });
  }

  return prisma.$transaction((transaction) =>
    provisionOwnerKioscoWithClient(transaction, {
      ownerId,
      kioscoName,
      mainBusinessActivity,
      subscriptionOfferPriceArs,
      subscriptionOfferFreezeEndsAt,
    }),
  );
}
