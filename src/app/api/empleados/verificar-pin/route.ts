import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/empleados/verificar-pin
// Body: { employeeId: string, pin: string }
// Returns: { ok: boolean }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { employeeId, pin } = await req.json();

    if (!employeeId || !pin) {
      return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
    }

    // Find the employee, ensuring it belongs to a branch owned by this user
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        branch: {
          kiosco: {
            ownerId: session.user.id,
          },
        },
      },
      select: { pin: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: false, error: "Empleado no encontrado" }, { status: 404 });
    }

    if (!employee.pin) {
      // Employee has no PIN — access granted
      return NextResponse.json({ ok: true });
    }

    const isCorrect = employee.pin === pin;
    return NextResponse.json({ ok: isCorrect });
  } catch (error) {
    console.error("Error verifying PIN:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
