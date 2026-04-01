import { Prisma, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getActiveShift } from "@/lib/shift-access";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(null);
  }

  const { branchId } = await getBranchContext(req, session.user.id);
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

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId || !kioscoId) {
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
      const employeeWhere: Prisma.EmployeeWhereInput = {
        id: employeeId,
        branches: { some: { id: branchId } },
        active: true,
      };

      const employee = await prisma.employee.findFirst({
        where: employeeWhere,
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
      
      // OWNER puede operar incluso si hay un turno activo
      // Solo bloqueamos a empleados que no son el responsable
      if (currentShift && sessionRole !== UserRole.OWNER) {
        // Verificar si el usuario actual es el responsable del turno activo
        if (sessionRole === UserRole.EMPLOYEE && currentShift.employeeId !== sessionEmployeeId) {
          throw new Error("ACTIVE_SHIFT_EXISTS");
        }
      }

      const assigneeOpenShift = await tx.shift.findFirst({
        where: {
          closedAt: null,
          branchId: { not: branchId },
          branch: { kioscoId },
          ...(finalEmployeeId
            ? { employeeId: finalEmployeeId }
            : { employeeId: null, employeeName: finalEmployeeName }),
        },
        select: {
          id: true,
          openedAt: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { openedAt: "desc" },
      });

      if (assigneeOpenShift) {
        const otherBranchName = assigneeOpenShift.branch.name;
        throw new Error(`ASSIGNEE_ALREADY_OPEN:${otherBranchName}`);
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

    if (error instanceof Error && error.message.startsWith("ASSIGNEE_ALREADY_OPEN:")) {
      const branchName = error.message.replace("ASSIGNEE_ALREADY_OPEN:", "").trim();
      return NextResponse.json(
        {
          error: `Ese responsable ya tiene un turno abierto en ${branchName}. Cerra o transferi ese turno antes de abrir otra caja.`,
          code: "ASSIGNEE_ALREADY_OPEN",
          branchName,
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
