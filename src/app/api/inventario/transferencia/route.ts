import { Prisma, RestockEventType, RestockValuationStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { guardSetupAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { moveInventoryCostLayersBetweenBranches } from "@/lib/inventory-cost-consumption";
import { addTrackedLots } from "@/lib/inventory-expiry";
import { prisma } from "@/lib/prisma";
import { isStockTransferStrategy, planStockTransfer, type StockTransferStrategy } from "@/lib/stock-transfer-plan";

type TransferItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

function strategyLabel(strategy: StockTransferStrategy) {
  return strategy === "farthest_first" ? "más lejanas primero" : "más próximas primero";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessResponse = await guardSetupAccess(session.user);
    if (accessResponse) {
      return accessResponse;
    }

    const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
    if (!branchId || !kioscoId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { items, targetBranchId, note, strategy: rawStrategy } = await req.json();

    if (!targetBranchId || typeof targetBranchId !== "string") {
      return NextResponse.json({ error: "targetBranchId requerido" }, { status: 400 });
    }

    if (targetBranchId === branchId) {
      return NextResponse.json({ error: "Elegí una sucursal destino distinta del origen." }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items requeridos" }, { status: 400 });
    }

    const strategy: StockTransferStrategy = isStockTransferStrategy(rawStrategy)
      ? rawStrategy
      : "nearest_first";

    const targetBranch = await prisma.branch.findFirst({
      where: { id: targetBranchId, kioscoId },
      select: { id: true },
    });

    if (!targetBranch) {
      return NextResponse.json({ error: "Sucursal destino inválida" }, { status: 403 });
    }

    const validatedItems: TransferItem[] = [];
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!item?.productId || !Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "Cada item debe tener productId y quantity entero positivo" },
          { status: 400 },
        );
      }

      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { variants: { select: { id: true } } },
      });
      const hasVariants = (product?.variants?.length ?? 0) > 0;

      if (hasVariants && !item.variantId) {
        return NextResponse.json(
          { error: `Especificá la variante a transferir para el producto ${item.productId}` },
          { status: 400 },
        );
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || undefined,
        quantity,
      });
    }

    await prisma.$transaction(
      async (tx) => {
        const transferNotes: string[] = [];

        for (const item of validatedItems) {
          if (item.variantId) {
            const originRecord = await tx.variantInventory.findUnique({
              where: { variantId_branchId: { variantId: item.variantId, branchId } },
              select: {
                stock: true,
                minStock: true,
                price: true,
                cost: true,
              },
            });

            const variant = await tx.variant.findUnique({
              where: { id: item.variantId },
              select: {
                id: true,
                name: true,
                productId: true,
                product: { select: { name: true } },
              },
            });

            if (!variant) {
              throw new Error("La variante seleccionada ya no existe.");
            }

            const currentStock = originRecord?.stock ?? 0;
            const lots = await tx.stockLot.findMany({
              where: {
                branchId,
                productId: variant.productId,
                variantId: item.variantId,
                quantity: { gt: 0 },
              },
              select: {
                id: true,
                quantity: true,
                expiresOn: true,
              },
            });

            const plan = planStockTransfer({
              totalStock: currentStock,
              requestedQuantity: item.quantity,
              lots,
              strategy,
            });

            if (plan.fulfilledQuantity < item.quantity) {
              throw new Error(
                `Stock transferible insuficiente para ${variant.product.name} - ${variant.name} (máximo ${plan.transferableQuantity}).`,
              );
            }

            await tx.variantInventory.update({
              where: { variantId_branchId: { variantId: item.variantId, branchId } },
              data: { stock: { decrement: item.quantity } },
            });

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
                data: {
                  variantId: item.variantId,
                  branchId: targetBranchId,
                  stock: item.quantity,
                  minStock: originRecord?.minStock ?? 0,
                  price: originRecord?.price ?? null,
                  cost: originRecord?.cost ?? null,
                },
              });
            }

            await moveInventoryCostLayersBetweenBranches(tx, {
              sourceBranchId: branchId,
              targetBranchId: targetBranchId,
              productId: variant.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            });

            const movedLotIds: string[] = [];
            for (const lot of plan.lotsToTransfer) {
              if (!lot.id) {
                continue;
              }

              const updated = await tx.stockLot.updateMany({
                where: {
                  id: lot.id,
                  quantity: { gte: lot.quantity },
                },
                data: {
                  quantity: { decrement: lot.quantity },
                },
              });

              if (updated.count !== 1) {
                throw new Error("El stock con vencimiento cambió mientras registrabas la transferencia.");
              }

              movedLotIds.push(lot.id);
            }

            if (plan.lotsToTransfer.length > 0) {
              await addTrackedLots(
                tx,
                {
                  branchId: targetBranchId,
                  productId: variant.productId,
                  variantId: item.variantId,
                },
                plan.lotsToTransfer.map((lot) => ({
                  quantity: lot.quantity,
                  expiresOn: new Date(`${lot.expiresOn}T00:00:00`),
                })),
              );
            }

            if (movedLotIds.length > 0) {
              await tx.stockLot.deleteMany({
                where: {
                  id: { in: movedLotIds },
                  quantity: { lte: 0 },
                },
              });
            }

            if (plan.lotsToTransfer.length > 0 || plan.untrackedQuantity > 0 || plan.expiredQuantity > 0) {
              const lotSummary = plan.lotsToTransfer
                .map((lot) => `${lot.quantity}u ${lot.expiresOn}`)
                .join(", ");
              transferNotes.push(
                `${variant.product.name} - ${variant.name}: ${strategyLabel(strategy)}${lotSummary ? ` | lotes: ${lotSummary}` : ""}${plan.untrackedQuantity > 0 ? ` | sin fecha: ${plan.untrackedQuantity}u` : ""}${plan.expiredQuantity > 0 ? ` | vencido excluido: ${plan.expiredQuantity}u` : ""}`,
              );
            }
          } else {
            const originRecord = await tx.inventoryRecord.findUnique({
              where: { productId_branchId: { productId: item.productId, branchId } },
              select: {
                stock: true,
                price: true,
                cost: true,
                showInGrid: true,
                product: { select: { name: true } },
              },
            });

            const currentStock = originRecord?.stock ?? 0;
            const lots = await tx.stockLot.findMany({
              where: {
                branchId,
                productId: item.productId,
                variantId: null,
                quantity: { gt: 0 },
              },
              select: {
                id: true,
                quantity: true,
                expiresOn: true,
              },
            });

            const plan = planStockTransfer({
              totalStock: currentStock,
              requestedQuantity: item.quantity,
              lots,
              strategy,
            });

            if (plan.fulfilledQuantity < item.quantity) {
              throw new Error(
                `Stock transferible insuficiente para ${originRecord?.product.name ?? "el producto"} (máximo ${plan.transferableQuantity}).`,
              );
            }

            await tx.inventoryRecord.update({
              where: { productId_branchId: { productId: item.productId, branchId } },
              data: { stock: { decrement: item.quantity } },
            });

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
                  showInGrid: originRecord?.showInGrid ?? true,
                  price: originRecord?.price ?? 0,
                  cost: originRecord?.cost ?? null,
                },
              });
            }

            await moveInventoryCostLayersBetweenBranches(tx, {
              sourceBranchId: branchId,
              targetBranchId: targetBranchId,
              productId: item.productId,
              variantId: null,
              quantity: item.quantity,
            });

            const movedLotIds: string[] = [];
            for (const lot of plan.lotsToTransfer) {
              if (!lot.id) {
                continue;
              }

              const updated = await tx.stockLot.updateMany({
                where: {
                  id: lot.id,
                  quantity: { gte: lot.quantity },
                },
                data: {
                  quantity: { decrement: lot.quantity },
                },
              });

              if (updated.count !== 1) {
                throw new Error("El stock con vencimiento cambió mientras registrabas la transferencia.");
              }

              movedLotIds.push(lot.id);
            }

            if (plan.lotsToTransfer.length > 0) {
              await addTrackedLots(
                tx,
                {
                  branchId: targetBranchId,
                  productId: item.productId,
                  variantId: null,
                },
                plan.lotsToTransfer.map((lot) => ({
                  quantity: lot.quantity,
                  expiresOn: new Date(`${lot.expiresOn}T00:00:00`),
                })),
              );
            }

            if (movedLotIds.length > 0) {
              await tx.stockLot.deleteMany({
                where: {
                  id: { in: movedLotIds },
                  quantity: { lte: 0 },
                },
              });
            }

            if (plan.lotsToTransfer.length > 0 || plan.untrackedQuantity > 0 || plan.expiredQuantity > 0) {
              const lotSummary = plan.lotsToTransfer
                .map((lot) => `${lot.quantity}u ${lot.expiresOn}`)
                .join(", ");
              transferNotes.push(
                `${originRecord?.product.name ?? item.productId}: ${strategyLabel(strategy)}${lotSummary ? ` | lotes: ${lotSummary}` : ""}${plan.untrackedQuantity > 0 ? ` | sin fecha: ${plan.untrackedQuantity}u` : ""}${plan.expiredQuantity > 0 ? ` | vencido excluido: ${plan.expiredQuantity}u` : ""}`,
              );
            }
          }
        }

        if ((note && typeof note === "string") || transferNotes.length > 0) {
          await tx.restockEvent.create({
            data: {
              branchId,
              type: RestockEventType.TRANSFER,
              valuationStatus: RestockValuationStatus.NOT_APPLICABLE,
              note: `[Transferencia → ${targetBranchId}] ${[
                note && typeof note === "string" ? note : null,
                transferNotes.length > 0 ? transferNotes.join(" · ") : null,
              ]
                .filter(Boolean)
                .join(" | ")}`,
              items: {
                create: validatedItems.map((item) => ({
                  productId: item.productId,
                  variantId: item.variantId ?? null,
                  quantity: -item.quantity,
                })),
              },
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en transferencia:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    const isStockError = message.toLowerCase().includes("stock");
    return NextResponse.json({ error: message }, { status: isStockError ? 409 : 500 });
  }
}
