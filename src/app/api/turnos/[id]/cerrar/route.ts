import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import {
  canManageShiftLifecycle,
  computeShiftExpectedAmount,
  createShiftForbiddenResponse,
  getActiveShift,
} from "@/lib/shift-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { closingAmount, note } = await req.json();
  const closingAmountNumber = Number(closingAmount);
  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  if (!Number.isFinite(closingAmountNumber) || closingAmountNumber < 0) {
    return NextResponse.json({ error: "El monto de cierre no es valido." }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, name: true },
      },
    },
  });

  if (!shift) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (shift.branchId !== branchId || shift.closedAt) {
    return NextResponse.json({ error: "Turno invalido" }, { status: 404 });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift || activeShift.id !== shift.id) {
    return NextResponse.json({ error: "Solo se puede cerrar el turno activo actual." }, { status: 409 });
  }

  if (!canManageShiftLifecycle(session.user, shift)) {
    return createShiftForbiddenResponse(shift);
  }

  const closedShift = await prisma.$transaction(async (tx) => {
    const expectedAmount = await computeShiftExpectedAmount(id, shift.openingAmount, tx);
    const difference = closingAmountNumber - expectedAmount;

    const updatedShift = await tx.shift.update({
      where: { id },
      data: {
        closingAmount: closingAmountNumber,
        expectedAmount,
        difference,
        note,
        closedAt: new Date(),
      },
    });

    await tx.branch.update({
      where: { id: branchId },
      data: { activeShiftId: null },
    });

    return updatedShift;
  });

  return NextResponse.json(closedShift);
}
