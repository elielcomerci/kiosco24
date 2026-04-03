import { NextResponse } from "next/server";
import { PlatformSyncMode } from "@prisma/client";

import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { applyInventoryCorrectionToCostLayers } from "@/lib/inventory-cost-consumption";
import { hasBlockingStockLots, summarizeTrackedLots } from "@/lib/inventory-expiry";
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
  stock?: number;
  stockAdjustment?: number;
  minStock: number;
  price: number | null;
  cost: number | null;
};

type ProductInventoryPayload = Prisma.InventoryRecordGetPayload<{
  include: {
    product: {
      include: {
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
      internalCode:
        typeof variant?.internalCode === "string" ? variant.internalCode.trim() || null : null,
      stock:
        typeof variant?.stock === "number"
          ? variant.stock
          : Number.isFinite(Number(variant?.stock))
            ? Number(variant?.stock)
            : undefined,
      stockAdjustment:
        typeof variant?.stockAdjustment === "number"
          ? variant.stockAdjustment
          : Number.isFinite(Number(variant?.stockAdjustment))
            ? Number(variant?.stockAdjustment)
            : undefined,
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;
  const inventory = await prisma.inventoryRecord.findUnique({
    where: { productId_branchId: { productId: id, branchId } },
    include: {
      product: {
        include: {
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
  });

  if (!inventory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lots = await prisma.stockLot.findMany({
    where: {
      branchId,
      productId: id,
      quantity: { gt: 0 },
    },
    select: {
      variantId: true,
      quantity: true,
      expiresOn: true,
    },
  });

  const expirySettings = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      allowNegativeStock: true,
      kiosco: { select: { expiryAlertDays: true } },
    },
  });
  const expiryAlertDays = expirySettings?.kiosco?.expiryAlertDays ?? 30;
  const allowNegativeStock = expirySettings?.allowNegativeStock ?? false;
  const mappedInventory = inventory as ProductInventoryPayload;
  const baseSummary = summarizeTrackedLots(
    mappedInventory.stock,
    lots.filter((lot) => lot.variantId === null),
    expiryAlertDays,
  );
  const variants = mappedInventory.product.variants.map((variant) => {
    const variantLots = lots.filter((lot) => lot.variantId === variant.id);
    const variantSummary = summarizeTrackedLots(variant.inventory[0]?.stock ?? 0, variantLots, expiryAlertDays);
    const availableStock = variantSummary.availableStock ?? (variant.inventory[0]?.stock ?? 0);
    const variantPrice =
      typeof variant.inventory[0]?.price === "number" && Number.isFinite(variant.inventory[0].price)
        ? variant.inventory[0].price
        : mappedInventory.price;
    const variantCost =
      typeof variant.inventory[0]?.cost === "number" && Number.isFinite(variant.inventory[0].cost)
        ? variant.inventory[0].cost
        : mappedInventory.cost;
    const variantFlags = getStockFlags(availableStock, variant.inventory[0]?.minStock ?? 0);

    return {
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
      internalCode: variant.internalCode,
      price: variantPrice,
      cost: variantCost,
      stock: variant.inventory[0]?.stock ?? 0,
      availableStock,
      minStock: variant.inventory[0]?.minStock ?? 0,
      expiredQuantity: variantSummary.expiredQuantity,
      expiringSoonQuantity: variantSummary.expiringSoonQuantity,
      nextExpiryOn: variantSummary.nextExpiryOn,
      hasTrackedLots: variantSummary.hasTrackedLots,
      ...variantFlags,
    };
  });
  const baseAvailableStock = baseSummary.availableStock ?? mappedInventory.stock;
  const baseFlags = getStockFlags(baseAvailableStock, mappedInventory.minStock);
  const aggregateFlags = variants.length > 0
    ? {
        isNegativeStock: variants.some((variant) => variant.isNegativeStock),
        isOutOfStock: variants.length > 0 && variants.every((variant) => !variant.isNegativeStock && variant.isOutOfStock),
        isBelowMinStock:
          variants.some((variant) => variant.isBelowMinStock) ||
          variants.some((variant) => !variant.isNegativeStock && variant.isOutOfStock),
      }
    : baseFlags;
  const platformSyncMode = mappedInventory.product.platformSyncMode ?? PlatformSyncMode.MANUAL;
  const platformUpdateAvailable = hasPlatformSyncUpdate({
    product: {
      id: mappedInventory.product.id,
      barcode: mappedInventory.product.barcode,
      name: mappedInventory.product.name,
      brand: mappedInventory.product.brand,
      description: mappedInventory.product.description,
      presentation: mappedInventory.product.presentation,
      image: mappedInventory.product.image,
      platformProductId: mappedInventory.product.platformProductId,
      platformSyncMode,
      platformSourceUpdatedAt: mappedInventory.product.platformSourceUpdatedAt,
      variants: mappedInventory.product.variants.map((variant) => ({ id: variant.id })),
    },
    platformProduct: mappedInventory.product.platformProduct,
  });

  return NextResponse.json({
    id: mappedInventory.product.id,
    name: mappedInventory.product.name,
    emoji: mappedInventory.product.emoji,
    barcode: mappedInventory.product.barcode,
    internalCode: mappedInventory.product.internalCode,
    image: mappedInventory.product.image,
    brand: mappedInventory.product.brand,
    description: mappedInventory.product.description,
    presentation: mappedInventory.product.presentation,
    supplierName: mappedInventory.product.supplierName,
    notes: mappedInventory.product.notes,
    platformProductId: mappedInventory.product.platformProductId,
    platformSyncMode,
    platformSourceUpdatedAt: mappedInventory.product.platformSourceUpdatedAt,
    platformUpdateAvailable,
    price: mappedInventory.price,
    cost: mappedInventory.cost,
    stock: mappedInventory.stock,
    availableStock: baseAvailableStock,
    minStock: mappedInventory.minStock,
    showInGrid: mappedInventory.showInGrid,
    allowNegativeStock,
    expiredQuantity: variants.length > 0
      ? variants.reduce((sum, variant) => sum + variant.expiredQuantity, 0)
      : baseSummary.expiredQuantity,
    expiringSoonQuantity: variants.length > 0
      ? variants.reduce((sum, variant) => sum + variant.expiringSoonQuantity, 0)
      : baseSummary.expiringSoonQuantity,
    nextExpiryOn: variants.length > 0
      ? variants.reduce<Date | null>((current, variant) => minDate(current, variant.nextExpiryOn), null)
      : baseSummary.nextExpiryOn,
    hasTrackedLots: variants.length > 0
      ? variants.some((variant) => variant.hasTrackedLots)
      : baseSummary.hasTrackedLots,
    ...aggregateFlags,
    variants,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    name,
    emoji,
    barcode,
    internalCode,
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
    stockAdjustment,
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

  const product = await prisma.product.findFirst({
    where: { id, kioscoId },
    include: {
      category: {
        select: {
          name: true,
        },
      },
      variants: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentInventory = await prisma.inventoryRecord.findUnique({
    where: {
      productId_branchId: {
        productId: id,
        branchId,
      },
    },
    select: { stock: true },
  });

  const currentVariantInventories = await prisma.variantInventory.findMany({
    where: {
      branchId,
      variant: {
        productId: id,
      },
    },
    select: {
      variantId: true,
      stock: true,
    },
  });
  const currentVariantStockById = new Map(
    currentVariantInventories.map((inventory) => [inventory.variantId, inventory.stock ?? 0]),
  );

  const normalizedVariants = normalizeVariantPayload(variants);
  const requestedSimpleStock =
    stock !== undefined
      ? typeof stock === "number"
        ? stock
        : Number.isFinite(Number(stock))
          ? Number(stock)
          : currentInventory?.stock ?? 0
      : stockAdjustment !== undefined && typeof stockAdjustment === "number"
        ? (currentInventory?.stock ?? 0) + stockAdjustment
        : currentInventory?.stock ?? 0;
  const computedStock = stock !== undefined ? requestedSimpleStock : (stockAdjustment !== undefined ? requestedSimpleStock : undefined);
  const simpleStockChanged = computedStock !== undefined && computedStock !== (currentInventory?.stock ?? 0);
  const variantStockChanged = normalizedVariants.some((variant) => {
    if (!variant.id) {
      return false;
    }
    
    if (variant.stockAdjustment !== undefined) {
      return true;
    }

    if (typeof variant.stock !== "number") {
      return false;
    }

    return variant.stock !== (currentVariantStockById.get(variant.id) ?? 0);
  });

  if (!hasOperationalAccess && (simpleStockChanged || variantStockChanged)) {
    return NextResponse.json(
      {
        error: "Puedes editar la ficha del producto, pero para mover stock o registrar ajustes primero activa la suscripcion.",
        code: "NO_SUBSCRIPTION_OPERATIONAL",
      },
      { status: 402 },
    );
  }

  const currentVariantIds = product.variants.map((variant) => variant.id);
  const submittedVariantIds = normalizedVariants
    .filter((variant): variant is VariantPayload & { id: string } => Boolean(variant.id))
    .map((variant) => variant.id);
  const deletedVariantIds = currentVariantIds.filter((variantId) => !submittedVariantIds.includes(variantId));

  if (simpleStockChanged && await hasBlockingStockLots(prisma, { branchId, productId: id })) {
    return NextResponse.json(
      { error: "Este producto tiene vencimientos cargados. Ajusta el stock desde Corregir inventario." },
      { status: 409 },
    );
  }

  for (const variant of normalizedVariants) {
    if (!variant.id) {
      continue;
    }
    
    if (variant.stockAdjustment === undefined && typeof variant.stock !== "number") {
      continue;
    }

    const currentVariantStock = currentVariantStockById.get(variant.id) ?? 0;
    const targetVariantStock = variant.stockAdjustment !== undefined && typeof variant.stockAdjustment === "number" 
      ? currentVariantStock + variant.stockAdjustment 
      : (variant.stock ?? currentVariantStock);
      
    if (targetVariantStock === currentVariantStock) {
      continue;
    }

    if (await hasBlockingStockLots(prisma, { branchId, productId: id, variantId: variant.id })) {
      return NextResponse.json(
        { error: `La variante ${variant.name} tiene vencimientos cargados. Ajusta el stock desde Corregir inventario.` },
        { status: 409 },
      );
    }
  }

  if (variants !== undefined) {
    const isSwitchingFromSimpleToVariants = currentVariantIds.length === 0 && normalizedVariants.length > 0;
    const isSwitchingFromVariantsToSimple = currentVariantIds.length > 0 && normalizedVariants.length === 0;

    if (isSwitchingFromSimpleToVariants && await hasBlockingStockLots(prisma, { branchId, productId: id })) {
      return NextResponse.json(
        { error: "Este producto tiene vencimientos cargados. No puedes pasarlo a variantes hasta vaciar esos lotes." },
        { status: 409 },
      );
    }

    if (isSwitchingFromVariantsToSimple) {
      const blockingVariantLot = await prisma.stockLot.findFirst({
        where: {
          branchId,
          productId: id,
          quantity: { gt: 0 },
          NOT: { variantId: null },
        },
        select: { id: true },
      });

      if (blockingVariantLot) {
        return NextResponse.json(
          { error: "Este producto tiene variantes con vencimientos cargados. No puedes quitar las variantes todavía." },
          { status: 409 },
        );
      }
    }

    if (deletedVariantIds.length > 0) {
      const blockingDeletedVariantLot = await prisma.stockLot.findFirst({
        where: {
          branchId,
          productId: id,
          variantId: { in: deletedVariantIds },
          quantity: { gt: 0 },
        },
        select: { variantId: true },
      });

      if (blockingDeletedVariantLot?.variantId) {
        const blockingVariantName =
          product.variants.find((variant) => variant.id === blockingDeletedVariantLot.variantId)?.name ??
          "una variante";

        return NextResponse.json(
          { error: `No puedes eliminar ${blockingVariantName} porque tiene vencimientos cargados.` },
          { status: 409 },
        );
      }
    }
  }

  const resolvedCategory =
    categoryId !== undefined
      ? await resolveCategorySelection(kioscoId, categoryId)
      : {
          categoryId: product.categoryId,
          categoryName: product.category?.name ?? null,
        };
  const normalizedName = name !== undefined ? normalizeCatalogTitle(name) : product.name;
  const normalizedBrand = brand !== undefined ? normalizeCatalogOptionalTitle(brand) : product.brand;
  const normalizedDescription =
    description !== undefined ? normalizeCatalogDescription(description) : product.description;
  const normalizedPresentation =
    presentation !== undefined ? normalizeCatalogOptionalTitle(presentation) : product.presentation;
  const normalizedSupplierName =
    supplierName !== undefined
      ? typeof supplierName === "string"
        ? supplierName.trim() || null
        : null
      : product.supplierName;
  const normalizedNotes =
    notes !== undefined ? (typeof notes === "string" ? notes.trim() || null : null) : product.notes;
  const normalizedImage =
    image !== undefined ? (typeof image === "string" ? image.trim() || null : null) : product.image;
  const normalizedInternalCode =
    internalCode !== undefined
      ? typeof internalCode === "string"
        ? internalCode.trim() || null
        : null
      : product.internalCode;
  const normalizedBarcode = normalizeCatalogBarcode(barcode);
  const effectiveBarcode =
    variants !== undefined && normalizedVariants.length > 0
      ? null
      : barcode !== undefined
        ? normalizedBarcode
        : product.barcode;
  const lookupBarcode =
    effectiveBarcode ?? normalizedVariants.find((variant) => variant.barcode)?.barcode ?? null;
  const platformProduct = lookupBarcode
    ? await findApprovedPlatformProductByBarcode(lookupBarcode)
    : null;
  const nextPlatformSyncMode = normalizePlatformSyncMode(
    platformSyncMode,
    product.platformSyncMode ?? PlatformSyncMode.MANUAL,
  );
  const kioscoSettings = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { pricingMode: true },
  });
  const pricingMode = kioscoSettings?.pricingMode ?? DEFAULT_PRICING_MODE;

  await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: normalizedName }),
      ...(emoji !== undefined && { emoji: typeof emoji === "string" ? emoji : null }),
      ...((barcode !== undefined || variants !== undefined) && { barcode: effectiveBarcode }),
      ...(internalCode !== undefined && { internalCode: normalizedInternalCode }),
      ...(image !== undefined && { image: normalizedImage }),
      ...(brand !== undefined && { brand: normalizedBrand }),
      ...(description !== undefined && { description: normalizedDescription }),
      ...(presentation !== undefined && { presentation: normalizedPresentation }),
      ...(supplierName !== undefined && { supplierName: normalizedSupplierName }),
      ...(notes !== undefined && { notes: normalizedNotes }),
      ...(soldByWeight !== undefined && { soldByWeight: Boolean(soldByWeight) }),
      ...(categoryId !== undefined && {
        categoryId: resolvedCategory.categoryId,
      }),
      ...((barcode !== undefined || variants !== undefined) && {
        platformProductId: platformProduct?.id ?? null,
        platformSourceUpdatedAt: platformProduct?.updatedAt ?? null,
      }),
      ...(platformSyncMode !== undefined && {
        platformSyncMode: nextPlatformSyncMode,
      }),
      ...(variants !== undefined && {
        variants: {
          deleteMany: {
            id: { notIn: normalizedVariants.filter((variant) => variant.id).map((variant) => variant.id!) },
          },
          create: normalizedVariants
            .filter((variant) => !variant.id)
            .map((variant) => ({
              name: variant.name,
              barcode: variant.barcode,
              internalCode: variant.internalCode,
            })),
          update: normalizedVariants
            .filter((variant): variant is VariantPayload & { id: string } => Boolean(variant.id))
            .map((variant) => ({
              where: { id: variant.id },
              data: {
                name: variant.name,
                barcode: variant.barcode,
                internalCode: variant.internalCode,
              },
            })),
        },
      }),
    },
  });

  if (variants !== undefined) {
    const updatedProduct = await prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (updatedProduct) {
      for (const variant of normalizedVariants) {
        const actualVariant = updatedProduct.variants.find((existingVariant) =>
          variant.id ? existingVariant.id === variant.id : existingVariant.name === variant.name,
        );

        if (!actualVariant) {
          continue;
        }

        const previousStock = currentVariantStockById.get(actualVariant.id) ?? 0;
        const nextStock = variant.stockAdjustment !== undefined && typeof variant.stockAdjustment === "number"
          ? previousStock + variant.stockAdjustment
          : typeof variant.stock === "number" ? variant.stock : previousStock;

        await prisma.variantInventory.upsert({
          where: {
            variantId_branchId: {
              variantId: actualVariant.id,
              branchId,
            },
          },
          create: {
            variantId: actualVariant.id,
            branchId,
            stock: nextStock,
            minStock: variant.minStock ?? 0,
            price: variant.price,
            cost: variant.cost,
          },
          update: {
            ...(variant.stock !== undefined || variant.stockAdjustment !== undefined ? { stock: nextStock } : {}),
            ...(variant.minStock !== undefined && { minStock: variant.minStock }),
            ...(variant.price !== undefined && { price: variant.price }),
            ...(variant.cost !== undefined && { cost: variant.cost }),
          },
        });

        if (nextStock < previousStock) {
          await prisma.$transaction(async (tx) => {
            await applyInventoryCorrectionToCostLayers(tx, {
              branchId,
              productId: id,
              variantId: actualVariant.id,
              delta: nextStock - previousStock,
            });
          });
        }
      }
    }
  }

  await prisma.inventoryRecord.upsert({
    where: { productId_branchId: { productId: id, branchId } },
    create: {
      productId: id,
      branchId,
      price: typeof price === "number" ? price : 0,
      cost: typeof cost === "number" ? cost : null,
      stock: computedStock !== undefined ? computedStock : null,
      minStock: typeof minStock === "number" ? minStock : null,
      showInGrid: typeof showInGrid === "boolean" ? showInGrid : true,
    },
    update: {
      ...(price !== undefined && { price }),
      ...(cost !== undefined && { cost }),
      ...(computedStock !== undefined && { stock: computedStock }),
      ...(minStock !== undefined && { minStock }),
      ...(showInGrid !== undefined && { showInGrid }),
    },
  });

  if (computedStock !== undefined && computedStock < (currentInventory?.stock ?? 0)) {
    await prisma.$transaction(async (tx) => {
      await applyInventoryCorrectionToCostLayers(tx, {
        branchId,
        productId: id,
        variantId: null,
        delta: computedStock - (currentInventory?.stock ?? 0),
      });
    });
  }

  if (pricingMode === "SHARED" && (price !== undefined || cost !== undefined || variants !== undefined)) {
    await syncSharedPricingFromBranch(prisma, {
      kioscoId,
      sourceBranchId: branchId,
      productIds: [id],
    });
  }

  const platformSubmissionDraft = buildPlatformSubmissionDraft(platformProduct, {
    barcode: effectiveBarcode,
    name: normalizedName,
    brand: normalizedBrand,
    categoryName: resolvedCategory.categoryName,
    description: normalizedDescription,
    presentation: normalizedPresentation,
    image: normalizedImage,
    variants:
      variants !== undefined
        ? normalizedVariants.map((variant) => ({
            name: variant.name,
            barcode: variant.barcode,
          }))
        : undefined,
  });

  if (
    (effectiveBarcode || normalizedVariants.some((variant) => variant.barcode)) &&
    platformDraftDiffers(platformProduct, platformSubmissionDraft)
  ) {
    await queuePlatformProductSubmission({
      platformProductId: platformProduct?.id ?? null,
      submittedByUserId: session.user.id,
      submittedFromKioscoId: kioscoId,
      barcode: platformSubmissionDraft.barcode,
      name: platformSubmissionDraft.name,
      brand: platformSubmissionDraft.brand,
      categoryName: platformSubmissionDraft.categoryName,
      description: platformSubmissionDraft.description,
      presentation: platformSubmissionDraft.presentation,
      image: platformSubmissionDraft.image,
      variants: platformSubmissionDraft.variants,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco" }, { status: 404 });
  }

  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, kioscoId },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
