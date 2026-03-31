import { Prisma, prisma } from "@/lib/prisma";

export const PRICING_MODES = ["SHARED", "BRANCH"] as const;
export type PricingModeValue = (typeof PRICING_MODES)[number];
export const DEFAULT_PRICING_MODE: PricingModeValue = "BRANCH";

type TxClient = Prisma.TransactionClient | typeof prisma;

export function isPricingMode(value: unknown): value is PricingModeValue {
  return typeof value === "string" && PRICING_MODES.includes(value as PricingModeValue);
}

export async function syncSharedPricingFromBranch(
  tx: TxClient,
  input: {
    kioscoId: string;
    sourceBranchId: string;
    productIds?: string[];
    targetBranchIds?: string[];
  },
) {
  const sourceRecords = await tx.inventoryRecord.findMany({
    where: {
      branchId: input.sourceBranchId,
      ...(input.productIds && input.productIds.length > 0
        ? { productId: { in: input.productIds } }
        : {}),
    },
    select: {
      productId: true,
      price: true,
      cost: true,
    },
  });

  if (sourceRecords.length === 0) {
    // Continue: variants can still have pricing even if base records are empty.
  }

  const sourceVariantRecords = await tx.variantInventory.findMany({
    where: {
      branchId: input.sourceBranchId,
      variant: {
        ...(input.productIds && input.productIds.length > 0
          ? { productId: { in: input.productIds } }
          : {}),
      },
    },
    select: {
      variantId: true,
      price: true,
      cost: true,
    },
  });

  if (sourceRecords.length === 0 && sourceVariantRecords.length === 0) {
    return;
  }

  const targetBranchIds =
    input.targetBranchIds && input.targetBranchIds.length > 0
      ? input.targetBranchIds
      : (
          await tx.branch.findMany({
            where: {
              kioscoId: input.kioscoId,
              id: { not: input.sourceBranchId },
            },
            select: { id: true },
          })
        ).map((branch) => branch.id);

  for (const branchId of targetBranchIds) {
    for (const record of sourceRecords) {
      await tx.inventoryRecord.upsert({
        where: {
          productId_branchId: {
            productId: record.productId,
            branchId,
          },
        },
        create: {
          productId: record.productId,
          branchId,
          price: record.price,
          cost: record.cost,
          stock: 0,
          minStock: 0,
          showInGrid: true,
        },
        update: {
          price: record.price,
          cost: record.cost,
        },
      });
    }

    for (const record of sourceVariantRecords) {
      await tx.variantInventory.upsert({
        where: {
          variantId_branchId: {
            variantId: record.variantId,
            branchId,
          },
        },
        create: {
          variantId: record.variantId,
          branchId,
          stock: 0,
          minStock: 0,
          price: record.price,
          cost: record.cost,
        },
        update: {
          price: record.price,
          cost: record.cost,
        },
      });
    }
  }
}
