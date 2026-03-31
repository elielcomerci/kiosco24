import { NextResponse } from "next/server";
import { RestockEventType, RestockValuationStatus } from "@prisma/client";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  addTrackedLots,
  normalizeLotInputs,
  replaceTrackedLots,
  type NormalizedLotInput,
} from "@/lib/inventory-expiry";
import { applyInventoryCorrectionToCostLayers } from "@/lib/inventory-cost-consumption";
import { syncRestockItemCostLayer } from "@/lib/inventory-cost-layers";
import { syncSharedPricingFromBranch } from "@/lib/pricing-mode";
import { prisma } from "@/lib/prisma";

type StockAdjustmentItem = {
  productId: string;
  variantId?: string;
  quantityWithoutExpiry: number;
  lots: NormalizedLotInput[];
  totalQuantity: number;
  unitCost?: number | null;
  salePrice?: number | null;
};

type StockOperation = "receive" | "correct";

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
      const rawUnitCost = Number(item?.unitCost);
      const rawSalePrice = Number(item?.salePrice);
      const lots = normalizeLotInputs(item?.lots);
      const totalQuantity = quantityWithoutExpiry + lots.reduce((sum, lot) => sum + lot.quantity, 0);

      return {
        productId,
        variantId,
        quantityWithoutExpiry,
        lots,
        totalQuantity,
        unitCost: Number.isFinite(rawUnitCost) && rawUnitCost >= 0 ? rawUnitCost : null,
        salePrice: Number.isFinite(rawSalePrice) && rawSalePrice >= 0 ? rawSalePrice : null,
        hasLegacyQuantity,
      };
    })
    .map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantityWithoutExpiry: item.quantityWithoutExpiry,
      lots: item.lots,
      totalQuantity: item.totalQuantity,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
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

function normalizeOperation(value: unknown): StockOperation {
  return value === "correct" ? "correct" : "receive";
}

function normalizeAttachmentUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessResponse = await guardOperationalAccess(session.user);
    if (accessResponse) {
      return accessResponse;
    }

    const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
    if (!branchId || !kioscoId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    const { items, note, employeeId, mode, operation, supplierName, trackCosts, attachmentUrls } = await req.json();
    const normalizedOperation = normalizeOperation(operation);
    const normalizedMode =
      normalizedOperation === "correct" || mode === "corregir" ? "corregir" : "sumar";
    const normalizedItems = normalizeItems(items, normalizedMode);
    const normalizedSupplierName =
      normalizedOperation === "receive" && typeof supplierName === "string" && supplierName.trim()
        ? supplierName.trim().slice(0, 120)
        : null;
    const normalizedAttachments = normalizedOperation === "receive" ? normalizeAttachmentUrls(attachmentUrls) : [];
    const normalizedTrackCosts = normalizedOperation === "receive" ? trackCosts !== false : false;
    const hasPositiveReceiveItems = normalizedItems.some((item) => item.totalQuantity > 0);
    const allPositiveReceiveItemsValued =
      hasPositiveReceiveItems &&
      normalizedItems
        .filter((item) => item.totalQuantity > 0)
        .every((item) => item.unitCost !== null);

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const adjustments: Array<{ productId: string; variantId: string | null; delta: number }> = [];
      const pricingChanges = new Map<string, { price?: number | null; cost?: number | null }>();
      const kiosco = await tx.kiosco.findUnique({
        where: { id: kioscoId },
        select: { pricingMode: true },
      });
      const pricingMode = kiosco?.pricingMode === "SHARED" ? "SHARED" : "BRANCH";

      for (const item of normalizedItems) {
        const pricingPatch =
          item.salePrice !== null || item.unitCost !== null
            ? {
                ...(item.salePrice !== null ? { price: item.salePrice } : {}),
                ...(item.unitCost !== null ? { cost: item.unitCost } : {}),
              }
            : null;

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
              price: item.salePrice ?? null,
              cost: item.unitCost ?? null,
            },
            update: {
              stock: nextStock,
              ...(item.salePrice !== null ? { price: item.salePrice } : {}),
              ...(item.unitCost !== null ? { cost: item.unitCost } : {}),
            },
          });

          if (pricingMode === "SHARED" && pricingPatch) {
            pricingChanges.set(item.productId, {
              ...(item.salePrice !== null ? { price: item.salePrice } : {}),
              ...(item.unitCost !== null ? { cost: item.unitCost } : {}),
            });
          }

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
            ...(pricingPatch ?? {}),
          },
        });

        if (pricingPatch) {
          const existingRecord = await tx.inventoryRecord.findUnique({
            where: {
              productId_branchId: {
                productId: item.productId,
                branchId,
              },
            },
            select: { id: true },
          });

          if (!existingRecord) {
            await tx.inventoryRecord.create({
              data: {
                productId: item.productId,
                branchId,
                price: item.salePrice ?? 0,
                cost: item.unitCost ?? null,
                stock: nextStock,
                minStock: 0,
                showInGrid: true,
              },
            });
          }

          pricingChanges.set(item.productId, {
            ...(item.salePrice !== null ? { price: item.salePrice } : {}),
            ...(item.unitCost !== null ? { cost: item.unitCost } : {}),
          });
        }

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
          type:
            normalizedOperation === "correct"
              ? RestockEventType.CORRECTION
              : RestockEventType.RECEIVE,
          note:
            typeof note === "string" && note.trim()
              ? note.trim()
              : normalizedMode === "corregir"
                ? "Correccion manual de stock"
                : null,
          supplierName: normalizedSupplierName,
          valuationStatus:
            normalizedOperation === "receive"
              ? normalizedTrackCosts
                ? allPositiveReceiveItemsValued
                  ? RestockValuationStatus.COMPLETED
                  : RestockValuationStatus.PENDING
                : RestockValuationStatus.NOT_APPLICABLE
              : RestockValuationStatus.NOT_APPLICABLE,
          employeeId: typeof employeeId === "string" && employeeId ? employeeId : null,
          branchId,
          attachments:
            normalizedAttachments.length > 0
              ? {
                  create: normalizedAttachments.map((url) => ({ url })),
                }
              : undefined,
          items: {
            create: adjustments
              .filter((item) => item.delta !== 0)
              .map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.delta,
                unitCost:
                  normalizedItems.find(
                    (entry) => entry.productId === item.productId && (entry.variantId ?? null) === (item.variantId ?? null),
                  )?.unitCost ?? null,
                salePrice:
                  normalizedItems.find(
                    (entry) => entry.productId === item.productId && (entry.variantId ?? null) === (item.variantId ?? null),
                  )?.salePrice ?? null,
              })),
          },
        },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              unitCost: true,
            },
          },
        },
      });

      if (normalizedOperation === "receive") {
        for (const item of restockEvent.items) {
          await syncRestockItemCostLayer(tx, {
            branchId,
            productId: item.productId,
            variantId: item.variantId,
            restockItemId: item.id,
            quantity: item.quantity,
            unitCost: item.unitCost,
            receivedAt: restockEvent.createdAt,
          });
        }
      } else {
        for (const adjustment of adjustments) {
          if (adjustment.delta >= 0) {
            continue;
          }

          await applyInventoryCorrectionToCostLayers(tx, {
            branchId,
            productId: adjustment.productId,
            variantId: adjustment.variantId,
            delta: adjustment.delta,
          });
        }
      }

      if (pricingMode === "SHARED" && pricingChanges.size > 0) {
        await syncSharedPricingFromBranch(tx, {
          kioscoId,
          sourceBranchId: branchId,
          productIds: Array.from(pricingChanges.keys()),
        });
      }

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
