import { NextResponse } from "next/server";
import { PlatformSyncMode } from "@prisma/client";

import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { summarizeTrackedLots } from "@/lib/inventory-expiry";
import { DEFAULT_PRICING_MODE, syncSharedPricingFromBranch } from "@/lib/pricing-mode";
import { hasPlatformSyncUpdate } from "@/lib/platform-product-sync";
import { Prisma, prisma } from "@/lib/prisma";
import {
  normalizeCatalogBarcode,
  normalizeCatalogDescription,
  normalizeCatalogOptionalTitle,
  normalizeCatalogTitle,
} from "@/lib/catalog-text";
import {
  findApprovedPlatformProductByBarcode,
  platformDraftDiffers,
  queuePlatformProductSubmission,
} from "@/lib/platform-catalog";

type VariantPayload = {
  id?: string;
  name: string;
  barcode: string | null;
  stock: number;
  minStock: number;
};

type ProductListInventory = Prisma.InventoryRecordGetPayload<{
  include: {
    product: {
      include: {
        category: {
          select: {
            showInGrid: true;
          };
        };
        platformProduct: {
          select: {
            id: true;
            barcode: true;
            name: true;
            brand: true;
            description: true;
            presentation: true;
            image: true;
            status: true;
            updatedAt: true;
          };
        };
        variants: {
          include: {
            inventory: true;
          };
        };
      };
    };
  };
}>;

function normalizeVariantPayload(variants: unknown): VariantPayload[] {
  if (!Array.isArray(variants)) {
    return [];
  }

  return variants
    .map((variant) => ({
      id: typeof variant?.id === "string" ? variant.id : undefined,
      name: normalizeCatalogTitle(variant?.name),
      barcode:
        normalizeCatalogBarcode(variant?.barcode),
      stock:
        typeof variant?.stock === "number"
          ? variant.stock
          : Number.isFinite(Number(variant?.stock))
            ? Number(variant?.stock)
            : 0,
      minStock:
        typeof variant?.minStock === "number"
          ? variant.minStock
          : Number.isFinite(Number(variant?.minStock))
            ? Number(variant?.minStock)
            : 0,
    }))
    .filter((variant) => variant.name);
}

async function resolveCategorySelection(kioscoId: string, categoryId: unknown) {
  if (typeof categoryId !== "string" || !categoryId) {
    return { categoryId: null, categoryName: null };
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, kioscoId },
    select: { id: true, name: true },
  });

  return {
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
  };
}

type StockLotSummaryItem = {
  productId: string;
  variantId: string | null;
  quantity: number;
  expiresOn: Date;
};

function lotKey(productId: string, variantId?: string | null) {
  return `${productId}:${variantId ?? "base"}`;
}

function minDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function getStockFlags(availableStock: number | null | undefined, minStock: number | null | undefined) {
  if (typeof availableStock !== "number") {
    return {
      isNegativeStock: false,
      isOutOfStock: false,
      isBelowMinStock: false,
    };
  }

  return {
    isNegativeStock: availableStock < 0,
    isOutOfStock: availableStock === 0,
    isBelowMinStock:
      typeof minStock === "number" &&
      minStock > 0 &&
      availableStock > 0 &&
      availableStock <= minStock,
  };
}

