import { RestockEventType, RestockValuationStatus } from "@prisma/client";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

export type InventoryValuationScope = "branch" | "kiosco";

type WorkingLayer = {
  id: string;
  sourceType: string;
  unitCost: number;
  remainingQuantity: number;
  totalValue: number;
  receivedAt: Date;
  branchId: string;
  branchName: string;
};

type WorkingBranchSnapshot = {
  branchId: string;
  branchName: string;
  actualStock: number;
  sellableStock: number;
  valuedUnits: number;
  valuedCapital: number;
  pendingUnits: number;
  pendingLines: number;
  negativePendingUnits: number;
  negativeReservations: number;
  layersCount: number;
  currentPrice: number | null;
};

type WorkingRow = {
  key: string;
  productId: string;
  productName: string;
  productImage: string | null;
  productBarcode: string | null;
  variantId: string | null;
  variantName: string | null;
  variantBarcode: string | null;
  actualStock: number;
  valuedUnits: number;
  valuedCapital: number;
  pendingUnits: number;
  pendingLines: number;
  negativePendingUnits: number;
  negativeReservations: number;
  layersCount: number;
  latestReceivedAt: Date | null;
  layers: WorkingLayer[];
  branches: Map<string, WorkingBranchSnapshot>;
};

function buildRowKey(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? "base"}`;
}

function buildPriceKey(branchId: string, productId: string, variantId?: string | null) {
  return `${branchId}:${productId}:${variantId ?? "base"}`;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function ensureRow(
  rows: Map<string, WorkingRow>,
  input: {
    productId: string;
    productName: string;
    productImage: string | null;
    productBarcode: string | null;
    variantId: string | null;
    variantName: string | null;
    variantBarcode: string | null;
  },
) {
  const key = buildRowKey(input.productId, input.variantId);
  const existing = rows.get(key);
  if (existing) {
    return existing;
  }

  const created: WorkingRow = {
    key,
    productId: input.productId,
    productName: input.productName,
    productImage: input.productImage,
    productBarcode: input.productBarcode,
    variantId: input.variantId,
    variantName: input.variantName,
    variantBarcode: input.variantBarcode,
    actualStock: 0,
    valuedUnits: 0,
    valuedCapital: 0,
    pendingUnits: 0,
    pendingLines: 0,
    negativePendingUnits: 0,
    negativeReservations: 0,
    layersCount: 0,
    latestReceivedAt: null,
    layers: [],
    branches: new Map<string, WorkingBranchSnapshot>(),
  };

  rows.set(key, created);
  return created;
}

function ensureBranchSnapshot(
  row: WorkingRow,
  input: {
    branchId: string;
    branchName: string;
  },
) {
  const existing = row.branches.get(input.branchId);
  if (existing) {
    return existing;
  }

  const created: WorkingBranchSnapshot = {
    branchId: input.branchId,
    branchName: input.branchName,
    actualStock: 0,
    sellableStock: 0,
    valuedUnits: 0,
    valuedCapital: 0,
    pendingUnits: 0,
    pendingLines: 0,
    negativePendingUnits: 0,
    negativeReservations: 0,
    layersCount: 0,
    currentPrice: null,
  };

  row.branches.set(input.branchId, created);
  return created;
}

function createEmptySummary() {
  return {
    actualStock: 0,
    valuedCapital: 0,
    valuedUnits: 0,
    potentialRevenue: 0,
    valuedPotentialMargin: 0,
    pendingUnits: 0,
    pendingLines: 0,
    uncoveredUnits: 0,
    overtrackedUnits: 0,
    negativePendingUnits: 0,
    negativeReservations: 0,
    pendingProducts: 0,
    uncoveredProducts: 0,
    unpricedUnits: 0,
    layersCount: 0,
    productsCount: 0,
    branchCount: 0,
  };
}

export async function getInventoryValuation(input: {
  scope: InventoryValuationScope;
  branchId?: string | null;
  kioscoId?: string | null;
}) {
  const branchWhere =
    input.scope === "kiosco"
      ? input.kioscoId
        ? { kioscoId: input.kioscoId }
        : null
      : input.branchId
        ? { id: input.branchId }
        : null;

  if (!branchWhere) {
    return {
      meta: {
        scope: input.scope,
        scopeLabel: input.scope === "kiosco" ? "Kiosco" : "Sucursal",
        branchesInScope: [] as Array<{ id: string; name: string }>,
      },
      summary: createEmptySummary(),
      products: [] as Array<unknown>,
    };
  }

  const branches = await prisma.branch.findMany({
    where: branchWhere,
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const branchIds = branches.map((branch) => branch.id);
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));

  if (branchIds.length === 0) {
    return {
      meta: {
        scope: input.scope,
        scopeLabel: input.scope === "kiosco" ? "Kiosco" : "Sucursal",
        branchesInScope: [] as Array<{ id: string; name: string }>,
      },
      summary: createEmptySummary(),
      products: [] as Array<unknown>,
    };
  }

  const [inventoryRecords, variantStocks, layers, pendingItems, negativeReservations] = await Promise.all([
    prisma.inventoryRecord.findMany({
      where: {
        branchId: { in: branchIds },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            barcode: true,
          },
        },
      },
    }),
    prisma.variantInventory.findMany({
      where: {
        branchId: { in: branchIds },
      },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            barcode: true,
            product: {
              select: {
                id: true,
                name: true,
                image: true,
                barcode: true,
              },
            },
          },
        },
      },
    }),
    prisma.inventoryCostLayer.findMany({
      where: {
        branchId: { in: branchIds },
        remainingQuantity: { gt: 0 },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            barcode: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.restockItem.findMany({
      where: {
        quantity: { gt: 0 },
        unitCost: null,
        restockEvent: {
          branchId: { in: branchIds },
          type: RestockEventType.RECEIVE,
          valuationStatus: {
            not: RestockValuationStatus.NOT_APPLICABLE,
          },
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            barcode: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
        restockEvent: {
          select: {
            branchId: true,
          },
        },
      },
    }),
    prisma.negativeStockReservation.findMany({
      where: {
        branchId: { in: branchIds },
        quantityPending: { gt: 0 },
        resolvedAt: null,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            barcode: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
      },
    }),
  ]);

  const rows = new Map<string, WorkingRow>();
  const priceByBranchProduct = new Map<string, number | null>();

  for (const inventory of inventoryRecords) {
    const safePrice = Number.isFinite(inventory.price) && inventory.price > 0 ? inventory.price : null;
    priceByBranchProduct.set(buildPriceKey(inventory.branchId, inventory.productId, null), safePrice);
  }

  for (const inventory of variantStocks) {
    const safePrice =
      typeof inventory.price === "number" && Number.isFinite(inventory.price) && inventory.price > 0
        ? inventory.price
        : null;
    priceByBranchProduct.set(
      buildPriceKey(inventory.branchId, inventory.variant.product.id, inventory.variantId),
      safePrice,
    );
  }

  for (const inventory of inventoryRecords) {
    const actualStock = inventory.stock ?? 0;
    if (actualStock === 0) {
      continue;
    }

    const row = ensureRow(rows, {
      productId: inventory.productId,
      productName: inventory.product.name,
      productImage: inventory.product.image,
      productBarcode: inventory.product.barcode,
      variantId: null,
      variantName: null,
      variantBarcode: null,
    });
    const branchSnapshot = ensureBranchSnapshot(row, {
      branchId: inventory.branchId,
      branchName: branchNames.get(inventory.branchId) ?? "Sucursal",
    });

    row.actualStock += actualStock;
    branchSnapshot.actualStock += actualStock;
    branchSnapshot.sellableStock += Math.max(actualStock, 0);
    branchSnapshot.currentPrice =
      priceByBranchProduct.get(buildPriceKey(inventory.branchId, inventory.productId, null)) ?? null;
  }

  for (const inventory of variantStocks) {
    const actualStock = inventory.stock ?? 0;
    if (actualStock === 0) {
      continue;
    }

    const row = ensureRow(rows, {
      productId: inventory.variant.product.id,
      productName: inventory.variant.product.name,
      productImage: inventory.variant.product.image,
      productBarcode: inventory.variant.product.barcode,
      variantId: inventory.variantId,
      variantName: inventory.variant.name,
      variantBarcode: inventory.variant.barcode,
    });
    const branchSnapshot = ensureBranchSnapshot(row, {
      branchId: inventory.branchId,
      branchName: branchNames.get(inventory.branchId) ?? "Sucursal",
    });

    row.actualStock += actualStock;
    branchSnapshot.actualStock += actualStock;
    branchSnapshot.sellableStock += Math.max(actualStock, 0);
    branchSnapshot.currentPrice =
      priceByBranchProduct.get(buildPriceKey(inventory.branchId, inventory.variant.product.id, inventory.variantId)) ??
      priceByBranchProduct.get(buildPriceKey(inventory.branchId, inventory.variant.product.id, null)) ??
      null;
  }

  for (const layer of layers) {
    const row = ensureRow(rows, {
      productId: layer.productId,
      productName: layer.product.name,
      productImage: layer.product.image,
      productBarcode: layer.product.barcode,
      variantId: layer.variantId ?? null,
      variantName: layer.variant?.name ?? null,
      variantBarcode: layer.variant?.barcode ?? null,
    });
    const branchSnapshot = ensureBranchSnapshot(row, {
      branchId: layer.branchId,
      branchName: branchNames.get(layer.branchId) ?? "Sucursal",
    });

    row.valuedUnits += layer.remainingQuantity;
    row.valuedCapital += layer.remainingQuantity * layer.unitCost;
    row.layersCount += 1;
    row.layers.push({
      id: layer.id,
      sourceType: layer.sourceType,
      unitCost: layer.unitCost,
      remainingQuantity: layer.remainingQuantity,
      totalValue: layer.remainingQuantity * layer.unitCost,
      receivedAt: layer.receivedAt,
      branchId: layer.branchId,
      branchName: branchNames.get(layer.branchId) ?? "Sucursal",
    });

    branchSnapshot.valuedUnits += layer.remainingQuantity;
    branchSnapshot.valuedCapital += layer.remainingQuantity * layer.unitCost;
    branchSnapshot.layersCount += 1;
    branchSnapshot.currentPrice =
      priceByBranchProduct.get(buildPriceKey(layer.branchId, layer.productId, layer.variantId ?? null)) ??
      priceByBranchProduct.get(buildPriceKey(layer.branchId, layer.productId, null)) ??
      branchSnapshot.currentPrice;

    if (!row.latestReceivedAt || layer.receivedAt > row.latestReceivedAt) {
      row.latestReceivedAt = layer.receivedAt;
    }
  }

  for (const item of pendingItems) {
    const row = ensureRow(rows, {
      productId: item.productId,
      productName: item.product.name,
      productImage: item.product.image,
      productBarcode: item.product.barcode,
      variantId: item.variantId ?? null,
      variantName: item.variant?.name ?? null,
      variantBarcode: item.variant?.barcode ?? null,
    });
    const branchSnapshot = ensureBranchSnapshot(row, {
      branchId: item.restockEvent.branchId,
      branchName: branchNames.get(item.restockEvent.branchId) ?? "Sucursal",
    });

    row.pendingUnits += item.quantity;
    row.pendingLines += 1;
    branchSnapshot.pendingUnits += item.quantity;
    branchSnapshot.pendingLines += 1;
    branchSnapshot.currentPrice =
      priceByBranchProduct.get(buildPriceKey(item.restockEvent.branchId, item.productId, item.variantId ?? null)) ??
      priceByBranchProduct.get(buildPriceKey(item.restockEvent.branchId, item.productId, null)) ??
      branchSnapshot.currentPrice;
  }

  for (const reservation of negativeReservations) {
    const row = ensureRow(rows, {
      productId: reservation.productId,
      productName: reservation.product.name,
      productImage: reservation.product.image,
      productBarcode: reservation.product.barcode,
      variantId: reservation.variantId ?? null,
      variantName: reservation.variant?.name ?? null,
      variantBarcode: reservation.variant?.barcode ?? null,
    });
    const branchSnapshot = ensureBranchSnapshot(row, {
      branchId: reservation.branchId,
      branchName: branchNames.get(reservation.branchId) ?? "Sucursal",
    });

    row.negativePendingUnits += reservation.quantityPending;
    row.negativeReservations += 1;
    branchSnapshot.negativePendingUnits += reservation.quantityPending;
    branchSnapshot.negativeReservations += 1;
    branchSnapshot.currentPrice =
      priceByBranchProduct.get(buildPriceKey(reservation.branchId, reservation.productId, reservation.variantId ?? null)) ??
      priceByBranchProduct.get(buildPriceKey(reservation.branchId, reservation.productId, null)) ??
      branchSnapshot.currentPrice;
  }

  const products = [...rows.values()]
    .map((row) => {
      const branches = [...row.branches.values()]
        .map((branch) => {
          const uncoveredUnits = Math.max(branch.sellableStock - (branch.valuedUnits + branch.pendingUnits), 0);
          const overtrackedUnits = Math.max((branch.valuedUnits + branch.pendingUnits) - branch.sellableStock, 0);
          const potentialRevenue =
            branch.currentPrice !== null ? roundMoney(branch.sellableStock * branch.currentPrice) : 0;
          const valuedPotentialMargin =
            branch.currentPrice !== null
              ? roundMoney(branch.valuedUnits * branch.currentPrice - branch.valuedCapital)
              : 0;
          const unpricedUnits = branch.currentPrice === null ? branch.sellableStock : 0;

          return {
            branchId: branch.branchId,
            branchName: branch.branchName,
            actualStock: branch.actualStock,
            valuedUnits: branch.valuedUnits,
            valuedCapital: roundMoney(branch.valuedCapital),
            pendingUnits: branch.pendingUnits,
            pendingLines: branch.pendingLines,
            uncoveredUnits,
            overtrackedUnits,
            negativePendingUnits: branch.negativePendingUnits,
            negativeReservations: branch.negativeReservations,
            currentPrice: branch.currentPrice,
            potentialRevenue,
            valuedPotentialMargin,
            unpricedUnits,
            layersCount: branch.layersCount,
          };
        })
        .sort((left, right) => {
          if (right.valuedCapital !== left.valuedCapital) {
            return right.valuedCapital - left.valuedCapital;
          }
          if (right.actualStock !== left.actualStock) {
            return right.actualStock - left.actualStock;
          }
          return left.branchName.localeCompare(right.branchName, "es-AR");
        });

      const pricedValues = [...new Set(branches.flatMap((branch) => (branch.currentPrice !== null ? [branch.currentPrice] : [])))].sort(
        (left, right) => left - right,
      );

      const potentialRevenue = branches.reduce((sum, branch) => sum + branch.potentialRevenue, 0);
      const valuedPotentialMargin = branches.reduce((sum, branch) => sum + branch.valuedPotentialMargin, 0);
      const unpricedUnits = branches.reduce((sum, branch) => sum + branch.unpricedUnits, 0);

      return {
        actualStock: row.actualStock,
        key: row.key,
        productId: row.productId,
        productName: row.productName,
        productImage: row.productImage,
        productBarcode: row.productBarcode,
        variantId: row.variantId,
        variantName: row.variantName,
        variantBarcode: row.variantBarcode,
        displayName: row.variantName ? `${row.productName} · ${row.variantName}` : row.productName,
        valuedUnits: row.valuedUnits,
        valuedCapital: roundMoney(row.valuedCapital),
        weightedAverageCost: row.valuedUnits > 0 ? row.valuedCapital / row.valuedUnits : null,
        potentialRevenue: roundMoney(potentialRevenue),
        valuedPotentialMargin: roundMoney(valuedPotentialMargin),
        priceMin: pricedValues[0] ?? null,
        priceMax: pricedValues.length > 0 ? pricedValues[pricedValues.length - 1] : null,
        pricedBranchCount: pricedValues.length,
        unpricedUnits,
        pendingUnits: row.pendingUnits,
        pendingLines: row.pendingLines,
        uncoveredUnits: Math.max(row.actualStock - (row.valuedUnits + row.pendingUnits), 0),
        overtrackedUnits: Math.max((row.valuedUnits + row.pendingUnits) - row.actualStock, 0),
        negativePendingUnits: row.negativePendingUnits,
        negativeReservations: row.negativeReservations,
        layersCount: row.layersCount,
        latestReceivedAt: row.latestReceivedAt?.toISOString() ?? null,
        branches,
        layers: row.layers
          .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
          .map((layer) => ({
            id: layer.id,
            sourceType: layer.sourceType,
            unitCost: layer.unitCost,
            remainingQuantity: layer.remainingQuantity,
            totalValue: roundMoney(layer.totalValue),
            receivedAt: layer.receivedAt.toISOString(),
            branchId: layer.branchId,
            branchName: layer.branchName,
          })),
      };
    })
    .sort((left, right) => {
      if (right.valuedCapital !== left.valuedCapital) {
        return right.valuedCapital - left.valuedCapital;
      }
      if (right.potentialRevenue !== left.potentialRevenue) {
        return right.potentialRevenue - left.potentialRevenue;
      }
      if (right.uncoveredUnits !== left.uncoveredUnits) {
        return right.uncoveredUnits - left.uncoveredUnits;
      }
      if (right.pendingUnits !== left.pendingUnits) {
        return right.pendingUnits - left.pendingUnits;
      }
      return left.displayName.localeCompare(right.displayName, "es-AR");
    });

  const summary = products.reduce(
    (acc, product) => {
      acc.actualStock += product.actualStock;
      acc.valuedCapital += product.valuedCapital;
      acc.valuedUnits += product.valuedUnits;
      acc.potentialRevenue += product.potentialRevenue;
      acc.valuedPotentialMargin += product.valuedPotentialMargin;
      acc.pendingUnits += product.pendingUnits;
      acc.pendingLines += product.pendingLines;
      acc.uncoveredUnits += product.uncoveredUnits;
      acc.overtrackedUnits += product.overtrackedUnits;
      acc.negativePendingUnits += product.negativePendingUnits;
      acc.negativeReservations += product.negativeReservations;
      acc.unpricedUnits += product.unpricedUnits;
      acc.layersCount += product.layersCount;
      acc.productsCount += 1;
      if (product.pendingUnits > 0) {
        acc.pendingProducts += 1;
      }
      if (product.uncoveredUnits > 0) {
        acc.uncoveredProducts += 1;
      }
      return acc;
    },
    createEmptySummary(),
  );

  summary.branchCount = branches.length;

  return {
    meta: {
      scope: input.scope,
      scopeLabel:
        input.scope === "kiosco"
          ? branches.length === 1
            ? branches[0]?.name ?? "Kiosco"
            : `${branches.length} sucursales`
          : branches[0]?.name ?? "Sucursal",
      branchesInScope: branches,
    },
    summary,
    products,
  };
}

export const getCachedInventoryValuation = unstable_cache(
  async (input: {
    scope: InventoryValuationScope;
    branchId?: string | null;
    kioscoId?: string | null;
  }) => getInventoryValuation(input),
  ["inventory-valuation"],
  {
    revalidate: 60,
  },
);

export async function getBranchInventoryValuation(branchId: string) {
  return getCachedInventoryValuation({ scope: "branch", branchId });
}
