import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";

// GET /api/turnos — returns the active (open) shift for the branch, if any
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null);

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json(null);

  const activeShift = await prisma.shift.findFirst({
    where: { branchId, closedAt: null },
    include: { employee: true },
    orderBy: { openedAt: "desc" },
  });

  return NextResponse.json(activeShift);
}

// POST /api/turnos/abrir
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { openingAmount, employeeName } = await req.json();

  // Handle employee attribution
  const sessionEmployeeId = (session?.user as any)?.employeeId;
  let finalEmployeeId = sessionEmployeeId || null;
  let finalEmployeeName = employeeName || (session?.user as any)?.name || "Dueño";

  if (!finalEmployeeId && employeeName) {
    let emp = await prisma.employee.findFirst({ where: { branchId, name: employeeName } });
    if (!emp) {
      emp = await prisma.employee.create({ data: { branchId, name: employeeName } });
    }
    finalEmployeeId = emp.id;
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
