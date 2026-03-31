import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { InvalidEmployeePinError, verifyEmployeePinValue } from "@/lib/employee-pin";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type VerifyEmployeePinRequestBody = {
  employeeId?: string;
  pin?: string;
};

// POST /api/empleados/verificar-pin
// Body: { employeeId: string, pin: string }
// Returns: { ok: boolean }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { branchId } = await getBranchContext(req, session.user.id);
    const { employeeId, pin } = (await req.json()) as VerifyEmployeePinRequestBody;

    if (!branchId) {
      return NextResponse.json({ ok: false, error: "Sucursal no encontrada" }, { status: 404 });
    }

    if (!employeeId || !pin) {
      return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
    }

    // Find the employee inside the active branch context
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        branches: { some: { id: branchId } },
        active: true,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: new Date() } },
        ],
      },
      select: { id: true, pin: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Empleado no encontrado" }, { status: 404 });
    }

    if (!employee.pin) {
      // Employee has no PIN — access granted
      return NextResponse.json({ ok: true });
    }

    const verification = await verifyEmployeePinValue(employee.pin, pin);

    if (verification.ok && verification.upgradedHash) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { pin: verification.upgradedHash },
      });
    }

    return NextResponse.json({ ok: verification.ok });
  } catch (error) {
    if (error instanceof InvalidEmployeePinError) {
      return NextResponse.json({ ok: false, error: "PIN invalido" }, { status: 400 });
    }
    console.error("Error verifying PIN:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
