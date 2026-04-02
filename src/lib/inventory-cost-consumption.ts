import { InventoryCostLayerSourceType, Prisma, type PrismaClient } from "@prisma/client";

type CostTx = Prisma.TransactionClient;
type CostClient = Prisma.TransactionClient | PrismaClient;

const GRAMS_PER_KILO = 1000;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getAllocationTotalCost(quantity: number, unitCost: number, soldByWeight: boolean) {
  const effectiveQuantity = soldByWeight ? quantity / GRAMS_PER_KILO : quantity;
  return roundMoney(effectiveQuantity * unitCost);
}

type SaleAllocationInput = {
  saleItemId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  soldByWeight?: boolean;
};

async function syncLayerAllocationCosts(tx: CostTx, layerId: string, unitCost: number) {
  const allocations = await tx.saleCostAllocation.findMany({
    where: { inventoryCostLayerId: layerId },
    select: {
      id: true,
      quantity: true,
      saleItem: {
        select: {
          soldByWeight: true,
        },
      },
    },
  });

  for (const allocation of allocations) {
    await tx.saleCostAllocation.update({
      where: { id: allocation.id },
      data: {
        unitCost,
        totalCost: getAllocationTotalCost(allocation.quantity, unitCost, Boolean(allocation.saleItem?.soldByWeight)),
      },
    });
  }
}

export async function resolveNegativeReservationsWithLayer(tx: CostTx, layerId: string) {
  const layer = await tx.inventoryCostLayer.findUnique({
    where: { id: layerId },
    select: {
      id: true,
      branchId: true,
      productId: true,
      variantId: true,
      remainingQuantity: true,
      unitCost: true,
    },
  });

  if (!layer || layer.remainingQuantity <= 0) {
    return;
  }

  const reservations = await tx.negativeStockReservation.findMany({
    where: {
      branchId: layer.branchId,
      productId: layer.productId,
      variantId: layer.variantId ?? null,
      quantityPending: { gt: 0 },
      resolvedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      saleItemId: true,
      quantityPending: true,
      saleItem: {
        select: {
          soldByWeight: true,
        },
      },
    },
  });

  let available = layer.remainingQuantity;

  for (const reservation of reservations) {
    if (available <= 0) {
      break;
    }

    const allocatedQuantity = Math.min(available, reservation.quantityPending);
    if (allocatedQuantity <= 0) {
      continue;
    }

    await tx.saleCostAllocation.create({
      data: {
        saleItemId: reservation.saleItemId,
        inventoryCostLayerId: layer.id,
        branchId: layer.branchId,
        productId: layer.productId,
        variantId: layer.variantId,
        quantity: allocatedQuantity,
        unitCost: layer.unitCost,
        totalCost: getAllocationTotalCost(allocatedQuantity, layer.unitCost, Boolean(reservation.saleItem?.soldByWeight)),
      },
    });

    const nextPending = reservation.quantityPending - allocatedQuantity;
    await tx.negativeStockReservation.update({
      where: { id: reservation.id },
      data: {
        quantityPending: nextPending,
        resolvedAt: nextPending === 0 ? new Date() : null,
      },
    });

    available -= allocatedQuantity;
  }

  if (available !== layer.remainingQuantity) {
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: {
        remainingQuantity: available,
      },
    });
  }
}

