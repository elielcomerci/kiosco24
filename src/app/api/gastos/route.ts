import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { canOperateShift, createShiftForbiddenResponse, getActiveShift } from "@/lib/shift-access";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  if (session.user.employeeRole === "CASHIER") {
    return NextResponse.json({ error: "No tenés permiso para registrar gastos." }, { status: 403 });
  }

  const { amount, reason, note } = await req.json();
  const amountNumber = Number(amount);

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return NextResponse.json({ error: "El monto del gasto no es valido." }, { status: 400 });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift) {
    return NextResponse.json({ error: "No hay un turno abierto en esta sucursal." }, { status: 409 });
  }

  if (!canOperateShift(session.user, activeShift)) {
    return createShiftForbiddenResponse(activeShift);
  }

  const createdByEmployeeId =
    session.user.role === UserRole.EMPLOYEE ? session.user.employeeId ?? null : null;

  const expense = await prisma.expense.create({
    data: {
      branchId,
      amount: amountNumber,
      reason,
      note: note ?? null,
      shiftId: activeShift.id,
      createdByEmployeeId,
    },
  });

  return NextResponse.json(expense);
}
