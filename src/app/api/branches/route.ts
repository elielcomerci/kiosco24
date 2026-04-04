import { NextResponse } from "next/server";

import { guardSetupAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/branches - Lista todas las sucursales del usuario logueado
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  try {
    const kiosco = await prisma.kiosco.findUnique({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        branches: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!kiosco) {
      return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ branches: kiosco.branches });
  } catch (error) {
    console.error("Error fetching branches:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/branches - Crea una nueva sucursal y la provisiona con el catalogo
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  try {
    const { name, logoUrl, primaryColor, sourceBranchId } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "El nombre de la sucursal es requerido" }, { status: 400 });
    }

    const kiosco = await prisma.kiosco.findUnique({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        pricingMode: true,
        products: {
          select: { id: true },
        },
        branches: {
          orderBy: { createdAt: "asc" },
          select: { id: true },
        },
      },
    });

    if (!kiosco) {
      return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
    }

    const preferredSourceBranchId =
      typeof sourceBranchId === "string" && sourceBranchId
        ? sourceBranchId
        : req.headers.get("x-branch-id");
    const fallbackSourceBranchId =
      kiosco.branches.find((branch) => branch.id !== preferredSourceBranchId)?.id ??
      kiosco.branches[0]?.id ??
      null;
    const resolvedSourceBranchId =
      kiosco.pricingMode === "SHARED"
        ? kiosco.branches.some((branch) => branch.id === preferredSourceBranchId)
          ? preferredSourceBranchId
          : fallbackSourceBranchId
        : null;

    const sharedPricingRecords =
      kiosco.pricingMode === "SHARED" && resolvedSourceBranchId
        ? await prisma.inventoryRecord.findMany({
            where: {
              branchId: resolvedSourceBranchId,
              productId: { in: kiosco.products.map((product) => product.id) },
            },
            select: {
              productId: true,
              price: true,
              cost: true,
            },
          })
        : [];
    const sharedPricingByProduct = new Map(
      sharedPricingRecords.map((record) => [record.productId, record]),
    );

    const newBranch = await prisma.branch.create({
      data: {
        name,
        logoUrl,
        primaryColor,
        kioscoId: kiosco.id,
      },
    });

    if (kiosco.products.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: kiosco.products.map((product) => {
          const sharedPricing = sharedPricingByProduct.get(product.id);

          return {
            productId: product.id,
            branchId: newBranch.id,
            price: kiosco.pricingMode === "SHARED" ? (sharedPricing?.price ?? 0) : 0,
            cost: kiosco.pricingMode === "SHARED" ? (sharedPricing?.cost ?? null) : 0,
            stock: 0,
            showInGrid: true,
          };
        }),
      });
    }

    return NextResponse.json({ branch: newBranch }, { status: 201 });
  } catch (error) {
    console.error("Error creating branch:", error);
    return NextResponse.json({ error: "Error interno al crear sucursal" }, { status: 500 });
  }
}
