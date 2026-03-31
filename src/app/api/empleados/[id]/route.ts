import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmployeeRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getBranchContext } from "@/lib/branch";
import { InvalidEmployeePinError, prepareEmployeePinForStorage } from "@/lib/employee-pin";

type UpdateEmployeeRequestBody = {
  name?: string;
  pin?: string | null;
  active?: boolean;
  suspendedUntil?: string | null;
  role?: EmployeeRole;
  branchIds?: string[];
};

// PATCH /api/empleados/[id] - update employee
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ 
    where: { id },
    include: { branches: { select: { id: true } } }
  });

  if (!employee || employee.kioscoId !== kioscoId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, pin, active, suspendedUntil, role, branchIds } =
    (await req.json()) as UpdateEmployeeRequestBody;
  const parsedSuspendedUntil =
    suspendedUntil === undefined
      ? undefined
      : suspendedUntil
        ? new Date(suspendedUntil)
        : null;

  if (
    parsedSuspendedUntil !== undefined &&
    parsedSuspendedUntil !== null &&
    Number.isNaN(parsedSuspendedUntil.getTime())
  ) {
    return NextResponse.json({ error: "Fecha de suspension invalida" }, { status: 400 });
  }

  let hashedPin: string | null | undefined;
  try {
    hashedPin = await prepareEmployeePinForStorage(pin);
  } catch (error) {
    if (error instanceof InvalidEmployeePinError) {
      return NextResponse.json({ error: "El PIN debe tener entre 1 y 6 digitos numericos." }, { status: 400 });
    }
    throw error;
  }

  const shouldSuspendNow =
    active === false ||
    (parsedSuspendedUntil instanceof Date && parsedSuspendedUntil > new Date());

  const employeeData: Prisma.EmployeeUpdateInput = {};

  if (name !== undefined) {
    employeeData.name = name.trim();
  }

  if (hashedPin !== undefined) {
    employeeData.pin = hashedPin;
  }

  if (active !== undefined) {
    employeeData.active = active;
  }

  if (parsedSuspendedUntil !== undefined) {
    employeeData.suspendedUntil = parsedSuspendedUntil;
  }

  if (role !== undefined) {
    employeeData.role = role;
  }

  if (branchIds !== undefined && Array.isArray(branchIds)) {
    employeeData.branches = {
      set: branchIds.map((branchId) => ({ id: branchId })),
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextEmployee = await tx.employee.update({
      where: { id },
      include: {
        branches: { select: { id: true, name: true } }
      },
      data: employeeData,
    });

    if (shouldSuspendNow) {
      const openShifts = await tx.shift.findMany({
        where: {
          employeeId: id,
          closedAt: null,
        },
      });

      for (const openShift of openShifts) {
        await tx.shift.update({
          where: { id: openShift.id },
          data: {
            closedAt: new Date(),
            note: openShift.note
              ? `${openShift.note}\n(Cerrado automaticamente - empleado suspendido)`
              : "Cerrado automaticamente - empleado suspendido",
          },
        });

        await tx.branch.updateMany({
          where: {
            id: openShift.branchId,
            activeShiftId: openShift.id,
          },
          data: {
            activeShiftId: null,
          },
        });
      }
    }

    return nextEmployee;
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    role: updated.role,
    branches: updated.branches,
    active: updated.active,
    suspendedUntil: updated.suspendedUntil,
    hasPin: Boolean(updated.pin),
  });
}

// DELETE /api/empleados/[id] - delete employee
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.kioscoId !== kioscoId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shiftCount = await prisma.shift.count({ where: { employeeId: id } });
  const restockCount = await prisma.restockEvent.count({ where: { employeeId: id } });

  if (shiftCount > 0 || restockCount > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar un empleado con historial de turnos o ingresos. Considera suspenderlo desactivando su cuenta.",
      },
      { status: 409 },
    );
  }

  await prisma.employee.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
