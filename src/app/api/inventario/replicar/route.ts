import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
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

    // Solo owners pueden replicar catálogo entre sucursales
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

    // Validar que todas las sucursales destino pertenecen al mismo kiosco
    const targetBranches = await prisma.branch.findMany({
      where: { id: { in: targetBranchIds }, kioscoId },
      select: { id: true },
    });

    if (targetBranches.length !== targetBranchIds.length) {
      return NextResponse.json({ error: "Una o más sucursales destino no pertenecen a tu kiosco" }, { status: 403 });
    }

    // Obtener las colisiones (productos que ya existen en destino)
    const existingRecords = await prisma.inventoryRecord.findMany({
      where: { productId: { in: productIds }, branchId: { in: targetBranchIds } },
      include: {
        product: { select: { name: true, emoji: true } },
        branch: { select: { name: true } },
      },
    });

    const pendingCollisions: { productId: string; branchId: string; productName: string; branchName: string; emoji: string | null }[] = [];
    const safeOverwriteConfig = overwriteConfig || {};

    for (const r of existingRecords) {
      const key = `${r.productId}:${r.branchId}`;
      if (!safeOverwriteConfig[key]) {
        pendingCollisions.push({
          productId: r.productId,
          branchId: r.branchId,
          productName: r.product.name,
          emoji: r.product.emoji,
          branchName: r.branch.name,
        });
      }
    }

    if (pendingCollisions.length > 0) {
      return NextResponse.json({
        requiresConfirmation: true,
        collisions: pendingCollisions,
      });
    }

    // Si llegamos acá, o no había colisiones, o todas están resueltas en overwriteConfig
    // Obtener los productos origen para precio y stock
    const sourceRecords = await prisma.inventoryRecord.findMany({
      where: { productId: { in: productIds }, branchId },
      select: { productId: true, price: true, stock: true },
    });
    const priceByProduct = Object.fromEntries(sourceRecords.map((r) => [r.productId, r.price]));
    const stockByProduct = Object.fromEntries(sourceRecords.map((r) => [r.productId, r.stock]));

    let upsertCount = 0;

    for (const targetBranchId of targetBranchIds) {
      for (const productId of productIds) {
        const key = `${productId}:${targetBranchId}`;
        const existingRecord = existingRecords.find((r) => r.productId === productId && r.branchId === targetBranchId);

        const sourcePrice = priceByProduct[productId] ?? 0;
        const sourceStock = stockByProduct[productId] ?? 0;

        if (existingRecord) {
          const action = safeOverwriteConfig[key];
          if (action === "skip") {
            continue;
          }
          if (action === "overwrite") {
            await prisma.inventoryRecord.update({
              where: { id: existingRecord.id },
              data: {
                ...(copyPrice && { price: sourcePrice }),
                ...(copyStock && { stock: sourceStock }),
              },
            });
            upsertCount++;
          }
        } else {
          // No existe: crear
          await prisma.inventoryRecord.create({
            data: {
              productId,
              branchId: targetBranchId,
              stock: copyStock ? sourceStock : 0,
              showInGrid: true,
              price: copyPrice ? sourcePrice : 0,
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
