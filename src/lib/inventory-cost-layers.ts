import { InventoryCostLayerSourceType, Prisma } from "@prisma/client";

type InventoryCostLayerTx = Prisma.TransactionClient;

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

// Release 2: these layers only track incoming stock value. We keep remainingQuantity
// equal to the incoming quantity until sales/negative allocations are introduced.
export async function syncRestockItemCostLayer(
  tx: InventoryCostLayerTx,
  input: SyncRestockItemCostLayerInput,
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

  if (quantity <= 0 || unitCost === null) {
    await tx.inventoryCostLayer.deleteMany({
      where: { restockItemId },
    });
    return null;
  }

  return tx.inventoryCostLayer.upsert({
    where: { restockItemId },
    create: {
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
    update: {
      branchId,
      productId,
      variantId: variantId ?? null,
      sourceType,
      unitCost,
      initialQuantity: quantity,
      remainingQuantity: quantity,
      receivedAt,
    },
  });
}
