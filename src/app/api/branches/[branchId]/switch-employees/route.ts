import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * GET /api/branches/[branchId]/switch-employees
 *
 * Devuelve los empleados activos de la sucursal y el accessKey de la sucursal,
 * para que un usuario already-authenticated pueda hacer un cambio de sesión rápido
 * sin saber el código de acceso.
 *
 * Solo accesible para usuarios autenticados (owner o employee de esa sucursal).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { branchId } = await params;
  const userId = session.user.id;
  const userRole = session.user.role;
  const userBranchId = session.user.branchId;
  const userEmployeeId = session.user.employeeId;

  // Verificar que el usuario tiene acceso a esta sucursal
  let hasAccess = false;

  if (userRole === "OWNER") {
    // El dueño tiene acceso si la sucursal pertenece a su kiosco
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, kiosco: { ownerId: userId } },
      select: { id: true },
    });
    hasAccess = Boolean(branch);
  } else if (userRole === "EMPLOYEE") {
    // El empleado tiene acceso si está asignado a esta sucursal
    hasAccess = userBranchId === branchId;
    if (!hasAccess && userEmployeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: userEmployeeId, branches: { some: { id: branchId } } },
        select: { id: true },
      });
      hasAccess = Boolean(emp);
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Sin acceso a esta sucursal" }, { status: 403 });
  }

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        accessKey: true,
        employees: {
          where: {
            active: true,
            OR: [
              { suspendedUntil: null },
              { suspendedUntil: { lt: new Date() } },
            ],
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            pin: true,
          },
        },
      },
    });

    if (!branch?.accessKey) {
      return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      accessKey: branch.accessKey,
      employees: branch.employees.map((e) => ({
        id: e.id,
        name: e.name,
        hasPin: Boolean(e.pin),
      })),
    });
  } catch (error) {
    console.error("[switch-employees]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
