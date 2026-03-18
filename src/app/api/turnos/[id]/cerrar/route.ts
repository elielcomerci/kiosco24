import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  canManageShiftLifecycle,
  computeShiftExpectedAmount,
  createShiftForbiddenResponse,
} from "@/lib/shift-access";

// POST /api/turnos/[id]/cerrar
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { closingAmount, note } = await req.json();
  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, name: true },
      },
    },
  });

  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shift.branchId !== branchId || shift.closedAt) {
    return NextResponse.json({ error: "Turno invalido" }, { status: 404 });
  }

  if (!canManageShiftLifecycle(session.user as any, shift)) {
    return createShiftForbiddenResponse(shift);
  }
  const expectedAmount = await computeShiftExpectedAmount(id, shift.openingAmount);

  const difference = closingAmount - expectedAmount;

  const closedShift = await prisma.shift.update({
    where: { id },
    data: {
      closingAmount,
      expectedAmount,
      difference,
      note,
      closedAt: new Date(),
    },
  });

  return NextResponse.json(closedShift);
}
