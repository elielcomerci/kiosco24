import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";
import { InvalidEmployeePinError, prepareEmployeePinForStorage } from "@/lib/employee-pin";

// PATCH /api/empleados/[id] — update employee
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.branchId !== branchId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, pin, active, suspendedUntil } = await req.json();
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
    return NextResponse.json({ error: "Fecha de suspensión inválida" }, { status: 400 });
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

  const updated = await prisma.employee.update({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      suspendedUntil: true,
      pin: true,
    },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(hashedPin !== undefined && { pin: hashedPin }),
      ...(active !== undefined && { active }),
      ...(parsedSuspendedUntil !== undefined && { suspendedUntil: parsedSuspendedUntil }),
    },
  });

  // Si se está suspendiendo al empleado, cerrar automáticamente su turno actual si lo hubiese
  if (
    active === false ||
    (parsedSuspendedUntil instanceof Date && parsedSuspendedUntil > new Date())
  ) {
    const openShift = await prisma.shift.findFirst({
      where: { employeeId: id, closedAt: null }
    });

    if (openShift) {
      await prisma.shift.update({
        where: { id: openShift.id },
        data: {
          closedAt: new Date(),
          note: openShift.note 
            ? `${openShift.note}\n(Cerrado automáticamente — empleado suspendido)`
            : 'Cerrado automáticamente — empleado suspendido'
        }
      });
    }
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    active: updated.active,
    suspendedUntil: updated.suspendedUntil,
    hasPin: Boolean(updated.pin),
  });
}

// DELETE /api/empleados/[id] — delete employee
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.branchId !== branchId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shiftCount = await prisma.shift.count({ where: { employeeId: id } });
  const restockCount = await prisma.restockEvent.count({ where: { employeeId: id } });

  if (shiftCount > 0 || restockCount > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar un empleado con historial de turnos o ingresos. Considerá 'Suspenderlo' desactivando su cuenta." }, 
      { status: 409 }
    );
  }

  await prisma.employee.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