function normalizePlatformSyncMode(value: unknown, fallback: PlatformSyncMode = PlatformSyncMode.MANUAL) {
  if (value === PlatformSyncMode.AUTO) {
    return PlatformSyncMode.AUTO;
  }

  if (value === PlatformSyncMode.MANUAL) {
    return PlatformSyncMode.MANUAL;
  }

  return fallback;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json([], { status: 200 });
  }

  const branchSettings = branchId
    ? await prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          allowNegativeStock: true,
          kiosco: { select: { expiryAlertDays: true } },
        },
      })
    : null;
  const expiryAlertDays = branchSettings?.kiosco?.expiryAlertDays ?? 30;
  const allowNegativeStock = branchSettings?.allowNegativeStock ?? false;

  const inventory = await prisma.inventoryRecord.findMany({
    where: { branchId },
    include: {
      product: {
        include: {
          category: { select: { showInGrid: true } },
          platformProduct: {
            select: {
              id: true,
              barcode: true,
              name: true,
              brand: true,
              description: true,
              presentation: true,
              image: true,
              status: true,
              updatedAt: true,
            },
          },
          variants: {
            include: {
              inventory: {
                where: { branchId },
              },
            },
          },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  const lots = await prisma.stockLot.findMany({
    where: {
      branchId,
      quantity: { gt: 0 },
    },
    select: {
      productId: true,
      variantId: true,
      quantity: true,
      expiresOn: true,
    },
  });

  const lotsByKey = lots.reduce<Map<string, StockLotSummaryItem[]>>((map, lot) => {
    const key = lotKey(lot.productId, lot.variantId);
    const current = map.get(key) ?? [];
    current.push(lot);
    map.set(key, current);
    return map;
  }, new Map());

  const products = inventory.map((record: ProductListInventory) => {
    const baseLots = lotsByKey.get(lotKey(record.product.id)) ?? [];
    const baseSummary = summarizeTrackedLots(record.stock, baseLots, expiryAlertDays);
    const mappedVariants = record.product.variants.map((variant) => {
      const variantInventory = variant.inventory[0];
      const variantStock = variantInventory?.stock ?? 0;
      const variantLots = lotsByKey.get(lotKey(record.product.id, variant.id)) ?? [];
      const variantSummary = summarizeTrackedLots(variantStock, variantLots, expiryAlertDays);
      const variantAvailableStock = variantSummary.availableStock ?? variantStock;
      const variantFlags = getStockFlags(variantAvailableStock, variantInventory?.minStock ?? 0);

      return {
        id: variant.id,
        name: variant.name,
        barcode: variant.barcode,
        stock: variantStock,
        availableStock: variantAvailableStock,
        minStock: variantInventory?.minStock ?? 0,
        expiredQuantity: variantSummary.expiredQuantity,
        expiringSoonQuantity: variantSummary.expiringSoonQuantity,
        nextExpiryOn: variantSummary.nextExpiryOn,
        hasTrackedLots: variantSummary.hasTrackedLots,
        ...variantFlags,
      };
    });

    const baseAvailableStock = baseSummary.availableStock ?? record.stock;
    const baseFlags = getStockFlags(baseAvailableStock, record.minStock);
    const hasVariantStock = mappedVariants.some((variant) => (variant.availableStock ?? 0) > 0);
    const hasBaseStock = (baseAvailableStock ?? 0) > 0;
    const hasStock = record.product.variants.length > 0 ? hasVariantStock : hasBaseStock;
    const readyForSale =
      record.showInGrid &&
      record.price > 0 &&
      typeof record.cost === "number" &&
      record.cost > 0 &&
      (allowNegativeStock || hasStock) &&
      (record.product.category?.showInGrid ?? true);
    const aggregateFlags = record.product.variants.length > 0
      ? {
          isNegativeStock: mappedVariants.some((variant) => variant.isNegativeStock),
          isOutOfStock:
            mappedVariants.length > 0 &&
            mappedVariants.every((variant) => !variant.isNegativeStock && variant.isOutOfStock),
          isBelowMinStock:
            mappedVariants.some((variant) => variant.isBelowMinStock) ||
            mappedVariants.some((variant) => !variant.isNegativeStock && variant.isOutOfStock),
        }
      : baseFlags;
    const platformSyncMode = record.product.platformSyncMode ?? PlatformSyncMode.MANUAL;
    const platformUpdateAvailable = hasPlatformSyncUpdate({
      product: {
        id: record.product.id,
        barcode: record.product.barcode,
        name: record.product.name,
        brand: record.product.brand,
        description: record.product.description,
        presentation: record.product.presentation,
        image: record.product.image,
        platformProductId: record.product.platformProductId,
        platformSyncMode,
        platformSourceUpdatedAt: record.product.platformSourceUpdatedAt,
        variants: record.product.variants.map((variant) => ({ id: variant.id })),
      },
      platformProduct: record.product.platformProduct,
    });

    return {
      id: record.product.id,
      name: record.product.name,
      emoji: record.product.emoji,
      barcode: record.product.barcode,
      internalCode: record.product.internalCode,
      image: record.product.image,
      brand: record.product.brand,
      description: record.product.description,
      presentation: record.product.presentation,
      supplierName: record.product.supplierName,
      notes: record.product.notes,
      platformProductId: record.product.platformProductId,
      platformSyncMode,
      platformSourceUpdatedAt: record.product.platformSourceUpdatedAt,
      platformUpdateAvailable,
      categoryId: record.product.categoryId,
      price: record.price,
      cost: record.cost,
      stock: record.stock,
      availableStock: baseAvailableStock,
      minStock: record.minStock,
      showInGrid: record.showInGrid,
      readyForSale,
      allowNegativeStock,
      categoryShowInGrid: record.product.category?.showInGrid ?? true,
      expiredQuantity: record.product.variants.length > 0
        ? mappedVariants.reduce((sum, variant) => sum + variant.expiredQuantity, 0)
        : baseSummary.expiredQuantity,
      expiringSoonQuantity: record.product.variants.length > 0
        ? mappedVariants.reduce((sum, variant) => sum + variant.expiringSoonQuantity, 0)
        : baseSummary.expiringSoonQuantity,
      nextExpiryOn: record.product.variants.length > 0
        ? mappedVariants.reduce<Date | null>((current, variant) => minDate(current, variant.nextExpiryOn), null)
        : baseSummary.nextExpiryOn,
      hasTrackedLots: record.product.variants.length > 0
        ? mappedVariants.some((variant) => variant.hasTrackedLots)
        : baseSummary.hasTrackedLots,
      ...aggregateFlags,
      variants: mappedVariants,
    };
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await getKioscoAccessContextForSession(session.user);
  const setupAllowed = canAccessSetupWithoutSubscription(session.user, access);
  if (!access.allowed && !setupAllowed) {
    return NextResponse.json(
      { error: "Necesitas una suscripcion activa para usar esta cuenta.", code: access.reason },
      { status: 402 },
    );
  }
  const hasOperationalAccess = access.allowed;

  const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
  if (!kioscoId || !branchId) {
    return NextResponse.json({ error: "No kiosco/branch" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name,
    barcode,
    internalCode,
    emoji,
    image,
    brand,
    description,
    presentation,
    supplierName,
    notes,
    categoryId,
    price,
    cost,
    stock,
    minStock,
    showInGrid,
    variants,
    platformSyncMode,
  } = body;

  if (platformSyncMode !== undefined && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Solo el owner puede cambiar la sincronizacion con la base general." },
      { status: 403 },
    );
  }

  try {
    const normalizedVariants = normalizeVariantPayload(variants);
    const requestedSimpleStock =
      typeof stock === "number"
        ? stock
        : Number.isFinite(Number(stock))
          ? Number(stock)
          : 0;
    const requestsOperationalStock =
      requestedSimpleStock !== 0 || normalizedVariants.some((variant) => (variant.stock ?? 0) !== 0);

    if (!hasOperationalAccess && requestsOperationalStock) {
      return NextResponse.json(
        {
          error: "Puedes cargar productos sin limite, pero para registrar stock o movimientos operativos primero activa la suscripcion.",
          code: "NO_SUBSCRIPTION_OPERATIONAL",
        },
        { status: 402 },
      );
    }

    const normalizedName = normalizeCatalogTitle(name);
    const normalizedInternalCode =
      typeof internalCode === "string" ? internalCode.trim() || null : null;
    const normalizedBrand = normalizeCatalogOptionalTitle(brand);
    const normalizedDescription = normalizeCatalogDescription(description);
    const normalizedPresentation = normalizeCatalogOptionalTitle(presentation);
    const normalizedSupplierName =
      typeof supplierName === "string" ? supplierName.trim() || null : null;
    const normalizedNotes = typeof notes === "string" ? notes.trim() || null : null;
    const normalizedImage = typeof image === "string" ? image.trim() || null : null;
    const kioscoSettings = await prisma.kiosco.findUnique({
      where: { id: kioscoId },
      select: { pricingMode: true },
    });
    const pricingMode = kioscoSettings?.pricingMode ?? DEFAULT_PRICING_MODE;
    const resolvedCategory = await resolveCategorySelection(kioscoId, categoryId);
    const normalizedBarcode =
      normalizedVariants.length > 0 ? null : normalizeCatalogBarcode(barcode);
    const lookupBarcode =
      normalizedBarcode ?? normalizedVariants.find((variant) => variant.barcode)?.barcode ?? null;
    const platformProduct = lookupBarcode
      ? await findApprovedPlatformProductByBarcode(lookupBarcode)
      : null;
    const normalizedPlatformSyncMode = normalizePlatformSyncMode(platformSyncMode);

    const product = await prisma.product.create({
      data: {
        name: normalizedName,
        barcode: normalizedBarcode,
        internalCode: normalizedInternalCode,
        emoji: typeof emoji === "string" ? emoji : null,
        image: normalizedImage,
        brand: normalizedBrand,
        description: normalizedDescription,
        presentation: normalizedPresentation,
        supplierName: normalizedSupplierName,
        notes: normalizedNotes,
        categoryId: resolvedCategory.categoryId,
        platformProductId: platformProduct?.id ?? null,
        platformSyncMode: normalizedPlatformSyncMode,
        platformSourceUpdatedAt: platformProduct?.updatedAt ?? null,
        kioscoId,
        variants: normalizedVariants.length
          ? {
              create: normalizedVariants.map((variant) => ({
                name: variant.name,
                barcode: variant.barcode || null,
              })),
            }
          : undefined,
      },
      include: { variants: true },
    });

    const branches = await prisma.branch.findMany({
      where: { kioscoId },
      select: { id: true },
    });

    if (branches.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: branches.map((branch) => ({
          productId: product.id,
          branchId: branch.id,
          price:
            pricingMode === "SHARED"
              ? (typeof price === "number" ? price : 0)
              : branch.id === branchId
                ? (typeof price === "number" ? price : 0)
                : 0,
          cost:
            pricingMode === "SHARED"
              ? (typeof cost === "number" ? cost : null)
              : branch.id === branchId
                ? (typeof cost === "number" ? cost : null)
                : null,
          stock: branch.id === branchId ? (typeof stock === "number" ? stock : 0) : 0,
          minStock: branch.id === branchId ? (typeof minStock === "number" ? minStock : 0) : 0,
          showInGrid: typeof showInGrid === "boolean" ? showInGrid : true,
        })),
      });

      if (product.variants.length > 0 && normalizedVariants.length > 0) {
        const variantStockData: Prisma.VariantInventoryCreateManyInput[] = [];

        branches.forEach((branch) => {
          product.variants.forEach((productVariant) => {
            const requestedVariant = normalizedVariants.find((variant) => variant.name === productVariant.name);
            variantStockData.push({
              variantId: productVariant.id,
              branchId: branch.id,
              stock: branch.id === branchId ? requestedVariant?.stock ?? 0 : 0,
              minStock: branch.id === branchId ? requestedVariant?.minStock ?? 0 : 0,
            });
          });
        });

        if (variantStockData.length > 0) {
          await prisma.variantInventory.createMany({
            data: variantStockData,
          });
        }
      }
    }

    if (
      (normalizedBarcode || normalizedVariants.some((variant) => variant.barcode)) &&
      platformDraftDiffers(platformProduct, {
        barcode: normalizedBarcode,
        name: normalizedName,
        brand: normalizedBrand,
        categoryName: resolvedCategory.categoryName,
        description: normalizedDescription,
        presentation: normalizedPresentation,
        image: normalizedImage,
        variants: normalizedVariants.map((variant) => ({
          name: variant.name,
          barcode: variant.barcode,
        })),
      })
    ) {
      await queuePlatformProductSubmission({
        platformProductId: platformProduct?.id ?? null,
        submittedByUserId: session.user.id,
        submittedFromKioscoId: kioscoId,
        barcode: normalizedBarcode,
        name: normalizedName,
        brand: normalizedBrand,
        categoryName: resolvedCategory.categoryName,
        description: normalizedDescription,
        presentation: normalizedPresentation,
        image: normalizedImage,
        variants: normalizedVariants.map((variant) => ({
          name: variant.name,
          barcode: variant.barcode,
        })),
      });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error creating product" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId || !kioscoId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json();
  const normalizedProductIds = Array.isArray(body?.productIds)
    ? body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];
  const categoryId = body?.categoryId;
  const percentageValue = Number(body?.percentage);

  if (normalizedProductIds.length === 0) {
    return NextResponse.json({ error: "No products provided" }, { status: 400 });
  }

  if (Number.isFinite(percentageValue) && percentageValue !== 0) {
    const kioscoSettings = await prisma.kiosco.findUnique({
      where: { id: kioscoId },
      select: { pricingMode: true },
    });
    const pricingMode = kioscoSettings?.pricingMode ?? DEFAULT_PRICING_MODE;
    const multiplier = 1 + percentageValue / 100;
    const inventoryToUpdate = await prisma.inventoryRecord.findMany({
      where: { branchId, productId: { in: normalizedProductIds } },
      select: { id: true, price: true },
    });

    const transactions = inventoryToUpdate.map((inventory) =>
      prisma.inventoryRecord.update({
        where: { id: inventory.id },
        data: { price: Math.round(inventory.price * multiplier) },
      }),
    );
    await prisma.$transaction(transactions);

    if (pricingMode === "SHARED") {
      await syncSharedPricingFromBranch(prisma, {
        kioscoId,
        sourceBranchId: branchId,
        productIds: normalizedProductIds,
      });
    }
  }

  if (categoryId !== undefined) {
    await prisma.product.updateMany({
      where: { id: { in: normalizedProductIds } },
      data: { categoryId: typeof categoryId === "string" && categoryId ? categoryId : null },
    });
  }

  return NextResponse.json({ success: true, count: normalizedProductIds.length });
}
