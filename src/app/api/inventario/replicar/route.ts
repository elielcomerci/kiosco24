import { NextResponse } from "next/server";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { applyInventoryCorrectionToCostLayers } from "@/lib/inventory-cost-consumption";
import { DEFAULT_PRICING_MODE } from "@/lib/pricing-mode";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
    if (!branchId || !kioscoId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { productIds, targetBranchIds, copyPrice, copyStock, overwriteConfig } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "productIds requeridos" }, { status: 400 });
    }
    if (!Array.isArray(targetBranchIds) || targetBranchIds.length === 0) {
      return NextResponse.json({ error: "targetBranchIds requeridos" }, { status: 400 });
    }

    if (copyStock) {
      const accessResponse = await guardOperationalAccess(session.user);
      if (accessResponse) {
        return accessResponse;
      }

      const trackedLots = await prisma.stockLot.findMany({
        where: {
          branchId,
          productId: { in: productIds },
          quantity: { gt: 0 },
        },
        select: { productId: true },
      });

      if (trackedLots.length > 0) {
        return NextResponse.json(
          { error: "No se puede replicar stock de productos con vencimientos cargados en esta versión." },
          { status: 409 },
        );
      }
    }

    const targetBranches = await prisma.branch.findMany({
      where: { id: { in: targetBranchIds }, kioscoId },
      select: { id: true },
    });

    if (targetBranches.length !== targetBranchIds.length) {
      return NextResponse.json(
        { error: "Una o más sucursales destino no pertenecen a tu kiosco" },
        { status: 403 },
      );
    }

    const kioscoSettings = await prisma.kiosco.findUnique({
      where: { id: kioscoId },
      select: { pricingMode: true },
    });
    const effectiveCopyPrice =
      (kioscoSettings?.pricingMode ?? DEFAULT_PRICING_MODE) === "SHARED" ? true : Boolean(copyPrice);

    const existingRecords = await prisma.inventoryRecord.findMany({
      where: { productId: { in: productIds }, branchId: { in: targetBranchIds } },
      include: {
        product: { select: { name: true, emoji: true } },
        branch: { select: { name: true } },
      },
    });

    const pendingCollisions: {
      productId: string;
      branchId: string;
      productName: string;
      branchName: string;
      emoji: string | null;
    }[] = [];
    const safeOverwriteConfig = overwriteConfig || {};

    for (const record of existingRecords) {
      const key = `${record.productId}:${record.branchId}`;
      if (!safeOverwriteConfig[key]) {
        pendingCollisions.push({
          productId: record.productId,
          branchId: record.branchId,
          productName: record.product.name,
          emoji: record.product.emoji,
          branchName: record.branch.name,
        });
      }
    }

    if (pendingCollisions.length > 0) {
      return NextResponse.json({
        requiresConfirmation: true,
        collisions: pendingCollisions,
      });
    }

    const sourceRecords = await prisma.inventoryRecord.findMany({
      where: { productId: { in: productIds }, branchId },
      select: { productId: true, price: true, cost: true, stock: true },
    });
    const pricingByProduct = new Map(
      sourceRecords.map((record) => [
        record.productId,
        {
          price: record.price,
          cost: record.cost,
          stock: record.stock,
        },
      ]),
    );

    let upsertCount = 0;

    for (const targetBranchId of targetBranchIds) {
      for (const productId of productIds) {
        const key = `${productId}:${targetBranchId}`;
        const existingRecord = existingRecords.find(
          (record) => record.productId === productId && record.branchId === targetBranchId,
        );
        const sourcePricing = pricingByProduct.get(productId);
        const sourcePrice = sourcePricing?.price ?? 0;
        const sourceCost = sourcePricing?.cost ?? null;
        const sourceStock = sourcePricing?.stock ?? 0;

        if (existingRecord) {
          const action = safeOverwriteConfig[key];
          if (action === "skip") {
            continue;
          }
          if (action === "overwrite") {
            const previousStock = existingRecord.stock ?? 0;
            await prisma.inventoryRecord.update({
              where: { id: existingRecord.id },
              data: {
                ...(effectiveCopyPrice && { price: sourcePrice, cost: sourceCost }),
                ...(copyStock && { stock: sourceStock }),
              },
            });
            if (copyStock && sourceStock < previousStock) {
              await prisma.$transaction(async (tx) => {
                await applyInventoryCorrectionToCostLayers(tx, {
                  branchId: targetBranchId,
                  productId,
                  variantId: null,
                  delta: sourceStock - previousStock,
                });
              });
            }
            upsertCount++;
          }
        } else {
          await prisma.inventoryRecord.create({
            data: {
              productId,
              branchId: targetBranchId,
              stock: copyStock ? sourceStock : 0,
              showInGrid: true,
              price: effectiveCopyPrice ? sourcePrice : 0,
              cost: effectiveCopyPrice ? sourceCost : null,
            },
          });
          upsertCount++;
        }
      }
    }

    return NextResponse.json({ success: true, upsertCount });
  } catch (error) {
    console.error("Error replicando catálogo:", error);
    return NextResponse.json({ error: "Error interno al replicar" }, { status: 500 });
  }
}
