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
  buildPlatformSubmissionDraft,
  findApprovedPlatformProductByBarcode,
  platformDraftDiffers,
  queuePlatformProductSubmission,
} from "@/lib/platform-catalog";

type VariantPayload = {
  id?: string;
  name: string;
  barcode: string | null;
  internalCode: string | null;
  stock: number;
  minStock: number;
  price: number | null;
  cost: number | null;
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

type ProductGridInventory = {
  stock: number;
  price: number;
  cost: number | null;
  minStock: number;
  showInGrid: boolean;
  product: {
    id: string;
    name: string;
    emoji: string | null;
    barcode: string | null;
    internalCode: string | null;
    image: string | null;
    brand: string | null;
    description: string | null;
    presentation: string | null;
    supplierName: string | null;
    notes: string | null;
    soldByWeight: boolean;
    categoryId: string | null;
    category: {
      showInGrid: boolean;
    } | null;
    variants: Array<{
      id: string;
      name: string;
      barcode: string | null;
      internalCode: string | null;
      inventory: Array<{
        stock: number;
        price: number | null;
        cost: number | null;
        minStock: number;
      }>;
    }>;
  };
};

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function buildGridProduct(record: ProductGridInventory, allowNegativeStock: boolean, negativeReservationsByKey: Map<string, number> = new Map()) {
  const baseNegative = negativeReservationsByKey.get(lotKey(record.product.id)) ?? 0;
  const baseAvailableStock = record.stock - baseNegative;
  const baseFlags = getStockFlags(baseAvailableStock, record.minStock);
  const basePrice = isPositiveFiniteNumber(record.price) ? record.price : 0;
  const baseCost = isPositiveFiniteNumber(record.cost) ? record.cost : null;

  const variants = record.product.variants.map((variant) => {
    const variantInventory = variant.inventory[0];
    const variantNegative = negativeReservationsByKey.get(lotKey(record.product.id, variant.id)) ?? 0;
    const variantStock = (variantInventory?.stock ?? 0) - variantNegative;
    const variantPrice =
      isPositiveFiniteNumber(variantInventory?.price) ? variantInventory.price : basePrice;
    const variantCost =
      isPositiveFiniteNumber(variantInventory?.cost) ? variantInventory.cost : baseCost;
    const variantAvailableStock = variantStock;
    const variantFlags = getStockFlags(variantAvailableStock, variantInventory?.minStock ?? 0);
    const variantReadyForSale =
      record.showInGrid &&
      (record.product.category?.showInGrid ?? true) &&
      isPositiveFiniteNumber(variantPrice) &&
      isPositiveFiniteNumber(variantCost) &&
      (allowNegativeStock || variantAvailableStock > 0);

    return {
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
      internalCode: variant.internalCode,
      price: variantPrice,
      cost: variantCost,
      stock: variantStock,
      availableStock: variantAvailableStock,
      minStock: variantInventory?.minStock ?? 0,
      readyForSale: variantReadyForSale,
      ...variantFlags,
    };
  });

  const variantPrices = variants
    .map((variant) => (isPositiveFiniteNumber(variant.price) ? variant.price : null))
    .filter((price): price is number => price !== null);
  const variantCosts = variants
    .map((variant) => (isPositiveFiniteNumber(variant.cost) ? variant.cost : null))
    .filter((cost): cost is number => cost !== null);
  const hasVariantStock = variants.some((variant) => (variant.availableStock ?? 0) > 0);
  const hasBaseStock = (baseAvailableStock ?? 0) > 0;
  const hasStock = record.product.variants.length > 0 ? hasVariantStock : hasBaseStock;
  const price = variantPrices.length > 0 ? Math.min(...variantPrices) : basePrice;
  const cost = variantCosts.length > 0 ? Math.min(...variantCosts) : baseCost;
  const readyForSale =
    record.product.variants.length > 0
      ? variants.some((variant) => variant.readyForSale)
      : record.showInGrid &&
        (record.product.category?.showInGrid ?? true) &&
        isPositiveFiniteNumber(price) &&
        isPositiveFiniteNumber(cost) &&
        (allowNegativeStock || hasStock);
  const aggregateFlags =
    record.product.variants.length > 0
      ? {
          isNegativeStock: variants.some((variant) => variant.isNegativeStock),
          isOutOfStock:
            variants.length > 0 &&
            variants.every((variant) => !variant.isNegativeStock && variant.isOutOfStock),
          isBelowMinStock:
            variants.some((variant) => variant.isBelowMinStock) ||
            variants.some((variant) => !variant.isNegativeStock && variant.isOutOfStock),
        }
      : baseFlags;

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
    soldByWeight: record.product.soldByWeight,
    categoryId: record.product.categoryId,
    price,
    cost,
    stock: record.stock - baseNegative,
    availableStock: baseAvailableStock,
    minStock: record.minStock,
    showInGrid: record.showInGrid,
    readyForSale,
    allowNegativeStock,
    categoryShowInGrid: record.product.category?.showInGrid ?? true,
    expiredQuantity: 0,
    expiringSoonQuantity: 0,
    nextExpiryOn: null,
    hasTrackedLots: false,
    ...aggregateFlags,
    variants,
  };
}

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
      internalCode:
        typeof variant?.internalCode === "string" ? variant.internalCode.trim() || null : null,
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
      price:
        typeof variant?.price === "number"
          ? variant.price
          : Number.isFinite(Number(variant?.price))
            ? Number(variant?.price)
            : null,
      cost:
        typeof variant?.cost === "number"
          ? variant.cost
          : Number.isFinite(Number(variant?.cost))
            ? Number(variant?.cost)
            : null,
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

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "full";
  const detailProductId = searchParams.get("productId");

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json([], { status: 200 });
  }

  if (view === "detail" && !detailProductId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
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

  if (view === "grid") {
    const inventory = (await prisma.inventoryRecord.findMany({
      where: { branchId },
      select: {
        stock: true,
        price: true,
        cost: true,
        minStock: true,
        showInGrid: true,
        product: {
          select: {
            id: true,
            name: true,
            emoji: true,
            barcode: true,
            internalCode: true,
            image: true,
            brand: true,
            description: true,
            presentation: true,
            supplierName: true,
            notes: true,
            soldByWeight: true,
            categoryId: true,
            category: {
              select: {
                showInGrid: true,
              },
            },
            variants: {
              select: {
                id: true,
                name: true,
                barcode: true,
                internalCode: true,
                inventory: {
                  where: { branchId },
                  select: {
                    stock: true,
                    price: true,
                    cost: true,
                    minStock: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    })) as ProductGridInventory[];

    const negativeReservations = await prisma.negativeStockReservation.findMany({
      where: { branchId, quantityPending: { gt: 0 }, resolvedAt: null },
      select: { productId: true, variantId: true, quantityPending: true },
    });

    const negativeReservationsByKey = negativeReservations.reduce((map, reservation) => {
      const key = lotKey(reservation.productId, reservation.variantId);
      map.set(key, (map.get(key) ?? 0) + reservation.quantityPending);
      return map;
    }, new Map<string, number>());

    const products = inventory.map((record) => buildGridProduct(record, allowNegativeStock, negativeReservationsByKey));
    return NextResponse.json(products);
  }

  const inventoryWhere =
    view === "detail" && detailProductId
      ? { branchId, productId: detailProductId }
      : { branchId };
  const lotsWhere =
    view === "detail" && detailProductId
      ? { branchId, productId: detailProductId, quantity: { gt: 0 } }
      : { branchId, quantity: { gt: 0 } };

  const inventory = await prisma.inventoryRecord.findMany({
    where: inventoryWhere,
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
    where: lotsWhere,
    select: {
      productId: true,
      variantId: true,
      quantity: true,
      expiresOn: true,
    },
  });

  const negativeReservations = await prisma.negativeStockReservation.findMany({
    where: { branchId, quantityPending: { gt: 0 }, resolvedAt: null },
    select: { productId: true, variantId: true, quantityPending: true },
  });

  const negativeReservationsByKey = negativeReservations.reduce((map, reservation) => {
    const key = lotKey(reservation.productId, reservation.variantId);
    map.set(key, (map.get(key) ?? 0) + reservation.quantityPending);
    return map;
  }, new Map<string, number>());

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
      const variantNegative = negativeReservationsByKey.get(lotKey(record.product.id, variant.id)) ?? 0;
      const variantStock = (variantInventory?.stock ?? 0) - variantNegative;
      const variantPrice =
        typeof variantInventory?.price === "number" && Number.isFinite(variantInventory.price)
          ? variantInventory.price
          : record.price;
      const variantCost =
        typeof variantInventory?.cost === "number" && Number.isFinite(variantInventory.cost)
          ? variantInventory.cost
          : record.cost;
      const variantLots = lotsByKey.get(lotKey(record.product.id, variant.id)) ?? [];
      const variantSummary = summarizeTrackedLots(variantInventory?.stock ?? 0, variantLots, expiryAlertDays);
      const variantAvailableStock = (variantSummary.availableStock ?? variantInventory?.stock ?? 0) - variantNegative;
      const variantFlags = getStockFlags(variantAvailableStock, variantInventory?.minStock ?? 0);
      const variantReadyForSale =
        record.showInGrid &&
        Number.isFinite(variantPrice) &&
        variantPrice > 0 &&
        typeof variantCost === "number" &&
        variantCost > 0 &&
        (allowNegativeStock || variantAvailableStock > 0) &&
        (record.product.category?.showInGrid ?? true);

      return {
        id: variant.id,
        name: variant.name,
        barcode: variant.barcode,
        internalCode: variant.internalCode,
        price: variantPrice,
        cost: variantCost,
        stock: variantStock,
        availableStock: variantAvailableStock,
        minStock: variantInventory?.minStock ?? 0,
        expiredQuantity: variantSummary.expiredQuantity,
        expiringSoonQuantity: variantSummary.expiringSoonQuantity,
        nextExpiryOn: variantSummary.nextExpiryOn,
        hasTrackedLots: variantSummary.hasTrackedLots,
        readyForSale: variantReadyForSale,
        ...variantFlags,
      };
    });

    const baseNegative = negativeReservationsByKey.get(lotKey(record.product.id)) ?? 0;
    const baseAvailableStockOriginal = baseSummary.availableStock ?? record.stock;
    const baseAvailableStock = baseAvailableStockOriginal === null ? null : baseAvailableStockOriginal - baseNegative;
    const baseFlags = getStockFlags(baseAvailableStock, record.minStock);
    const variantPrices = mappedVariants
      .map((variant) => (typeof variant.price === "number" && variant.price > 0 ? variant.price : null))
      .filter((price): price is number => price !== null);
    const variantCosts = mappedVariants
      .map((variant) => (typeof variant.cost === "number" && variant.cost > 0 ? variant.cost : null))
      .filter((cost): cost is number => cost !== null);
    const hasVariantStock = mappedVariants.some((variant) => (variant.availableStock ?? 0) > 0);
    const hasBaseStock = (baseAvailableStock ?? 0) > 0;
    const hasStock = record.product.variants.length > 0 ? hasVariantStock : hasBaseStock;
    const priceMin = variantPrices.length > 0 ? Math.min(...variantPrices) : record.price;
    const priceMax = variantPrices.length > 0 ? Math.max(...variantPrices) : record.price;
    const costMin =
      variantCosts.length > 0
        ? Math.min(...variantCosts)
        : typeof record.cost === "number"
          ? record.cost
          : null;
    const costMax =
      variantCosts.length > 0
        ? Math.max(...variantCosts)
        : typeof record.cost === "number"
          ? record.cost
          : null;
    const readyForSale =
      record.product.variants.length > 0
        ? mappedVariants.some((variant) => variant.readyForSale)
        : record.showInGrid &&
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
      soldByWeight: record.product.soldByWeight,
      platformProductId: record.product.platformProductId,
      platformSyncMode,
      platformSourceUpdatedAt: record.product.platformSourceUpdatedAt,
      platformUpdateAvailable,
      categoryId: record.product.categoryId,
      price: priceMin,
      cost: costMin,
      priceMin,
      priceMax,
      costMin,
      costMax,
      hasVariablePrices: priceMin !== priceMax,
      stock: record.stock === null ? null : record.stock - baseNegative,
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

  return NextResponse.json(view === "detail" ? products[0] ?? null : products);
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
    soldByWeight,
    categoryId,
    price,
    cost,
    stock,
    minStock,
    showInGrid,
    variants,
    platformSyncMode,
    businessActivity,
  } = body;

  if (platformSyncMode !== undefined && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Solo el owner puede cambiar la sincronizacion con la base general." },
      { status: 403 },
    );
  }

  try {
    const normalizedVariants = normalizeVariantPayload(variants);
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
      select: { pricingMode: true, mainBusinessActivity: true },
    });
    const pricingMode = kioscoSettings?.pricingMode ?? DEFAULT_PRICING_MODE;
    const defaultKioscoBusinessActivity = kioscoSettings?.mainBusinessActivity ?? "KIOSCO";

    // Resolve Category with its businessActivities
    const resolvedCategory = categoryId
      ? await prisma.category.findFirst({
          where: { id: String(categoryId), kioscoId },
          select: { id: true, name: true, businessActivities: true },
        })
      : null;

    // Logic for effective businessActivity on the product
    const effectiveBusinessActivity =
      businessActivity || resolvedCategory?.businessActivities?.[0] || defaultKioscoBusinessActivity;

    const normalizedBarcode =
      normalizedVariants.length > 0 ? null : normalizeCatalogBarcode(barcode);
    const lookupBarcode =
      normalizedBarcode ?? normalizedVariants.find((variant) => variant.barcode)?.barcode ?? null;
    const platformProduct = lookupBarcode
      ? await findApprovedPlatformProductByBarcode(lookupBarcode, effectiveBusinessActivity)
      : null;
    const normalizedPlatformSyncMode = normalizePlatformSyncMode(platformSyncMode);
    const platformSubmissionDraft = buildPlatformSubmissionDraft(platformProduct, {
      barcode: normalizedBarcode,
      businessActivity: platformProduct?.businessActivity ?? effectiveBusinessActivity,
      name: normalizedName,
      brand: normalizedBrand,
      categoryName: resolvedCategory?.name || null,
      description: normalizedDescription,
      presentation: normalizedPresentation,
      image: normalizedImage,
      variants: normalizedVariants.map((variant) => ({
        name: variant.name,
        barcode: variant.barcode,
      })),
    });

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
        soldByWeight: typeof soldByWeight === "boolean" ? soldByWeight : false,
        categoryId: resolvedCategory?.id || null,
        businessActivity: effectiveBusinessActivity,
        platformProductId: platformProduct?.id ?? null,
        platformSyncMode: normalizedPlatformSyncMode,
        platformSourceUpdatedAt: platformProduct?.updatedAt ?? null,
        kioscoId,
        variants: normalizedVariants.length
          ? {
              create: normalizedVariants.map((variant) => ({
                name: variant.name,
                barcode: variant.barcode || null,
                internalCode: variant.internalCode,
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
      const layerData: Prisma.InventoryCostLayerCreateManyInput[] = [];

      await prisma.inventoryRecord.createMany({
        data: branches.map((branch) => {
          const mappedPrice = pricingMode === "SHARED"
            ? (typeof price === "number" ? price : 0)
            : branch.id === branchId
              ? (typeof price === "number" ? price : 0)
              : 0;

          const mappedCost = pricingMode === "SHARED"
            ? (typeof cost === "number" ? cost : null)
            : branch.id === branchId
              ? (typeof cost === "number" ? cost : null)
              : null;

          const mappedStock = branch.id === branchId ? (typeof stock === "number" ? stock : 0) : 0;
          
          if (mappedStock > 0 && typeof mappedCost === "number" && mappedCost > 0 && product.variants.length === 0) {
            layerData.push({
              branchId: branch.id,
              productId: product.id,
              variantId: null,
              sourceType: "LEGACY_SNAPSHOT",
              unitCost: mappedCost,
              initialQuantity: mappedStock,
              remainingQuantity: mappedStock,
              receivedAt: new Date(),
            });
          }

          return {
            productId: product.id,
            branchId: branch.id,
            price: mappedPrice,
            cost: mappedCost,
            stock: mappedStock,
            minStock: branch.id === branchId ? (typeof minStock === "number" ? minStock : 0) : 0,
            showInGrid: typeof showInGrid === "boolean" ? showInGrid : true,
          };
        }),
      });

      if (product.variants.length > 0 && normalizedVariants.length > 0) {
        const variantStockData: Prisma.VariantInventoryCreateManyInput[] = [];

        branches.forEach((branch) => {
          product.variants.forEach((productVariant) => {
            const requestedVariant = normalizedVariants.find((variant) => variant.name === productVariant.name);
            const mappedStock = branch.id === branchId ? requestedVariant?.stock ?? 0 : 0;
            const mappedCost = pricingMode === "SHARED"
              ? requestedVariant?.cost ?? (typeof cost === "number" ? cost : null)
              : branch.id === branchId
                ? requestedVariant?.cost ?? (typeof cost === "number" ? cost : null)
                : null;
            
            if (mappedStock > 0 && typeof mappedCost === "number" && mappedCost > 0) {
              layerData.push({
                branchId: branch.id,
                productId: product.id,
                variantId: productVariant.id,
                sourceType: "LEGACY_SNAPSHOT",
                unitCost: mappedCost,
                initialQuantity: mappedStock,
                remainingQuantity: mappedStock,
                receivedAt: new Date(),
              });
            }

            variantStockData.push({
              variantId: productVariant.id,
              branchId: branch.id,
              stock: mappedStock,
              minStock: branch.id === branchId ? requestedVariant?.minStock ?? 0 : 0,
              price:
                pricingMode === "SHARED"
                  ? requestedVariant?.price ?? (typeof price === "number" ? price : null)
                  : branch.id === branchId
                    ? requestedVariant?.price ?? (typeof price === "number" ? price : null)
                    : null,
              cost: mappedCost,
            });
          });
        });

        if (variantStockData.length > 0) {
          await prisma.variantInventory.createMany({
            data: variantStockData,
          });
        }
      }

      if (layerData.length > 0) {
        await prisma.inventoryCostLayer.createMany({
          data: layerData,
        });
      }
    }

    if (
      (normalizedBarcode || normalizedVariants.some((variant) => variant.barcode)) &&
      platformDraftDiffers(platformProduct, platformSubmissionDraft)
    ) {
      await queuePlatformProductSubmission({
        platformProductId: platformProduct?.id ?? null,
        submittedByUserId: session.user.id,
        submittedFromKioscoId: kioscoId,
        barcode: platformSubmissionDraft.barcode,
        businessActivity: platformProduct?.businessActivity ?? currentBusinessActivity,
        name: platformSubmissionDraft.name,
        brand: platformSubmissionDraft.brand,
        categoryName: platformSubmissionDraft.categoryName,
        description: platformSubmissionDraft.description,
        presentation: platformSubmissionDraft.presentation,
        image: platformSubmissionDraft.image,
        variants: platformSubmissionDraft.variants,
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
    const variantInventoriesToUpdate = await prisma.variantInventory.findMany({
      where: {
        branchId,
        variant: {
          productId: { in: normalizedProductIds },
        },
      },
      select: { id: true, price: true },
    });

    const transactions = inventoryToUpdate.map((inventory) =>
      prisma.inventoryRecord.update({
        where: { id: inventory.id },
        data: { price: Math.round(inventory.price * multiplier) },
      }),
    );
    const variantTransactions = variantInventoriesToUpdate
      .filter((inventory) => typeof inventory.price === "number" && Number.isFinite(inventory.price))
      .map((inventory) =>
        prisma.variantInventory.update({
          where: { id: inventory.id },
          data: { price: Math.round((inventory.price ?? 0) * multiplier) },
        }),
      );
    await prisma.$transaction([...transactions, ...variantTransactions]);

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
