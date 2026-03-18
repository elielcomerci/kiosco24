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

// GET /api/productos/[id] - get a single product with branch inventory
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const inventory = await prisma.inventoryRecord.findUnique({
    where: { productId_branchId: { productId: id, branchId: branchId! } },
    include: {
      product: {
        include: {
          variants: {
            include: {
              inventory: {
                where: { branchId: branchId! },
              },
            },
          },
        },
      },
    } as any,
  }) as any;

  if (!inventory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: inventory.product.id,
    name: inventory.product.name,
    emoji: inventory.product.emoji,
    barcode: inventory.product.barcode,
    image: inventory.product.image,
    brand: inventory.product.brand,
    description: inventory.product.description,
    presentation: inventory.product.presentation,
    platformProductId: inventory.product.platformProductId,
    price: inventory.price,
    cost: inventory.cost,
    stock: inventory.stock,
    minStock: inventory.minStock,
    showInGrid: inventory.showInGrid,
    variants: inventory.product.variants.map((variant: any) => ({
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
      stock: variant.inventory[0]?.stock ?? 0,
      minStock: variant.inventory[0]?.minStock ?? 0,
    })),
  });
}

// PATCH /api/productos/[id] - update product name/barcode and branch inventory
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const body = await req.json();
  const {
    name,
    emoji,
    barcode,
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

  const product = await prisma.product.findFirst({
    where: { id, kioscoId: kioscoId! },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const normalizedVariants = normalizeVariantPayload(variants);
  const normalizedBarcode = barcode?.trim() || null;
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
      ...(name !== undefined && { name: name.trim() }),
      ...(emoji !== undefined && { emoji }),
      ...((barcode !== undefined || variants !== undefined) && { barcode: effectiveBarcode }),
      ...(image !== undefined && { image }),
      ...(brand !== undefined && { brand: brand?.trim() || null }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(presentation !== undefined && { presentation: presentation?.trim() || null }),
      ...(categoryId !== undefined && { categoryId }),
      ...((barcode !== undefined || variants !== undefined) && {
        platformProductId: platformProduct?.id ?? null,
      }),
      ...(variants !== undefined && {
        variants: {
          deleteMany: {
            id: { notIn: normalizedVariants.filter((variant) => variant.id).map((variant) => variant.id) },
          },
          create: normalizedVariants
            .filter((variant) => !variant.id)
            .map((variant) => ({
              name: variant.name,
              barcode: variant.barcode,
            })),
          update: normalizedVariants
            .filter((variant) => variant.id)
            .map((variant) => ({
              where: { id: variant.id },
              data: {
                name: variant.name,
                barcode: variant.barcode,
              },
            })),
        },
      } as any),
    },
  });

  if (variants !== undefined) {
    const updatedProduct = await (prisma.product.findUnique({
      where: { id },
      include: { variants: true } as any,
    }) as any);

    if (updatedProduct) {
      for (const variant of normalizedVariants) {
        const actualVariant = updatedProduct.variants.find((existingVariant: any) =>
          variant.id ? existingVariant.id === variant.id : existingVariant.name === variant.name,
        );

        if (!actualVariant) {
          continue;
        }

        await (prisma as any).variantInventory.upsert({
          where: {
            variantId_branchId: {
              variantId: actualVariant.id,
              branchId: branchId!,
            },
          },
          create: {
            variantId: actualVariant.id,
            branchId: branchId!,
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
    where: { productId_branchId: { productId: id, branchId: branchId! } },
    create: {
      productId: id,
      branchId: branchId!,
      price: price ?? 0,
      cost: cost ?? null,
      stock: stock ?? null,
      minStock: minStock ?? null,
      showInGrid: showInGrid ?? true,
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
      name: name?.trim() ?? product.name,
      brand: brand ?? product.brand,
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
      name: name?.trim() ?? product.name,
      brand: brand ?? product.brand,
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

// DELETE /api/productos/[id] - delete product globally
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, kioscoId: kioscoId! },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
