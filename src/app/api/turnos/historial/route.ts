import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchId } from "@/lib/branch";

// GET /api/turnos/historial?from=ISO&to=ISO&limit=20&offset=0
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  const where: Record<string, unknown> = {
    branchId,
    closedAt: { not: null }, // only closed shifts
  };

  if (fromParam && toParam) {
    where.openedAt = {
      gte: new Date(fromParam),
      lte: new Date(toParam),
    };
  }

  const [shifts, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      include: {
        sales: { where: { voided: false }, select: { total: true, paymentMethod: true } },
        expenses: { select: { amount: true } },
        withdrawals: { select: { amount: true } },
      },
      orderBy: { openedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.shift.count({ where }),
  ]);

  const data = shifts.map((s) => ({
    id: s.id,
    employeeName: s.employeeName,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    openingAmount: s.openingAmount,
    closingAmount: s.closingAmount,
    expectedAmount: s.expectedAmount,
    difference: s.difference,
    note: s.note,
    ventas: s.sales.reduce((sum, v) => sum + v.total, 0),
    ventasEfectivo: s.sales
      .filter((v) => v.paymentMethod === "CASH")
      .reduce((sum, v) => sum + v.total, 0),
    gastos: s.expenses.reduce((sum, e) => sum + e.amount, 0),
    retiros: s.withdrawals.reduce((sum, w) => sum + w.amount, 0),
  }));

  return NextResponse.json({ shifts: data, total, limit, offset });
}
