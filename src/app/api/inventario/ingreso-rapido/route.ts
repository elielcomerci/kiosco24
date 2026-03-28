import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  addTrackedLots,
  normalizeLotInputs,
  replaceTrackedLots,
  type NormalizedLotInput,
} from "@/lib/inventory-expiry";
import { prisma } from "@/lib/prisma";

type StockAdjustmentItem = {
  productId: string;
  variantId?: string;
  quantityWithoutExpiry: number;
  lots: NormalizedLotInput[];
  totalQuantity: number;
};

function toInt(value: unknown) {
  return typeof value === "number"
    ? Math.trunc(value)
    : Number.isFinite(Number(value))
      ? Math.trunc(Number(value))
      : 0;
}

function normalizeItems(items: unknown, mode: "sumar" | "corregir"): StockAdjustmentItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const productId = typeof item?.productId === "string" ? item.productId : "";
      const variantId = typeof item?.variantId === "string" && item.variantId ? item.variantId : undefined;
      const hasLegacyQuantity = item?.quantity !== undefined;
      const quantityWithoutExpiry = hasLegacyQuantity
        ? toInt(item.quantity)
        : toInt(item?.quantityWithoutExpiry);
      const lots = normalizeLotInputs(item?.lots);
      const totalQuantity = quantityWithoutExpiry + lots.reduce((sum, lot) => sum + lot.quantity, 0);

      return {
        productId,
        variantId,
        quantityWithoutExpiry,
        lots,
        totalQuantity,
        hasLegacyQuantity,
      };
    })
    .map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantityWithoutExpiry: item.quantityWithoutExpiry,
      lots: item.lots,
      totalQuantity: item.totalQuantity,
    }))
    .filter((item) => {
      if (!item.productId) {
        return false;
      }

      if (mode === "corregir") {
        return true;
      }

      return item.totalQuantity > 0;
    });
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { branchId } = await getBranchContext(req, session.user.id);
    if (!branchId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    const { items, note, employeeId, mode } = await req.json();
    const normalizedMode = mode === "corregir" ? "corregir" : "sumar";
    const normalizedItems = normalizeItems(items, normalizedMode);

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const adjustments: Array<{ productId: string; variantId: string | null; delta: number }> = [];

      for (const item of normalizedItems) {
        if (item.variantId) {
          const inventory = await tx.variantInventory.findUnique({
            where: {
              variantId_branchId: {
                variantId: item.variantId,
                branchId,
              },
            },
            select: { stock: true },
          });

          const currentStock = inventory?.stock ?? 0;
          const nextStock = normalizedMode === "corregir" ? item.totalQuantity : currentStock + item.totalQuantity;

          await tx.variantInventory.upsert({
            where: {
              variantId_branchId: {
                variantId: item.variantId,
                branchId,
              },
            },
            create: {
              variantId: item.variantId,
              branchId,
              stock: nextStock,
            },
            update: {
              stock: nextStock,
            },
          });

          if (normalizedMode === "corregir") {
            await replaceTrackedLots(tx, {
              branchId,
              productId: item.productId,
              variantId: item.variantId,
            }, item.lots);
          } else if (item.lots.length > 0) {
            await addTrackedLots(tx, {
              branchId,
              productId: item.productId,
              variantId: item.variantId,
            }, item.lots);
          }

          adjustments.push({
            productId: item.productId,
            variantId: item.variantId,
            delta: nextStock - currentStock,
          });
          continue;
        }

        const inventory = await tx.inventoryRecord.findUnique({
          where: {
            productId_branchId: {
              productId: item.productId,
              branchId,
            },
          },
          select: { stock: true },
        });

        const currentStock = inventory?.stock ?? 0;
        const nextStock = normalizedMode === "corregir" ? item.totalQuantity : currentStock + item.totalQuantity;

        await tx.inventoryRecord.updateMany({
          where: {
            productId: item.productId,
            branchId,
          },
          data: {
            stock: nextStock,
          },
        });

        if (normalizedMode === "corregir") {
          await replaceTrackedLots(tx, {
            branchId,
            productId: item.productId,
          }, item.lots);
        } else if (item.lots.length > 0) {
          await addTrackedLots(tx, {
            branchId,
            productId: item.productId,
          }, item.lots);
        }

        adjustments.push({
          productId: item.productId,
          variantId: null,
          delta: nextStock - currentStock,
        });
      }

      const restockEvent = await tx.restockEvent.create({
        data: {
          note: typeof note === "string" ? note : normalizedMode === "corregir" ? "Correccion manual de stock" : null,
          employeeId: typeof employeeId === "string" && employeeId ? employeeId : null,
          branchId,
          items: {
            create: adjustments
              .filter((item) => item.delta !== 0)
              .map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.delta,
              })),
          },
        },
      });

      return restockEvent;
    });

    return NextResponse.json({ success: true, event: result });
  } catch (error) {
    console.error("Error processing restock:", error);
    return NextResponse.json(
      { error: "Internal server error processing the restock" },
      { status: 500 },
    );
  }
}
