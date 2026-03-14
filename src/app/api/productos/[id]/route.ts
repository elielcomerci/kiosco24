import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

// GET /api/productos/[id] — get a single product with branch inventory
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const inventory = await prisma.inventoryRecord.findUnique({
    where: { productId_branchId: { productId: id, branchId: branchId! } },
    include: { product: true },
  });

  if (!inventory)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: inventory.product.id,
    name: inventory.product.name,
    emoji: inventory.product.emoji,
    barcode: inventory.product.barcode,
    price: inventory.price,
    cost: inventory.cost,
    stock: inventory.stock,
    minStock: inventory.minStock,
    showInGrid: inventory.showInGrid,
  });
}

// PATCH /api/productos/[id] — update product name/emoji/barcode and branch inventory
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const body = await req.json();
  const { name, emoji, barcode, price, cost, stock, minStock, showInGrid } = body;

  // Verify product belongs to this kiosco
  const product = await prisma.product.findFirst({
    where: { id, kioscoId: kioscoId! },
  });
  if (!product)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Update global product fields
  await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(emoji !== undefined && { emoji }),
      ...(barcode !== undefined && { barcode: barcode?.trim() || null }),
    },
  });

  // Update branch-specific inventory
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

  return NextResponse.json({ success: true });
}

// DELETE /api/productos/[id] — delete product globally
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kioscoId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, kioscoId: kioscoId! },
  });
  if (!product)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cascade deletes InventoryRecord via schema onDelete: Cascade
  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
