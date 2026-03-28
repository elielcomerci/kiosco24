import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchContext } from "@/lib/branch";
import { restoreLotConsumptions } from "@/lib/inventory-expiry";
import { prisma } from "@/lib/prisma";
import { createShiftForbiddenResponse, getActiveShift } from "@/lib/shift-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { id } = await params;
  const { branchId } = await getBranchContext(req, session.user.id);

  const sale = await prisma.sale.findFirst({
    where: {
      id,
      ...(session.user.role === UserRole.EMPLOYEE
        ? { branchId: branchId ?? "__blocked__" }
        : { branch: { kiosco: { ownerId: session.user.id } } }),
    },
    include: { items: { include: { lotConsumptions: true } } },
  });

  if (!sale) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (sale.voided) {
    return NextResponse.json({ ok: true, alreadyVoided: true });
  }

  if (session.user.role === UserRole.EMPLOYEE) {
    const activeShift = branchId ? await getActiveShift(branchId) : null;
    if (!activeShift || activeShift.employeeId !== session.user.employeeId) {
      return createShiftForbiddenResponse(activeShift ?? { employeeName: "otro responsable" });
    }
  }

  await prisma.$transaction(async (tx) => {
    const currentSale = await tx.sale.findUnique({
      where: { id: sale.id },
      include: { items: { include: { lotConsumptions: true } } },
    });

    if (!currentSale || currentSale.voided) {
      return;
    }

    if (currentSale.creditCustomerId) {
      await tx.creditCustomer.updateMany({
        where: {
          id: currentSale.creditCustomerId,
          branchId: currentSale.branchId,
        },
        data: {
          balance: { decrement: currentSale.total },
        },
      });
    }

    for (const item of currentSale.items) {
      if (item.variantId) {
        const variantInventory = await tx.variantInventory.findFirst({
          where: { variantId: item.variantId, branchId: currentSale.branchId },
          select: { id: true, stock: true },
        });

        if (variantInventory && typeof variantInventory.stock === "number") {
          await tx.variantInventory.update({
            where: { id: variantInventory.id },
            data: { stock: { increment: item.quantity } },
          });
        }

        if (item.productId) {
          await restoreLotConsumptions(tx, {
            branchId: currentSale.branchId,
            productId: item.productId,
            variantId: item.variantId,
            consumptions: item.lotConsumptions,
          });
        }
        continue;
      }

      if (item.productId) {
        const inventory = await tx.inventoryRecord.findFirst({
          where: { productId: item.productId, branchId: currentSale.branchId },
          select: { id: true, stock: true },
        });

        if (inventory && typeof inventory.stock === "number") {
          await tx.inventoryRecord.update({
            where: { id: inventory.id },
            data: { stock: { increment: item.quantity } },
          });
        }

        await restoreLotConsumptions(tx, {
          branchId: currentSale.branchId,
          productId: item.productId,
          consumptions: item.lotConsumptions,
        });
      }
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { voided: true, voidedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
