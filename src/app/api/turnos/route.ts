import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getActiveShift } from "@/lib/shift-access";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(null);
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json(null);
  }

  const activeShift = await getActiveShift(branchId);
  return NextResponse.json(activeShift);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { openingAmount, employeeId } = await req.json();
  const openingAmountNumber = Number(openingAmount);

  if (!Number.isFinite(openingAmountNumber) || openingAmountNumber < 0) {
    return NextResponse.json({ error: "El monto de apertura no es valido." }, { status: 400 });
  }

  const sessionEmployeeId = session.user.employeeId;
  const sessionRole = session.user.role;
  let finalEmployeeId: string | null = sessionEmployeeId ?? null;
  let finalEmployeeName = session.user.name || "Dueño";

  if (sessionRole !== UserRole.EMPLOYEE) {
    if (typeof employeeId === "string" && employeeId) {
      const employee = await prisma.employee.findFirst({
        where: {
          id: employeeId,
          branchId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          suspendedUntil: true,
        },
      });

      if (!employee || (employee.suspendedUntil && employee.suspendedUntil > new Date())) {
        return NextResponse.json({ error: "Empleado no disponible para abrir el turno." }, { status: 400 });
      }

      finalEmployeeId = employee.id;
      finalEmployeeName = employee.name;
    } else {
      finalEmployeeId = null;
      finalEmployeeName = "Dueño";
    }
  }

  try {
    const shift = await prisma.$transaction(async (tx) => {
      const currentShift = await getActiveShift(branchId, tx);
      if (currentShift) {
        throw new Error("ACTIVE_SHIFT_EXISTS");
      }

      const createdShift = await tx.shift.create({
        data: {
          branchId,
          openingAmount: openingAmountNumber,
          employeeId: finalEmployeeId,
          employeeName: finalEmployeeName,
        },
        include: { employee: true },
      });

      const activated = await tx.branch.updateMany({
        where: {
          id: branchId,
          activeShiftId: null,
        },
        data: {
          activeShiftId: createdShift.id,
        },
      });

      if (activated.count !== 1) {
        throw new Error("ACTIVE_SHIFT_EXISTS");
      }

      return createdShift;
    });

    return NextResponse.json(shift);
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_SHIFT_EXISTS") {
      return NextResponse.json({ error: "Ya hay un turno abierto en esta sucursal." }, { status: 409 });
    }

    throw error;
  }
}
