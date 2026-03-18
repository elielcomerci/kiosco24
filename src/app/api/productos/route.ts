import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";
import {
  findApprovedPlatformProductByBarcode,
  platformDraftDiffers,
  queuePlatformProductSubmission,
} from "@/lib/platform-catalog";

function normalizeVariantPayload(variants: any[] | undefined) {
  return (variants ?? [])
    .map((variant) => ({
      id: typeof variant?.id === "string" ? variant.id : undefined,
      name: typeof variant?.name === "string" ? variant.name.trim() : "",
      barcode: typeof variant?.barcode === "string" && variant.barcode.trim() ? variant.barcode.trim() : null,
      stock: typeof variant?.stock === "number" ? variant.stock : 0,
      minStock: typeof variant?.minStock === "number" ? variant.minStock : 0,
    }))
    .filter((variant) => variant.name);
}

// GET /api/productos — list all active products for the branch
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) return NextResponse.json([], { status: 200 });

  // Filter and map the catalog through the branch's active inventory
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
    } as any,
    orderBy: { product: { name: "asc" } },
  });

  const products = inventory.map((inv: any) => {
    const hasVariantStock = inv.product.variants.some((v: any) => (v.inventory[0]?.stock ?? 0) > 0);
    const hasBaseStock = (inv.stock ?? 0) > 0;
    const hasStock = inv.product.variants.length > 0 ? hasVariantStock : hasBaseStock;
    const readyForSale =
      inv.showInGrid &&
      inv.price > 0 &&
      typeof inv.cost === "number" &&
      inv.cost > 0 &&
      hasStock &&
      (inv.product.category?.showInGrid ?? true);

    return {
    id: inv.product.id,
    name: inv.product.name,
    emoji: inv.product.emoji,
    barcode: inv.product.barcode,
    image: inv.product.image,
    brand: inv.product.brand,
    description: inv.product.description,
    presentation: inv.product.presentation,
    platformProductId: inv.product.platformProductId,
    categoryId: inv.product.categoryId,
    price: inv.price,
    cost: inv.cost,
    stock: inv.stock,
    minStock: inv.minStock,
    showInGrid: inv.showInGrid,
    readyForSale,
    categoryShowInGrid: inv.product.category?.showInGrid ?? true,
    variants: inv.product.variants.map((v: any) => ({
      id: v.id,
      name: v.name,
      barcode: v.barcode,
      stock: v.inventory[0]?.stock ?? 0,
      minStock: v.inventory[0]?.minStock ?? 0,
    })),
  };
  });

  return NextResponse.json(products);
}

// POST /api/productos — create a single product (used in scanning/adding manually)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
  if (!kioscoId || !branchId) return NextResponse.json({ error: "No kiosco/branch" }, { status: 404 });

  const body = await req.json();
  const {
    name,
    barcode,
    emoji,
    image,
    brand,
    description,
    presentation,
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
    const normalizedBarcode = normalizedVariants.length > 0 ? null : barcode?.trim() || null;
    const lookupBarcode =
      normalizedBarcode ?? normalizedVariants.find((variant) => variant.barcode)?.barcode ?? null;
    const platformProduct = lookupBarcode
      ? await findApprovedPlatformProductByBarcode(lookupBarcode)
      : null;

    // Create global product
    const product = await prisma.product.create({
      data: {
        name: name?.trim(),
        barcode: normalizedBarcode,
        emoji,
        image,
        brand: brand?.trim() || null,
        description: description?.trim() || null,
        presentation: presentation?.trim() || null,
        categoryId,
        platformProductId: platformProduct?.id ?? null,
        kioscoId,
        variants: normalizedVariants.length ? {
          create: normalizedVariants.map((v: any) => ({
            name: v.name,
            barcode: v.barcode || null,
          })),
        } : undefined,
      } as any,
      include: { variants: true } as any
    });

    // Propagar a TODAS las sucursales del Kiosco
    const branches = await prisma.branch.findMany({
      where: { kioscoId }
    });

    if (branches.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: branches.map((b: any) => ({
          productId: product.id,
          branchId: b.id,
          price: price ?? 0,
          cost: cost ?? null,
          stock: b.id === branchId ? (stock ?? 0) : 0,
          minStock: b.id === branchId ? (minStock ?? 0) : 0,
          showInGrid: showInGrid ?? true,
        }))
      });

      // Propagar VariantInventory
      if (product.variants?.length > 0 && normalizedVariants.length > 0) {
        const variantStockData: any[] = [];
        branches.forEach((b: any) => {
          product.variants.forEach((pv: any) => {
            const reqVar = normalizedVariants.find((v: any) => v.name === pv.name);
            variantStockData.push({
              variantId: pv.id,
              branchId: b.id,
              stock: b.id === branchId ? (reqVar?.stock || 0) : 0,
              minStock: b.id === branchId ? (reqVar?.minStock || 0) : 0,
            });
          });
        });
        await (prisma as any).variantInventory.createMany({
          data: variantStockData,
        });
      }
    }

    if (
      (normalizedBarcode || normalizedVariants.some((variant) => variant.barcode)) &&
      platformDraftDiffers(platformProduct, {
        barcode: normalizedBarcode,
        name: name?.trim(),
        brand,
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
        name: name?.trim(),
        brand,
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

// PATCH /api/productos — bulk update prices or specific product properties
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json();
  const { percentage, productIds, categoryId } = body;

  if (!productIds || productIds.length === 0) {
    return NextResponse.json({ error: "No products provided" }, { status: 400 });
  }

  // Si se envió un porcentaje, actualizamos todos los inventarios de esa branch
  if (percentage) {
    const multiplier = 1 + percentage / 100;
    const inventoryToUpdate = await prisma.inventoryRecord.findMany({
      where: { branchId, productId: { in: productIds } },
    });

    const transactions = inventoryToUpdate.map(
      (inv: { id: string; price: number }) =>
        prisma.inventoryRecord.update({
          where: { id: inv.id },
          data: { price: Math.round(inv.price * multiplier) },
        })
    );
    await prisma.$transaction(transactions);
  }

  // Si se envió categoryId (incluido nulo para borrar categoría), actualizamos los productos globales
  if (categoryId !== undefined) {
    await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { categoryId: categoryId || null },
    });
  }

  return NextResponse.json({ success: true, count: productIds.length });
}
