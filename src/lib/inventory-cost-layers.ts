import { InventoryCostLayerSourceType, Prisma, PrismaClient } from "@prisma/client";

import { syncRestockLayerWithAllocations } from "@/lib/inventory-cost-consumption";

type InventoryCostLayerTx = Prisma.TransactionClient;
type InventoryCostLayerClient = Prisma.TransactionClient | PrismaClient;

type SyncRestockItemCostLayerInput = {
  branchId: string;
  productId: string;
  variantId?: string | null;
  restockItemId: string;
  quantity: number;
  unitCost: number | null;
  receivedAt: Date;
  sourceType?: InventoryCostLayerSourceType;
};

export async function syncRestockItemCostLayer(
  tx: InventoryCostLayerTx,
  input: SyncRestockItemCostLayerInput,
) {
  return syncRestockLayerWithAllocations(tx, input);
}

type ManualInventoryValuationContextInput = {
  branchId: string;
  productId: string;
  variantId?: string | null;
};

export async function getManualInventoryValuationContext(
  client: InventoryCostLayerClient,
  input: ManualInventoryValuationContextInput,
) {
  const { branchId, productId, variantId } = input;

  const [inventoryRecord, variantInventory, layers] = await Promise.all([
    variantId
      ? Promise.resolve(null)
      : client.inventoryRecord.findUnique({
          where: {
            productId_branchId: {
              productId,
              branchId,
            },
          },
          select: {
            stock: true,
          },
        }),
    variantId
      ? client.variantInventory.findUnique({
          where: {
            variantId_branchId: {
              variantId,
              branchId,
            },
          },
          select: {
            stock: true,
          },
        })
      : Promise.resolve(null),
    client.inventoryCostLayer.findMany({
      where: {
        branchId,
        productId,
        variantId: variantId ?? null,
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        sourceType: true,
        unitCost: true,
        remainingQuantity: true,
        receivedAt: true,
        saleCostAllocations: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    }),
  ]);

  const currentStock = variantId ? variantInventory?.stock ?? 0 : inventoryRecord?.stock ?? 0;
  const automaticLayers = layers.filter((layer) => layer.sourceType !== InventoryCostLayerSourceType.MANUAL_VALUATION);
  const manualLayers = layers.filter((layer) => layer.sourceType === InventoryCostLayerSourceType.MANUAL_VALUATION);
  const lockedManualLayers = manualLayers.filter((layer) => layer.saleCostAllocations.length > 0);
  const editableManualLayers = manualLayers.filter((layer) => layer.saleCostAllocations.length === 0);
  const automaticValuedUnits = automaticLayers.reduce((sum, layer) => sum + layer.remainingQuantity, 0);
  const manualValuedUnits = manualLayers.reduce((sum, layer) => sum + layer.remainingQuantity, 0);
  const lockedManualValuedUnits = lockedManualLayers.reduce((sum, layer) => sum + layer.remainingQuantity, 0);
  const recommendedManualCapacity = Math.max(currentStock - automaticValuedUnits - lockedManualValuedUnits, 0);
  const editableManualLimit = recommendedManualCapacity;

  return {
    currentStock,
    automaticValuedUnits,
    manualValuedUnits,
    lockedManualValuedUnits,
    recommendedManualCapacity,
    editableManualLimit,
    manualLayers: editableManualLayers.map((layer) => ({
      id: layer.id,
      unitCost: layer.unitCost,
      quantity: layer.remainingQuantity,
      receivedAt: layer.receivedAt,
    })),
    lockedManualLayers: lockedManualLayers.map((layer) => ({
      id: layer.id,
      unitCost: layer.unitCost,
      quantity: layer.remainingQuantity,
      receivedAt: layer.receivedAt,
    })),
  };
}

type ReplaceManualInventoryCostLayersInput = {
  branchId: string;
  productId: string;
  variantId?: string | null;
  layers: Array<{
    quantity: number;
    unitCost: number;
  }>;
  receivedAt?: Date;
};

export async function replaceManualInventoryCostLayers(
  tx: InventoryCostLayerTx,
  input: ReplaceManualInventoryCostLayersInput,
) {
  const { branchId, productId, variantId, layers, receivedAt = new Date() } = input;

  const existingManualLayers = await tx.inventoryCostLayer.findMany({
    where: {
      branchId,
      productId,
      variantId: variantId ?? null,
      sourceType: InventoryCostLayerSourceType.MANUAL_VALUATION,
    },
    select: {
      id: true,
      saleCostAllocations: {
        select: { id: true },
        take: 1,
      },
    },
  });

  const editableLayerIds = existingManualLayers
    .filter((layer) => layer.saleCostAllocations.length === 0)
    .map((layer) => layer.id);

  if (editableLayerIds.length > 0) {
    await tx.inventoryCostLayer.deleteMany({
      where: {
        id: { in: editableLayerIds },
      },
    });
  }

  if (layers.length === 0) {
    return [];
  }

  const createdLayers = [];
  for (const layer of layers) {
    const created = await tx.inventoryCostLayer.create({
      data: {
        branchId,
        productId,
        variantId: variantId ?? null,
        sourceType: InventoryCostLayerSourceType.MANUAL_VALUATION,
        unitCost: layer.unitCost,
        initialQuantity: layer.quantity,
        remainingQuantity: layer.quantity,
        receivedAt,
      },
    });
    createdLayers.push(created);
  }

  return createdLayers;
}
