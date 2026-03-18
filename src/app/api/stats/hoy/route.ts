import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { todayRange } from "@/lib/utils";

import { getBranchId } from "@/lib/branch";

// GET /api/stats/hoy
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ enCaja: 0, ganancia: 0 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ enCaja: 0, ganancia: 0 });

  const { start, end } = todayRange();

  // 1. Get active shift opening amount (if any)
  const activeShift = await prisma.shift.findFirst({
    where: { branchId, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  const montoApertura = activeShift?.openingAmount || 0;

  // 2. Sum CASH sales (received today)
  const cashSales = await prisma.sale.aggregate({
    where: { branchId, paymentMethod: "CASH", voided: false, createdAt: { gte: start, lte: end } },
    _sum: { total: true },
  });

  // 3. Sum ALL sales (for ganancia)
  const allSales = await prisma.sale.findMany({
    where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
    include: { items: true },
  });

  // 4. Sum expenses today
  const expenses = await prisma.expense.aggregate({
    where: { branchId, createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
  });

  // 5. Sum withdrawals today
  const withdrawals = await prisma.withdrawal.aggregate({
    where: { branchId, createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
  });

  const openingAmount = activeShift?.openingAmount ?? 0;
  const cashSalesTotal = cashSales._sum.total ?? 0;
  const expensesTotal = expenses._sum.amount ?? 0;
  const withdrawalsTotal = withdrawals._sum.amount ?? 0;

  const enCaja = openingAmount + cashSalesTotal - expensesTotal - withdrawalsTotal;

  // Ganancia = ventas - costo de productos vendidos (solo si hay costos cargados)
  let ganancia = 0;
  let hasCosts = false;
  for (const sale of allSales) {
    for (const item of sale.items) {
      if (item.cost !== null) {
        hasCosts = true;
        ganancia += (item.price - item.cost) * item.quantity;
      } else {
        ganancia += item.price * item.quantity;
      }
    }
  }

  // Only subtract expenses from ganancia when there are costs loaded
  if (hasCosts) ganancia -= expensesTotal;

  return NextResponse.json({
    enCaja: Math.round(enCaja),
    ganancia: hasCosts ? Math.round(ganancia) : null,
    hasCosts,
    // Shift close summary breakdown
    openingAmount: Math.round(openingAmount),
    ventasEfectivo: Math.round(cashSalesTotal),
    totalGastos: Math.round(expensesTotal),
    totalRetiros: Math.round(withdrawalsTotal),
  });
}
