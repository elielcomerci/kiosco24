import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";
import { getActiveShift } from "@/lib/shift-access";

// GET /api/turnos — returns the active (open) shift for the branch, if any
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null);

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json(null);

  const activeShift = await getActiveShift(branchId);

  return NextResponse.json(activeShift);
}

// POST /api/turnos/abrir
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const currentShift = await getActiveShift(branchId);
  if (currentShift) {
    return NextResponse.json({ error: "Ya hay un turno abierto en esta sucursal." }, { status: 409 });
  }

  const { openingAmount, employeeId } = await req.json();

  const sessionEmployeeId = (session.user as any)?.employeeId as string | undefined;
  const sessionRole = (session.user as any)?.role as string | undefined;
  let finalEmployeeId: string | null = sessionEmployeeId ?? null;
  let finalEmployeeName = (session.user as any)?.name || "Dueño";

  if (sessionRole !== "EMPLOYEE") {
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

  const shift = await prisma.shift.create({
    data: {
      branchId,
      openingAmount: Number(openingAmount),
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
    },
    include: { employee: true },
  });

  return NextResponse.json(shift);
}
