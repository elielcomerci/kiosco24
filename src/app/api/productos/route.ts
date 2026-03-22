import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
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

type ProductListInventory = Prisma.InventoryRecordGetPayload<{
  include: {
    product: {
      include: {
        category: {
          select: {
            showInGrid: true;
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json([], { status: 200 });
  }

  const inventory = await prisma.inventoryRecord.findMany({
    where: { branchId },
    include: {
      product: {
        include: {
          category: { select: { showInGrid: true } },
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

  const products = inventory.map((record: ProductListInventory) => {
    const hasVariantStock = record.product.variants.some((variant) => (variant.inventory[0]?.stock ?? 0) > 0);
    const hasBaseStock = (record.stock ?? 0) > 0;
    const hasStock = record.product.variants.length > 0 ? hasVariantStock : hasBaseStock;
    const readyForSale =
      record.showInGrid &&
      record.price > 0 &&
      typeof record.cost === "number" &&
      record.cost > 0 &&
      hasStock &&
      (record.product.category?.showInGrid ?? true);

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
      categoryId: record.product.categoryId,
      price: record.price,
      cost: record.cost,
      stock: record.stock,
      minStock: record.minStock,
      showInGrid: record.showInGrid,
      readyForSale,
      categoryShowInGrid: record.product.category?.showInGrid ?? true,
      variants: record.product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        barcode: variant.barcode,
        stock: variant.inventory[0]?.stock ?? 0,
        minStock: variant.inventory[0]?.minStock ?? 0,
      })),
    };
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    categoryId,
    price,
    cost,
    stock,
    minStock,
    showInGrid,
    variants,
  } = body;

  try {
    const normalizedVariants = normalizeVariantPayload(variants);
    const resolvedCategory = await resolveCategorySelection(kioscoId, categoryId);
    const normalizedBarcode =
      normalizedVariants.length > 0 || typeof barcode !== "string" ? null : barcode.trim() || null;
    const lookupBarcode =
      normalizedBarcode ?? normalizedVariants.find((variant) => variant.barcode)?.barcode ?? null;
    const platformProduct = lookupBarcode
      ? await findApprovedPlatformProductByBarcode(lookupBarcode)
      : null;

    const product = await prisma.product.create({
      data: {
        name: typeof name === "string" ? name.trim() : "",
        barcode: normalizedBarcode,
        internalCode: typeof internalCode === "string" ? internalCode.trim() || null : null,
        emoji: typeof emoji === "string" ? emoji : null,
        image: typeof image === "string" ? image : null,
        brand: typeof brand === "string" ? brand.trim() || null : null,
        description: typeof description === "string" ? description.trim() || null : null,
        presentation: typeof presentation === "string" ? presentation.trim() || null : null,
        supplierName: typeof supplierName === "string" ? supplierName.trim() || null : null,
        notes: typeof notes === "string" ? notes.trim() || null : null,
        categoryId: resolvedCategory.categoryId,
        platformProductId: platformProduct?.id ?? null,
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
          price: typeof price === "number" ? price : 0,
          cost: typeof cost === "number" ? cost : null,
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
        name: typeof name === "string" ? name.trim() : "",
        brand,
        categoryName: resolvedCategory.categoryName,
        description,
        presentation,
        image,
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
        name: typeof name === "string" ? name.trim() : "",
        brand,
        categoryName: resolvedCategory.categoryName,
        description,
        presentation,
        image,
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

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
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
  }

  if (categoryId !== undefined) {
    await prisma.product.updateMany({
      where: { id: { in: normalizedProductIds } },
      data: { categoryId: typeof categoryId === "string" && categoryId ? categoryId : null },
    });
  }

  return NextResponse.json({ success: true, count: normalizedProductIds.length });
}
