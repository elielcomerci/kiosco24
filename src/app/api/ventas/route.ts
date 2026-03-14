import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { todayRange } from "@/lib/utils";
import { getBranchId } from "@/lib/branch";

// GET /api/ventas — list today's sales
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { start, end } = todayRange();
  const sales = await prisma.sale.findMany({
    where: { branchId, createdAt: { gte: start, lte: end }, voided: false },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sales);
}

// POST /api/ventas — create a sale
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json();
  const { items, total, paymentMethod, receivedAmount, creditCustomerId } = body;

  // Find active shift
  const activeShift = await prisma.shift.findFirst({
    where: { branchId, closedAt: null },
    orderBy: { openedAt: "desc" },
  });

  const sale = await prisma.sale.create({
    data: {
      branchId,
      total,
      paymentMethod,
      receivedAmount: receivedAmount ?? null,
      shiftId: activeShift?.id ?? null,
      creditCustomerId: creditCustomerId ?? null,
      items: {
        create: items.map((item: any) => ({
          productId: item.productId ?? null,
          variantId: (item as any).variantId ?? null,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          cost: item.cost ?? null,
        })),
      },
    } as any,
    include: { items: true },
  });

  // Update stock from the local branch inventory
  for (const item of items) {
    if ((item as any).variantId) {
      // Descontar de variante
      const vInv = await (prisma as any).variantInventory.findUnique({
        where: { variantId_branchId: { variantId: (item as any).variantId, branchId } }
      });
      if (vInv?.stock !== null && vInv?.stock !== undefined) {
        await (prisma as any).variantInventory.update({
          where: { id: vInv.id },
          data: { stock: Math.max(0, vInv.stock - item.quantity) }
        });
      }
    } else if (item.productId) {
      // Descontar de producto base
      const inventory = await (prisma as any).inventoryRecord.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId } }
      });
      
      if (inventory?.stock !== null && inventory?.stock !== undefined) {
        await (prisma as any).inventoryRecord.update({
          where: { id: inventory.id },
          data: { stock: Math.max(0, inventory.stock - item.quantity) },
        });
      }
    }
  }

  // Update credit customer balance if fiado
  if (creditCustomerId) {
    await prisma.creditCustomer.update({
      where: { id: creditCustomerId },
      data: { balance: { increment: total } },
    });
  }

  return NextResponse.json(sale);
}
