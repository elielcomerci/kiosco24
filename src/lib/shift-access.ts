import { type Shift, type UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type SessionUserLike = {
  role?: UserRole | null;
  employeeId?: string | null;
};

export type ShiftWithEmployee = Shift & {
  employee?: {
    id: string;
    name: string;
  } | null;
};

export function getShiftResponsibleName(shift: { employeeName: string; employee?: { name: string } | null }) {
  return shift.employee?.name || shift.employeeName || "Dueño";
}

export function canOperateShift(user: SessionUserLike, shift: { employeeId: string | null }) {
  if (user.role === "EMPLOYEE") {
    return Boolean(user.employeeId && shift.employeeId && user.employeeId === shift.employeeId);
  }

  return !shift.employeeId;
}

export function canManageShiftLifecycle(user: SessionUserLike, shift: { employeeId: string | null }) {
  if (user.role === "EMPLOYEE") {
    return Boolean(user.employeeId && shift.employeeId && user.employeeId === shift.employeeId);
  }

  return true;
}

export function createShiftForbiddenResponse(shift: { employeeName: string; employee?: { name: string } | null }) {
  return NextResponse.json(
    {
      error: `La caja esta a nombre de ${getShiftResponsibleName(shift)}.`,
      code: "SHIFT_OWNER_REQUIRED",
    },
    { status: 403 },
  );
}

export async function getActiveShift(branchId: string) {
  return prisma.shift.findFirst({
    where: { branchId, closedAt: null },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { openedAt: "desc" },
  });
}

export async function computeShiftExpectedAmount(shiftId: string, openingAmount: number) {
  const [cashSales, expenses, withdrawals] = await Promise.all([
    prisma.sale.aggregate({
      where: { shiftId, paymentMethod: "CASH", voided: false },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: { shiftId },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { shiftId },
      _sum: { amount: true },
    }),
  ]);

  return (
    openingAmount +
    (cashSales._sum.total ?? 0) -
    (expenses._sum.amount ?? 0) -
    (withdrawals._sum.amount ?? 0)
  );
}
