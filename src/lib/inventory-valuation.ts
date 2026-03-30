import { RestockEventType, RestockValuationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ValuationRow = {
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
  layers: Array<{
    id: string;
    sourceType: string;
    unitCost: number;
    remainingQuantity: number;
    totalValue: number;
    receivedAt: Date;
  }>;
};

function buildRowKey(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? "base"}`;
}

function ensureRow(
  rows: Map<string, ValuationRow>,
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

  const created: ValuationRow = {
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
  };
  rows.set(key, created);
  return created;
}

export async function getBranchInventoryValuation(branchId: string) {
  const [layers, pendingItems, negativeReservations, baseStocks, variantStocks] = await Promise.all([
    prisma.inventoryCostLayer.findMany({
      where: {
        branchId,
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
          branchId,
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
      },
    }),
    prisma.negativeStockReservation.findMany({
      where: {
        branchId,
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
    prisma.inventoryRecord.findMany({
      where: {
        branchId,
        stock: { gt: 0 },
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
        branchId,
        stock: { gt: 0 },
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
  ]);

  const rows = new Map<string, ValuationRow>();

  for (const inventory of baseStocks) {
    const row = ensureRow(rows, {
      productId: inventory.productId,
      productName: inventory.product.name,
      productImage: inventory.product.image,
      productBarcode: inventory.product.barcode,
      variantId: null,
      variantName: null,
      variantBarcode: null,
    });

    row.actualStock = inventory.stock ?? 0;
  }

  for (const inventory of variantStocks) {
    const row = ensureRow(rows, {
      productId: inventory.variant.product.id,
      productName: inventory.variant.product.name,
      productImage: inventory.variant.product.image,
      productBarcode: inventory.variant.product.barcode,
      variantId: inventory.variantId,
      variantName: inventory.variant.name,
      variantBarcode: inventory.variant.barcode,
    });

    row.actualStock = inventory.stock ?? 0;
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
    });
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

    row.pendingUnits += item.quantity;
    row.pendingLines += 1;
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

    row.negativePendingUnits += reservation.quantityPending;
    row.negativeReservations += 1;
  }

  const products = [...rows.values()]
    .map((row) => ({
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
      valuedCapital: Math.round(row.valuedCapital),
      weightedAverageCost:
        row.valuedUnits > 0 ? row.valuedCapital / row.valuedUnits : null,
      pendingUnits: row.pendingUnits,
      pendingLines: row.pendingLines,
      uncoveredUnits: Math.max(row.actualStock - (row.valuedUnits + row.pendingUnits), 0),
      overtrackedUnits: Math.max((row.valuedUnits + row.pendingUnits) - row.actualStock, 0),
      negativePendingUnits: row.negativePendingUnits,
      negativeReservations: row.negativeReservations,
      layersCount: row.layersCount,
      latestReceivedAt: row.latestReceivedAt?.toISOString() ?? null,
      layers: row.layers
        .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
        .map((layer) => ({
          id: layer.id,
          sourceType: layer.sourceType,
          unitCost: layer.unitCost,
          remainingQuantity: layer.remainingQuantity,
          totalValue: Math.round(layer.totalValue),
          receivedAt: layer.receivedAt.toISOString(),
        })),
    }))
    .sort((left, right) => {
      if (right.valuedCapital !== left.valuedCapital) {
        return right.valuedCapital - left.valuedCapital;
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
      acc.pendingUnits += product.pendingUnits;
      acc.pendingLines += product.pendingLines;
      acc.uncoveredUnits += product.uncoveredUnits;
      acc.overtrackedUnits += product.overtrackedUnits;
      acc.negativePendingUnits += product.negativePendingUnits;
      acc.negativeReservations += product.negativeReservations;
      acc.layersCount += product.layersCount;
      if (product.pendingUnits > 0) {
        acc.pendingProducts += 1;
      }
      if (product.uncoveredUnits > 0) {
        acc.uncoveredProducts += 1;
      }
      return acc;
    },
    {
      actualStock: 0,
      valuedCapital: 0,
      valuedUnits: 0,
      pendingUnits: 0,
      pendingLines: 0,
      uncoveredUnits: 0,
      overtrackedUnits: 0,
      negativePendingUnits: 0,
      negativeReservations: 0,
      pendingProducts: 0,
      uncoveredProducts: 0,
      layersCount: 0,
    },
  );

  return {
    summary,
    products,
  };
}
