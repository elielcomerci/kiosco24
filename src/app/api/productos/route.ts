import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

// GET /api/productos — list all active products for the branch
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) return NextResponse.json([], { status: 200 });

  // Filter and map the catalog through the branch's active inventory
  const inventory = await prisma.inventoryRecord.findMany({
    where: { branchId, showInGrid: true },
    include: { product: true },
    orderBy: { product: { name: "asc" } },
  });

  const products = inventory.map((inv: any) => ({
    id: inv.product.id,
    name: inv.product.name,
    emoji: inv.product.emoji,
    barcode: inv.product.barcode,
    price: inv.price,
    cost: inv.cost,
    stock: inv.stock,
    minStock: inv.minStock,
  }));

  return NextResponse.json(products);
}

// POST /api/productos — create a single product (used in scanning/adding manually)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
  if (!kioscoId || !branchId) return NextResponse.json({ error: "No kiosco/branch" }, { status: 404 });

  const body = await req.json();
  const { name, barcode, emoji, price, cost, stock } = body;

  try {
    // Create global product
    const product = await prisma.product.create({
      data: {
        name,
        barcode,
        emoji,
        kioscoId,
      },
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
          price: price || 0,
          cost: cost || 0,
          stock: b.id === branchId ? (stock || 0) : 0,
        }))
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
  const { percentage, productIds } = body;

  if (percentage && productIds) {
    // Bulk percentage update for the branch
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
    return NextResponse.json({ success: true, count: transactions.length });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
