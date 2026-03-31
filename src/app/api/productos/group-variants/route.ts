import { NextResponse } from "next/server";

import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { normalizeCatalogOptionalTitle, normalizeCatalogTitle } from "@/lib/catalog-text";
import { prisma } from "@/lib/prisma";

type VariantInput = {
  productId: string;
  name: string;
};

function pickCommonValue<T>(values: Array<T | null | undefined>) {
  const definedValues = values.filter((value): value is T => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return true;
  });
  if (definedValues.length === 0) {
    return null;
  }

  const [firstValue, ...rest] = definedValues;
  return rest.every((value) => value === firstValue) ? firstValue : null;
}

function pickFirstValue<T>(values: Array<T | null | undefined>) {
  return (
    values.find((value): value is T => {
      if (value === null || value === undefined) {
        return false;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      return true;
    }) ?? null
  );
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

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const productIds: string[] = Array.isArray(body?.productIds)
    ? Array.from(
        new Set(
          body.productIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0),
        ),
      )
    : [];
  const variantInputs: VariantInput[] = Array.isArray(body?.variants)
    ? body.variants.filter(
        (value: unknown): value is VariantInput =>
          Boolean(
            value &&
              typeof value === "object" &&
              typeof (value as VariantInput).productId === "string" &&
              typeof (value as VariantInput).name === "string",
          ),
      )
    : [];
  const baseProductId = typeof body?.baseProductId === "string" ? body.baseProductId : productIds[0] ?? "";

  const parentName = normalizeCatalogTitle(body?.parentName);

  if (productIds.length < 2) {
    return NextResponse.json({ error: "Selecciona al menos 2 productos para agrupar." }, { status: 400 });
  }

  if (!parentName) {
    return NextResponse.json({ error: "Ingresa un nombre para el producto padre." }, { status: 400 });
  }

  if (!productIds.includes(baseProductId)) {
    return NextResponse.json({ error: "El producto base debe estar dentro de la seleccion." }, { status: 400 });
  }

  const selectedProducts = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      kioscoId,
    },
    include: {
      inventory: true,
      variants: {
        select: { id: true },
      },
    },
  });

  if (selectedProducts.length !== productIds.length) {
    return NextResponse.json({ error: "No se pudieron validar todos los productos seleccionados." }, { status: 400 });
  }

  if (selectedProducts.some((product) => product.variants.length > 0)) {
    return NextResponse.json({ error: "Por ahora solo se pueden agrupar productos simples." }, { status: 400 });
  }

  const salesUsingProducts = await prisma.saleItem.count({
    where: {
      productId: { in: productIds },
    },
  });

  if (salesUsingProducts > 0) {
    return NextResponse.json(
      { error: "Al menos uno de los productos ya tiene ventas registradas. Agrupalo manualmente desde cero para evitar inconsistencias." },
      { status: 409 },
    );
  }

  const orderedProducts = productIds
    .map((id) => selectedProducts.find((product) => product.id === id))
    .filter((product): product is (typeof selectedProducts)[number] => Boolean(product));

  const variantNameByProductId = new Map(
    variantInputs.map((variant) => [variant.productId, normalizeCatalogOptionalTitle(variant.name) || variant.name.trim()]),
  );
  const normalizedVariantNames = orderedProducts.map((product) => ({
    productId: product.id,
    name: variantNameByProductId.get(product.id) || product.name,
  }));
  const variantNameSet = new Set<string>();
  for (const variant of normalizedVariantNames) {
    const key = variant.name.trim().toLocaleLowerCase("es-AR");
    if (!key) {
      return NextResponse.json({ error: "Todas las variantes deben tener nombre." }, { status: 400 });
    }
    if (variantNameSet.has(key)) {
      return NextResponse.json({ error: "Los nombres de variantes no pueden repetirse." }, { status: 400 });
    }
    variantNameSet.add(key);
  }

  const branches = await prisma.branch.findMany({
    where: { kioscoId },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const baseProduct = orderedProducts.find((product) => product.id === baseProductId);
    if (!baseProduct) {
      throw new Error("No se pudo identificar el producto base.");
    }

    await tx.product.update({
      where: { id: baseProduct.id },
      data: {
        name: parentName,
        barcode: null,
        internalCode: null,
        emoji:
          pickCommonValue(orderedProducts.map((product) => product.emoji)) ??
          baseProduct.emoji ??
          pickFirstValue(orderedProducts.map((product) => product.emoji)),
        image: baseProduct.image ?? pickFirstValue(orderedProducts.map((product) => product.image)),
        brand: pickCommonValue(orderedProducts.map((product) => product.brand)) ?? baseProduct.brand,
        description:
          pickCommonValue(orderedProducts.map((product) => product.description)) ?? baseProduct.description,
        presentation:
          pickCommonValue(orderedProducts.map((product) => product.presentation)) ?? baseProduct.presentation,
        supplierName:
          pickCommonValue(orderedProducts.map((product) => product.supplierName)) ?? baseProduct.supplierName,
        categoryId: pickCommonValue(orderedProducts.map((product) => product.categoryId)) ?? baseProduct.categoryId,
        platformProductId: null,
        platformSourceUpdatedAt: null,
      },
    });

    const variantMappings: Array<{
      sourceProductId: string;
      variantId: string;
      variantName: string;
    }> = [];

    for (const variant of normalizedVariantNames) {
      const sourceProduct = orderedProducts.find((product) => product.id === variant.productId);
      if (!sourceProduct) {
        continue;
      }

      const createdVariant = await tx.variant.create({
        data: {
          productId: baseProduct.id,
          name: variant.name,
          barcode: sourceProduct.barcode,
          internalCode: sourceProduct.internalCode,
        },
        select: { id: true },
      });

      variantMappings.push({
        sourceProductId: sourceProduct.id,
        variantId: createdVariant.id,
        variantName: variant.name,
      });
    }

    const parentInventoryData = branches.map((branch) => {
      const branchInventories = orderedProducts
        .map((product) => product.inventory.find((record) => record.branchId === branch.id))
        .filter((record): record is NonNullable<typeof record> => Boolean(record));
      const priceCandidates = branchInventories.map((record) => record.price).filter((value) => Number.isFinite(value) && value > 0);
      const costCandidates = branchInventories
        .map((record) => record.cost)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

      return {
        productId: baseProduct.id,
        branchId: branch.id,
        stock: 0,
        minStock: 0,
        showInGrid: branchInventories.some((record) => record.showInGrid),
        price: priceCandidates.length > 0 ? Math.min(...priceCandidates) : 0,
        cost: costCandidates.length > 0 ? Math.min(...costCandidates) : null,
      };
    });

    if (parentInventoryData.length > 0) {
      for (const inventory of parentInventoryData) {
        await tx.inventoryRecord.upsert({
          where: {
            productId_branchId: {
              productId: inventory.productId,
              branchId: inventory.branchId,
            },
          },
          create: inventory,
          update: {
            stock: 0,
            minStock: 0,
            showInGrid: inventory.showInGrid,
            price: inventory.price,
            cost: inventory.cost,
          },
        });
      }
    }

    const variantInventoryData = variantMappings.flatMap((mapping) => {
      const sourceProduct = orderedProducts.find((product) => product.id === mapping.sourceProductId);
      if (!sourceProduct) {
        return [];
      }

      return branches.map((branch) => {
        const sourceInventory = sourceProduct.inventory.find((record) => record.branchId === branch.id);
        return {
          variantId: mapping.variantId,
          branchId: branch.id,
          stock: sourceInventory?.stock ?? 0,
          minStock: sourceInventory?.minStock ?? 0,
          price: sourceInventory?.price ?? null,
          cost: sourceInventory?.cost ?? null,
        };
      });
    });

    if (variantInventoryData.length > 0) {
      await tx.variantInventory.createMany({
        data: variantInventoryData,
      });
    }

    for (const mapping of variantMappings) {
      await tx.stockLot.updateMany({
        where:
          mapping.sourceProductId === baseProduct.id
            ? { productId: mapping.sourceProductId, variantId: null }
            : { productId: mapping.sourceProductId },
        data: {
          productId: baseProduct.id,
          variantId: mapping.variantId,
        },
      });

      await tx.restockItem.updateMany({
        where:
          mapping.sourceProductId === baseProduct.id
            ? { productId: mapping.sourceProductId, variantId: null }
            : { productId: mapping.sourceProductId },
        data: {
          productId: baseProduct.id,
          variantId: mapping.variantId,
        },
      });

      await tx.inventoryCostLayer.updateMany({
        where:
          mapping.sourceProductId === baseProduct.id
            ? { productId: mapping.sourceProductId, variantId: null }
            : { productId: mapping.sourceProductId },
        data: {
          productId: baseProduct.id,
          variantId: mapping.variantId,
        },
      });

      await tx.saleCostAllocation.updateMany({
        where:
          mapping.sourceProductId === baseProduct.id
            ? { productId: mapping.sourceProductId, variantId: null }
            : { productId: mapping.sourceProductId },
        data: {
          productId: baseProduct.id,
          variantId: mapping.variantId,
        },
      });

      await tx.negativeStockReservation.updateMany({
        where:
          mapping.sourceProductId === baseProduct.id
            ? { productId: mapping.sourceProductId, variantId: null }
            : { productId: mapping.sourceProductId },
        data: {
          productId: baseProduct.id,
          variantId: mapping.variantId,
        },
      });
    }

    await tx.product.deleteMany({
      where: {
        id: { in: productIds.filter((id) => id !== baseProduct.id) },
      },
    });

    return {
      id: baseProduct.id,
      name: parentName,
      variants: variantMappings.length,
    };
  });

  return NextResponse.json({ success: true, product: result });
}