export async function allocateSaleItemCosts(
  tx: CostTx,
  input: SaleAllocationInput,
) {
  const { saleItemId, branchId, productId, variantId, quantity, soldByWeight = false } = input;

  if (quantity <= 0) {
    return {
      allocatedQuantity: 0,
      reservedQuantity: 0,
    };
  }

  let remaining = quantity;

  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      branchId,
      productId,
      variantId: variantId ?? null,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      remainingQuantity: true,
      unitCost: true,
    },
  });

  let allocatedQuantity = 0;

  for (const layer of layers) {
    if (remaining <= 0) {
      break;
    }

    const quantityToAllocate = Math.min(layer.remainingQuantity, remaining);
    if (quantityToAllocate <= 0) {
      continue;
    }

    const updated = await tx.inventoryCostLayer.updateMany({
      where: {
        id: layer.id,
        remainingQuantity: { gte: quantityToAllocate },
      },
      data: {
        remainingQuantity: { decrement: quantityToAllocate },
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    await tx.saleCostAllocation.create({
      data: {
        saleItemId,
        inventoryCostLayerId: layer.id,
        branchId,
        productId,
        variantId: variantId ?? null,
        quantity: quantityToAllocate,
        unitCost: layer.unitCost,
        totalCost: getAllocationTotalCost(quantityToAllocate, layer.unitCost, soldByWeight),
      },
    });

    allocatedQuantity += quantityToAllocate;
    remaining -= quantityToAllocate;
  }

  if (remaining > 0) {
    await tx.negativeStockReservation.create({
      data: {
        saleItemId,
        branchId,
        productId,
        variantId: variantId ?? null,
        originalQuantity: remaining,
        quantityPending: remaining,
      },
    });
  }

  return {
    allocatedQuantity,
    reservedQuantity: remaining,
  };
}

export async function restoreSaleItemCostTracking(tx: CostTx, saleItemId: string) {
  const allocations = await tx.saleCostAllocation.findMany({
    where: { saleItemId },
    select: {
      id: true,
      inventoryCostLayerId: true,
      quantity: true,
    },
  });

  for (const allocation of allocations) {
    await tx.inventoryCostLayer.updateMany({
      where: {
        id: allocation.inventoryCostLayerId,
      },
      data: {
        remainingQuantity: { increment: allocation.quantity },
      },
    });
  }

  await tx.saleCostAllocation.deleteMany({
    where: { saleItemId },
  });

  await tx.negativeStockReservation.deleteMany({
    where: { saleItemId },
  });
}

type RestockLayerSyncInput = {
  branchId: string;
  productId: string;
  variantId?: string | null;
  restockItemId: string;
  quantity: number;
  unitCost: number | null;
  receivedAt: Date;
  sourceType?: InventoryCostLayerSourceType;
};

export async function syncRestockLayerWithAllocations(
  tx: CostTx,
  input: RestockLayerSyncInput,
) {
  const {
    branchId,
    productId,
    variantId,
    restockItemId,
    quantity,
    unitCost,
    receivedAt,
    sourceType = InventoryCostLayerSourceType.RECEIVE,
  } = input;

  const existingLayer = await tx.inventoryCostLayer.findUnique({
    where: { restockItemId },
    select: {
      id: true,
      unitCost: true,
      initialQuantity: true,
      remainingQuantity: true,
    },
  });

  if (quantity <= 0 || unitCost === null) {
    if (!existingLayer) {
      return null;
    }

    return tx.inventoryCostLayer.update({
      where: { id: existingLayer.id },
      data: {
        branchId,
        productId,
        variantId: variantId ?? null,
        sourceType,
        unitCost: existingLayer.unitCost,
        initialQuantity: existingLayer.initialQuantity,
        remainingQuantity: 0,
        receivedAt,
      },
    });
  }

  const consumedQuantity = existingLayer
    ? Math.max(existingLayer.initialQuantity - existingLayer.remainingQuantity, 0)
    : 0;
  const nextRemainingQuantity = Math.max(quantity - consumedQuantity, 0);

  const layer = existingLayer
    ? await tx.inventoryCostLayer.update({
        where: { id: existingLayer.id },
        data: {
          branchId,
          productId,
          variantId: variantId ?? null,
          sourceType,
          unitCost,
          initialQuantity: quantity,
          remainingQuantity: nextRemainingQuantity,
          receivedAt,
        },
      })
    : await tx.inventoryCostLayer.create({
        data: {
          branchId,
          productId,
          variantId: variantId ?? null,
          restockItemId,
          sourceType,
          unitCost,
          initialQuantity: quantity,
          remainingQuantity: quantity,
          receivedAt,
        },
      });

  if (!existingLayer || existingLayer.unitCost !== unitCost) {
    await syncLayerAllocationCosts(tx, layer.id, unitCost);
  }

  await resolveNegativeReservationsWithLayer(tx, layer.id);
  return layer;
}

export async function getNegativeStockReservationsSummary(client: CostClient, branchId: string) {
  const reservations = await client.negativeStockReservation.findMany({
    where: {
      branchId,
      quantityPending: { gt: 0 },
      resolvedAt: null,
    },
    select: {
      productId: true,
      variantId: true,
      quantityPending: true,
    },
  });

  return reservations.reduce(
    (acc, reservation) => {
      acc.totalPendingUnits += reservation.quantityPending;
      acc.totalReservations += 1;
      acc.keys.add(`${reservation.productId}:${reservation.variantId ?? "base"}`);
      return acc;
    },
    {
      totalPendingUnits: 0,
      totalReservations: 0,
      keys: new Set<string>(),
    },
  );
}

type MoveInventoryCostLayersInput = {
  sourceBranchId: string;
  targetBranchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
};

type InventoryCorrectionInput = {
  branchId: string;
  productId: string;
  variantId?: string | null;
  delta: number;
};

export async function moveInventoryCostLayersBetweenBranches(
  tx: CostTx,
  input: MoveInventoryCostLayersInput,
) {
  const { sourceBranchId, targetBranchId, productId, variantId, quantity } = input;

  if (quantity <= 0) {
    return { movedQuantity: 0 };
  }

  const sourceLayers = await tx.inventoryCostLayer.findMany({
    where: {
      branchId: sourceBranchId,
      productId,
      variantId: variantId ?? null,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      sourceType: true,
      unitCost: true,
      remainingQuantity: true,
      receivedAt: true,
    },
  });

  let remaining = quantity;
  let movedQuantity = 0;

  for (const layer of sourceLayers) {
    if (remaining <= 0) {
      break;
    }

    const quantityToMove = Math.min(layer.remainingQuantity, remaining);
    if (quantityToMove <= 0) {
      continue;
    }

    const updated = await tx.inventoryCostLayer.updateMany({
      where: {
        id: layer.id,
        remainingQuantity: { gte: quantityToMove },
      },
      data: {
        remainingQuantity: { decrement: quantityToMove },
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    const targetLayer = await tx.inventoryCostLayer.create({
      data: {
        branchId: targetBranchId,
        productId,
        variantId: variantId ?? null,
        sourceType: layer.sourceType,
        unitCost: layer.unitCost,
        initialQuantity: quantityToMove,
        remainingQuantity: quantityToMove,
        receivedAt: layer.receivedAt,
      },
    });

    await resolveNegativeReservationsWithLayer(tx, targetLayer.id);

    movedQuantity += quantityToMove;
    remaining -= quantityToMove;
  }

  return { movedQuantity };
}

export async function applyInventoryCorrectionToCostLayers(
  tx: CostTx,
  input: InventoryCorrectionInput,
) {
  const { branchId, productId, variantId, delta } = input;

  if (delta >= 0) {
    return { trimmedQuantity: 0 };
  }

  let remainingToTrim = Math.abs(delta);
  let trimmedQuantity = 0;

  // A manual downward correction usually represents stock that is currently missing.
  // We trim the newest remaining layers first so FIFO history from older purchases stays stable.
  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      branchId,
      productId,
      variantId: variantId ?? null,
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      remainingQuantity: true,
    },
  });

  for (const layer of layers) {
    if (remainingToTrim <= 0) {
      break;
    }

    const quantityToTrim = Math.min(layer.remainingQuantity, remainingToTrim);
    if (quantityToTrim <= 0) {
      continue;
    }

    const updated = await tx.inventoryCostLayer.updateMany({
      where: {
        id: layer.id,
        remainingQuantity: { gte: quantityToTrim },
      },
      data: {
        remainingQuantity: { decrement: quantityToTrim },
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    trimmedQuantity += quantityToTrim;
    remainingToTrim -= quantityToTrim;
  }

  return { trimmedQuantity };
}
