import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/turnos/[id]/cerrar
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { closingAmount, note } = await req.json();

  const shift = await prisma.shift.findUnique({
    where: { id },
  });

  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Calcular expectedAmount (opening + ventas cash - gastos - retiros)
  const cashSales = await prisma.sale.aggregate({
    where: { shiftId: id, paymentMethod: "CASH", voided: false },
    _sum: { total: true },
  });

  const expenses = await prisma.expense.aggregate({
    where: { shiftId: id },
    _sum: { amount: true },
  });

  const withdrawals = await prisma.withdrawal.aggregate({
    where: { shiftId: id },
    _sum: { amount: true },
  });

  const expectedAmount =
    shift.openingAmount +
    (cashSales._sum.total ?? 0) -
    (expenses._sum.amount ?? 0) -
    (withdrawals._sum.amount ?? 0);

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
