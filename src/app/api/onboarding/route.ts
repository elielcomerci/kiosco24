import { auth } from "@/lib/auth";
import {
  DEFAULT_KIOSCO_CATEGORIES,
  DEFAULT_KIOSCO_PRODUCTS,
} from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/onboarding - called after first login to set up the kiosco
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoName } = await req.json().catch(() => ({ kioscoName: "Mi Kiosco" }));

  const existing = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: {
      branches: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (existing) {
    return NextResponse.json({
      kiosco: existing,
      alreadySetup: true,
      branchId: existing.branches[0]?.id ?? null,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const kiosco = await tx.kiosco.create({
      data: {
        name: kioscoName ?? "Mi Kiosco",
        ownerId: session.user.id,
      },
    });

    const mainBranch = await tx.branch.create({
      data: {
        name: "Sucursal Principal",
        kioscoId: kiosco.id,
      },
    });

    const createdCategories = await Promise.all(
      DEFAULT_KIOSCO_CATEGORIES.map((category) =>
        tx.category.create({
          data: {
            name: category.name,
            color: category.color,
            kioscoId: kiosco.id,
            showInGrid: true,
          },
        }),
      ),
    );

    const categoryIdByKey = new Map(
      createdCategories.map((category, index) => [DEFAULT_KIOSCO_CATEGORIES[index].key, category.id]),
    );

    const createdProducts = [];

    for (const product of DEFAULT_KIOSCO_PRODUCTS) {
      const createdProduct = await tx.product.create({
        data: {
          name: product.name,
          barcode: product.barcode,
          brand: product.brand ?? null,
          description: product.description ?? null,
          presentation: product.presentation ?? null,
          categoryId: categoryIdByKey.get(product.categoryKey) ?? null,
          kioscoId: kiosco.id,
        },
      });

      createdProducts.push(createdProduct);
    }

    await tx.inventoryRecord.createMany({
      data: createdProducts.map((product, index) => ({
        productId: product.id,
        branchId: mainBranch.id,
        price: DEFAULT_KIOSCO_PRODUCTS[index].price,
        cost: DEFAULT_KIOSCO_PRODUCTS[index].cost,
        stock: 0,
        minStock: 0,
        showInGrid: true,
      })),
    });

    return {
      kiosco,
      mainBranch,
    };
  });

  return NextResponse.json({
    kiosco: created.kiosco,
    alreadySetup: false,
    branchId: created.mainBranch.id,
  });
}

// GET /api/onboarding - check if kiosco is set up
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ setup: false });

  const kiosco = await prisma.kiosco.findUnique({ where: { ownerId: session.user.id } });
  return NextResponse.json({ setup: !!kiosco, kiosco });
}
