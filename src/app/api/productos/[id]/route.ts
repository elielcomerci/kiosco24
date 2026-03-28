import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { hasBlockingStockLots, summarizeTrackedLots } from "@/lib/inventory-expiry";
import { Prisma, prisma } from "@/lib/prisma";
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

type ProductInventoryPayload = Prisma.InventoryRecordGetPayload<{
  include: {
    product: {
      include: {
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
      name: typeof variant?.name === "string" ? variant.name.trim() : "",
      barcode:
        typeof variant?.barcode === "string" && variant.barcode.trim() ? variant.barcode.trim() : null,
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
    const variantFlags = getStockFlags(availableStock, variant.inventory[0]?.minStock ?? 0);

    return {
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
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
    categoryId,
    price,
    cost,
    stock,
    minStock,
    showInGrid,
    variants,
  } = body;

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
  const simpleStockChanged = stock !== undefined && typeof stock === "number" && stock !== (currentInventory?.stock ?? 0);
  const currentVariantIds = product.variants.map((variant) => variant.id);
  const submittedVariantIds = normalizedVariants
    .filter((variant): variant is VariantPayload & { id: string } => Boolean(variant.id))
    .map((variant) => variant.id);
  const deletedVariantIds = currentVariantIds.filter((variantId) => !submittedVariantIds.includes(variantId));

  if (simpleStockChanged && await hasBlockingStockLots(prisma, { branchId, productId: id })) {
    return NextResponse.json(
      { error: "Este producto tiene vencimientos cargados. Ajusta el stock desde Cargar stock." },
      { status: 409 },
    );
  }

  for (const variant of normalizedVariants) {
    if (!variant.id || typeof variant.stock !== "number") {
      continue;
    }

    const currentVariantStock = currentVariantStockById.get(variant.id) ?? 0;
    if (variant.stock === currentVariantStock) {
      continue;
    }

    if (await hasBlockingStockLots(prisma, { branchId, productId: id, variantId: variant.id })) {
      return NextResponse.json(
        { error: `La variante ${variant.name} tiene vencimientos cargados. Ajusta el stock desde Cargar stock.` },
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
  const normalizedBarcode = typeof barcode === "string" ? barcode.trim() || null : null;
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

  await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: typeof name === "string" ? name.trim() : product.name }),
      ...(emoji !== undefined && { emoji: typeof emoji === "string" ? emoji : null }),
      ...((barcode !== undefined || variants !== undefined) && { barcode: effectiveBarcode }),
      ...(internalCode !== undefined && {
        internalCode: typeof internalCode === "string" ? internalCode.trim() || null : null,
      }),
      ...(image !== undefined && { image: typeof image === "string" ? image : null }),
      ...(brand !== undefined && { brand: typeof brand === "string" ? brand.trim() || null : null }),
      ...(description !== undefined && {
        description: typeof description === "string" ? description.trim() || null : null,
      }),
      ...(presentation !== undefined && {
        presentation: typeof presentation === "string" ? presentation.trim() || null : null,
      }),
      ...(supplierName !== undefined && {
        supplierName: typeof supplierName === "string" ? supplierName.trim() || null : null,
      }),
      ...(notes !== undefined && { notes: typeof notes === "string" ? notes.trim() || null : null }),
      ...(categoryId !== undefined && {
        categoryId: resolvedCategory.categoryId,
      }),
      ...((barcode !== undefined || variants !== undefined) && {
        platformProductId: platformProduct?.id ?? null,
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
            })),
          update: normalizedVariants
            .filter((variant): variant is VariantPayload & { id: string } => Boolean(variant.id))
            .map((variant) => ({
              where: { id: variant.id },
              data: {
                name: variant.name,
                barcode: variant.barcode,
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
            stock: variant.stock ?? 0,
            minStock: variant.minStock ?? 0,
          },
          update: {
            ...(variant.stock !== undefined && { stock: variant.stock }),
            ...(variant.minStock !== undefined && { minStock: variant.minStock }),
          },
        });
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
      stock: typeof stock === "number" ? stock : null,
      minStock: typeof minStock === "number" ? minStock : null,
      showInGrid: typeof showInGrid === "boolean" ? showInGrid : true,
    },
    update: {
      ...(price !== undefined && { price }),
      ...(cost !== undefined && { cost }),
      ...(stock !== undefined && { stock }),
      ...(minStock !== undefined && { minStock }),
      ...(showInGrid !== undefined && { showInGrid }),
    },
  });

  if (
    (effectiveBarcode || normalizedVariants.some((variant) => variant.barcode)) &&
    platformDraftDiffers(platformProduct, {
      barcode: effectiveBarcode,
      name: typeof name === "string" ? name.trim() : product.name,
      brand: brand ?? product.brand,
      categoryName: resolvedCategory.categoryName,
      description: description ?? product.description,
      presentation: presentation ?? product.presentation,
      image: image ?? product.image,
      variants:
        variants !== undefined
          ? normalizedVariants.map((variant) => ({
              name: variant.name,
              barcode: variant.barcode,
            }))
          : undefined,
    })
  ) {
    await queuePlatformProductSubmission({
      platformProductId: platformProduct?.id ?? null,
      submittedByUserId: session.user.id,
      submittedFromKioscoId: kioscoId,
      barcode: effectiveBarcode,
      name: typeof name === "string" ? name.trim() : product.name,
      brand: brand ?? product.brand,
      categoryName: resolvedCategory.categoryName,
      description: description ?? product.description,
      presentation: presentation ?? product.presentation,
      image: image ?? product.image,
      variants:
        variants !== undefined
          ? normalizedVariants.map((variant) => ({
              name: variant.name,
              barcode: variant.barcode,
            }))
          : undefined,
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
