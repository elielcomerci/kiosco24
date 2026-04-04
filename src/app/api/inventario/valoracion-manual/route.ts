import { NextResponse } from "next/server";

import { guardSetupAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  getManualInventoryValuationContext,
  replaceManualInventoryCostLayers,
} from "@/lib/inventory-cost-layers";
import { prisma } from "@/lib/prisma";

type RequestedManualLayer = {
  quantity: number;
  unitCost: number;
};

function normalizeMoney(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId || !kioscoId) {
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const variantId = searchParams.get("variantId");

  if (!productId) {
    return NextResponse.json({ error: "Falta productId." }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      kioscoId,
    },
    include: {
      variants: {
        select: {
          id: true,
          name: true,
          barcode: true,
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  if (variantId && !product.variants.some((variant) => variant.id === variantId)) {
    return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
  }

  const context = await getManualInventoryValuationContext(prisma, {
    branchId,
    productId,
    variantId,
  });

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      image: product.image,
      barcode: product.barcode,
    },
    variant: variantId
      ? product.variants.find((variant) => variant.id === variantId) ?? null
      : null,
    ...context,
    manualLayers: context.manualLayers.map((layer) => ({
      ...layer,
      receivedAt: layer.receivedAt.toISOString(),
    })),
    lockedManualLayers: context.lockedManualLayers.map((layer) => ({
      ...layer,
      receivedAt: layer.receivedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId || !kioscoId) {
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId : "";
  const variantId = typeof body?.variantId === "string" && body.variantId ? body.variantId : null;
  const layers: RequestedManualLayer[] = Array.isArray(body?.layers)
    ? body.layers
        .map((layer: unknown) => ({
          quantity: normalizeQuantity((layer as { quantity?: unknown })?.quantity),
          unitCost: normalizeMoney((layer as { unitCost?: unknown })?.unitCost),
        }))
        .filter(
          (
            layer: {
              quantity: number | null;
              unitCost: number | null;
            },
          ): layer is RequestedManualLayer => layer.quantity !== null && layer.unitCost !== null,
        )
    : [];

  if (!productId) {
    return NextResponse.json({ error: "Falta productId." }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      kioscoId,
    },
    include: {
      variants: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  if (variantId && !product.variants.some((variant) => variant.id === variantId)) {
    return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
  }

  const context = await getManualInventoryValuationContext(prisma, {
    branchId,
    productId,
    variantId,
  });
  const totalQuantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);

  if (totalQuantity > context.editableManualLimit) {
    return NextResponse.json(
      {
        error: `No puedes valorizar manualmente mas de ${context.editableManualLimit} unidades en este estado.`,
      },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await replaceManualInventoryCostLayers(tx, {
      branchId,
      productId,
      variantId,
      layers,
    });
  });

  const nextContext = await getManualInventoryValuationContext(prisma, {
    branchId,
    productId,
    variantId,
  });

  return NextResponse.json({
    success: true,
    ...nextContext,
    manualLayers: nextContext.manualLayers.map((layer) => ({
      ...layer,
      receivedAt: layer.receivedAt.toISOString(),
    })),
    lockedManualLayers: nextContext.lockedManualLayers.map((layer) => ({
      ...layer,
      receivedAt: layer.receivedAt.toISOString(),
    })),
  });
}
