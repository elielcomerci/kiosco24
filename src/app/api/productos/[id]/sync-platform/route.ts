import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  buildPlatformSyncUpdateData,
  type PlatformSyncApplyMode,
} from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";

function normalizeMode(value: unknown): PlatformSyncApplyMode {
  return value === "image" || value === "text" ? value : "all";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Solo el owner puede sincronizar datos desde la base general." },
      { status: 403 },
    );
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco" }, { status: 404 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const mode = normalizeMode(body?.mode);
  const product = await prisma.product.findFirst({
    where: { id, kioscoId },
    select: {
      id: true,
      barcode: true,
      name: true,
      brand: true,
      description: true,
      presentation: true,
      image: true,
      platformProductId: true,
      platformSyncMode: true,
      platformSourceUpdatedAt: true,
      variants: { select: { id: true } },
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
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  if (!product.platformProductId) {
    return NextResponse.json(
      {
        error: "Este producto no esta vinculado a la base general.",
      },
      { status: 409 },
    );
  }

  if (!product.platformProduct) {
    return NextResponse.json(
      {
        error: "No encontramos un origen aprobado para sincronizar.",
      },
      { status: 409 },
    );
  }

  if (product.platformProduct.status !== "APPROVED") {
    return NextResponse.json(
      {
        error: "No encontramos un origen aprobado para sincronizar.",
      },
      { status: 409 },
    );
  }

  await prisma.product.update({
    where: { id: product.id },
    data: buildPlatformSyncUpdateData(product, product.platformProduct, mode),
  });

  return NextResponse.json({ success: true });
}
