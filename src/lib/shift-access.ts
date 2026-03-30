import { type UserRole, type EmployeeRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { Prisma, prisma, type Shift } from "@/lib/prisma";

type SessionUserLike = {
  role?: UserRole | null;
  employeeId?: string | null;
  employeeRole?: EmployeeRole | null;
};

type ShiftDbClient = Prisma.TransactionClient | typeof prisma;

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

  return true;
}

export function canManageShiftLifecycle(user: SessionUserLike, shift: { employeeId: string | null }) {
  if (user.role === "EMPLOYEE") {
    // Managers can manage any shift (override empty or other employees)
    if (user.employeeRole === "MANAGER") return true;
    
    // Others can only manage their own
    return Boolean(user.employeeId && shift.employeeId && user.employeeId === shift.employeeId);
  }

  return true;
}

export function canCreateShiftReminder(
  user: SessionUserLike,
  shift: { employeeId: string | null } | null,
) {
  if (user.role !== "EMPLOYEE") {
    return true;
  }

  if (user.employeeRole === "MANAGER") {
    return true;
  }

  if (!shift?.employeeId || !user.employeeId) {
    return false;
  }

  return shift.employeeId === user.employeeId;
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

export async function getActiveShift(branchId: string, db: ShiftDbClient = prisma): Promise<ShiftWithEmployee | null> {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      activeShiftId: true,
      activeShift: {
        include: {
          employee: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!branch) {
    return null;
  }

  if (branch.activeShift && !branch.activeShift.closedAt) {
    return branch.activeShift as ShiftWithEmployee;
  }

  const latestOpenShift = await db.shift.findFirst({
    where: { branchId, closedAt: null },
    include: {
      employee: {
        select: { id: true, name: true },
      },
    },
    orderBy: { openedAt: "desc" },
  });

  if (!latestOpenShift) {
    if (branch.activeShiftId) {
      await db.branch.update({
        where: { id: branchId },
        data: { activeShiftId: null },
      });
    }
    return null;
  }

  if (branch.activeShiftId !== latestOpenShift.id) {
    await db.branch.update({
      where: { id: branchId },
      data: { activeShiftId: latestOpenShift.id },
    });
  }

  return latestOpenShift as ShiftWithEmployee;
}

export async function computeShiftExpectedAmount(
  shiftId: string,
  openingAmount: number,
  db: ShiftDbClient = prisma,
) {
  const [cashSales, expenses, withdrawals] = await Promise.all([
    db.sale.aggregate({
      where: { shiftId, paymentMethod: "CASH", voided: false },
      _sum: { total: true },
    }),
    db.expense.aggregate({
      where: { shiftId },
      _sum: { amount: true },
    }),
    db.withdrawal.aggregate({
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
