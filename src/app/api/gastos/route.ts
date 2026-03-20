import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";
import { canOperateShift, createShiftForbiddenResponse, getActiveShift } from "@/lib/shift-access";

// POST /api/gastos
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { amount, reason, note } = await req.json();
  const amountNumber = Number(amount);

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return NextResponse.json({ error: "El monto del gasto no es valido." }, { status: 400 });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift) {
    return NextResponse.json({ error: "No hay un turno abierto en esta sucursal." }, { status: 409 });
  }

  if (!canOperateShift(session.user as any, activeShift)) {
    return createShiftForbiddenResponse(activeShift);
  }

  const expense = await prisma.expense.create({
    data: {
      branchId,
      amount: amountNumber,
      reason,
      note: note ?? null,
      shiftId: activeShift.id,
      createdByEmployeeId: (session?.user as any)?.role === "EMPLOYEE" ? (session?.user as any)?.employeeId || null : null,
    },
  });

  return NextResponse.json(expense);
}
