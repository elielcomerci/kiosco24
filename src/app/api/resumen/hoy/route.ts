import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getResumenHoy } from "@/lib/resumen-hoy";
import { todayART, todayRange } from "@/lib/utils";
import { NextResponse } from "next/server";

// GET /api/resumen/hoy
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.role === "EMPLOYEE" && session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const dayKey = todayART();
  const { start: dayStart } = todayRange();

  const firstShift = await prisma.shift.findFirst({
    where: { branchId, openedAt: { gte: dayStart } },
    orderBy: { openedAt: "asc" },
    select: {
      id: true,
      openingAmount: true,
      openedAt: true,
    },
  });

  const data = await getResumenHoy(
    branchId,
    dayKey,
    firstShift?.id ?? "",
    firstShift?.openingAmount ?? 0,
    firstShift?.openedAt.toISOString() ?? ""
  );

  return NextResponse.json(data);
}
