import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type TransferItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

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

    // Solo owners pueden transferir stock entre sucursales
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { items, targetBranchId, note } = await req.json();

    if (!targetBranchId || typeof targetBranchId !== "string") {
      return NextResponse.json({ error: "targetBranchId requerido" }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items requeridos" }, { status: 400 });
    }

    // Validar que la sucursal destino pertenece al mismo kiosco
    const targetBranch = await prisma.branch.findFirst({
      where: { id: targetBranchId, kioscoId },
      select: { id: true },
    });

    if (!targetBranch) {
      return NextResponse.json({ error: "Sucursal destino inválida" }, { status: 403 });
    }

    // Validar items: quantity positiva; variantes sin variantId → rechazar
    const validatedItems: TransferItem[] = [];
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!item?.productId || !Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Cada item debe tener productId y quantity entero positivo" }, { status: 400 });
      }

      // Verificar si el producto tiene variantes
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { variants: { select: { id: true } } },
      });
      const hasVariants = (product?.variants?.length ?? 0) > 0;

      if (hasVariants && !item.variantId) {
        return NextResponse.json(
          { error: `Especificá la variante a transferir para el producto ${item.productId}` },
          { status: 400 }
        );
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || undefined,
        quantity,
      });
    }

    // Ejecutar transferencia atómica con Serializable para evitar race conditions
    await prisma.$transaction(
      async (tx) => {
        for (const item of validatedItems) {
          if (item.variantId) {
            // ── Transferir variante ──────────────────────────────────────
            const originRecord = await tx.variantInventory.findUnique({
              where: { variantId_branchId: { variantId: item.variantId, branchId } },
              select: { id: true, stock: true },
            });

            const currentStock = originRecord?.stock ?? 0;
            if (currentStock < item.quantity) {
              throw new Error(`Stock insuficiente (disponible: ${currentStock})`);
            }

            // Decrementar origen
            await tx.variantInventory.update({
              where: { variantId_branchId: { variantId: item.variantId, branchId } },
              data: { stock: { decrement: item.quantity } },
            });

            // Upsert destino
            const destRecord = await tx.variantInventory.findUnique({
              where: { variantId_branchId: { variantId: item.variantId, branchId: targetBranchId } },
              select: { id: true },
            });
            if (destRecord) {
              await tx.variantInventory.update({
                where: { variantId_branchId: { variantId: item.variantId, branchId: targetBranchId } },
                data: { stock: { increment: item.quantity } },
              });
            } else {
              await tx.variantInventory.create({
                data: { variantId: item.variantId, branchId: targetBranchId, stock: item.quantity },
              });
            }
          } else {
            // ── Transferir producto simple ───────────────────────────────
            const originRecord = await tx.inventoryRecord.findUnique({
              where: { productId_branchId: { productId: item.productId, branchId } },
              select: { id: true, stock: true, price: true },
            });

            const currentStock = originRecord?.stock ?? 0;
            if (currentStock < item.quantity) {
              throw new Error(`Stock insuficiente (disponible: ${currentStock})`);
            }

            // Decrementar origen
            await tx.inventoryRecord.update({
              where: { productId_branchId: { productId: item.productId, branchId } },
              data: { stock: { decrement: item.quantity } },
            });

            // Upsert destino
            const destRecord = await tx.inventoryRecord.findUnique({
              where: { productId_branchId: { productId: item.productId, branchId: targetBranchId } },
              select: { id: true },
            });
            if (destRecord) {
              await tx.inventoryRecord.update({
                where: { productId_branchId: { productId: item.productId, branchId: targetBranchId } },
                data: { stock: { increment: item.quantity } },
              });
            } else {
              await tx.inventoryRecord.create({
                data: {
                  productId: item.productId,
                  branchId: targetBranchId,
                  stock: item.quantity,
                  showInGrid: true,
                  price: originRecord?.price ?? 0,
                },
              });
            }
          }
        }

        // Registrar el evento de movimiento (nota opcional)
        if (note && typeof note === "string") {
          await tx.restockEvent.create({
            data: {
              branchId,
              note: `[Transferencia → ${targetBranchId}] ${note}`,
              items: {
                create: validatedItems.map((i) => ({
                  productId: i.productId,
                  variantId: i.variantId ?? null,
                  quantity: -i.quantity, // negativo = salida
                })),
              },
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en transferencia:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    const isStockError = message.startsWith("Stock insuficiente");
    return NextResponse.json({ error: message }, { status: isStockError ? 409 : 500 });
  }
}
