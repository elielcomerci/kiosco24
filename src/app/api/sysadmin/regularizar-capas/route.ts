import { NextResponse } from "next/server";
import { InventoryCostLayerSourceType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId || !kioscoId) {
    return NextResponse.json({ error: "Contexto invalido" }, { status: 400 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { ownerId: true }
  });

  if (kiosco?.ownerId !== session.user.id && session.user.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let createdLayers = 0;

  const baseInventories = await prisma.inventoryRecord.findMany({
    where: { branchId, stock: { gt: 0 } },
    include: {
      product: { select: { id: true, variants: { select: { id: true } } } }
    }
  });

  for (const inv of baseInventories) {
    if (inv.product.variants.length > 0) continue;

    const layers = await prisma.inventoryCostLayer.findMany({
      where: {
        branchId,
        productId: inv.productId,
        variantId: null,
        remainingQuantity: { gt: 0 },
      },
    });

    const coveredUnits = layers.reduce((acc, layer) => acc + layer.remainingQuantity, 0);
    const uncoveredUnits = Math.max((inv.stock ?? 0) - coveredUnits, 0);
    const cost = Number(inv.cost);

    if (uncoveredUnits > 0 && Number.isFinite(cost) && cost > 0) {
      await prisma.inventoryCostLayer.create({
        data: {
          branchId,
          productId: inv.productId,
          variantId: null,
          sourceType: InventoryCostLayerSourceType.LEGACY_SNAPSHOT,
          unitCost: cost,
          initialQuantity: uncoveredUnits,
          remainingQuantity: uncoveredUnits,
          receivedAt: new Date(),
        },
      });
      createdLayers += 1;
    }
  }

  const variantInventories = await prisma.variantInventory.findMany({
    where: { branchId, stock: { gt: 0 } },
    include: { variant: { select: { productId: true } } }
  });

  for (const inv of variantInventories) {
    const layers = await prisma.inventoryCostLayer.findMany({
      where: {
        branchId,
        productId: inv.variant.productId,
        variantId: inv.variantId,
        remainingQuantity: { gt: 0 },
      },
    });

    const coveredUnits = layers.reduce((acc, layer) => acc + layer.remainingQuantity, 0);
    const uncoveredUnits = Math.max((inv.stock ?? 0) - coveredUnits, 0);
    const cost = Number(inv.cost);

    if (uncoveredUnits > 0 && Number.isFinite(cost) && cost > 0) {
      await prisma.inventoryCostLayer.create({
        data: {
          branchId,
          productId: inv.variant.productId,
          variantId: inv.variantId,
          sourceType: InventoryCostLayerSourceType.LEGACY_SNAPSHOT,
          unitCost: cost,
          initialQuantity: uncoveredUnits,
          remainingQuantity: uncoveredUnits,
          receivedAt: new Date(),
        },
      });
      createdLayers += 1;
    }
  }

  return NextResponse.json({ success: true, createdLayers });
}

