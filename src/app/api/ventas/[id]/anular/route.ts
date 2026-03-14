import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/ventas/[id]/anular
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Revert credit balance if it was a fiado
  if (sale.creditCustomerId) {
    await prisma.creditCustomer.update({
      where: { id: sale.creditCustomerId },
      data: { balance: { decrement: sale.total } },
    });
  }

  // Restore stock in the specific branch
  for (const item of sale.items) {
    if ((item as any).variantId) {
      // Restaurar stock de variante
      const vInv = await (prisma as any).variantInventory.findUnique({
        where: {
          variantId_branchId: {
            variantId: (item as any).variantId,
            branchId: sale.branchId,
          },
        },
      });
      if (vInv?.stock !== null && vInv?.stock !== undefined) {
        await (prisma as any).variantInventory.update({
          where: { id: vInv.id },
          data: { stock: vInv.stock + item.quantity },
        });
      }
    } else if (item.productId) {
      // Restaurar stock de producto base
      const inventory = await (prisma as any).inventoryRecord.findUnique({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: sale.branchId,
          },
        },
      });

      if (inventory?.stock !== null && inventory?.stock !== undefined) {
        await (prisma as any).inventoryRecord.update({
          where: { id: inventory.id },
          data: { stock: inventory.stock + item.quantity },
        });
      }
    }
  }

  await prisma.sale.update({
    where: { id },
    data: { voided: true, voidedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
