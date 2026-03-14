import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { todayRange } from "@/lib/utils";

import { getBranchId } from "@/lib/branch";

// GET /api/resumen/hoy
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { start, end } = todayRange();

  // Sales
  const sales = await prisma.sale.findMany({
    where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
    include: { items: true },
  });

  const totalVentas = sales.reduce((s: number, v: { total: number }) => s + v.total, 0);

  // Ganancia (solo si hay costos)
  let ganancia = 0;
  let hasCosts = false;
  for (const sale of sales) {
    for (const item of sale.items) {
      if (item.cost !== null) hasCosts = true;
      ganancia += item.cost !== null
        ? (item.price - item.cost) * item.quantity
        : item.price * item.quantity;
    }
  }

  // Expenses
  const expenses = await prisma.expense.findMany({
    where: { branchId, createdAt: { gte: start, lte: end } },
  });
  const totalGastos = expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0);
  if (hasCosts) ganancia -= totalGastos;

  // Withdrawals
  const withdrawals = await prisma.withdrawal.findMany({
    where: { branchId, createdAt: { gte: start, lte: end } },
  });
  const totalRetiros = withdrawals.reduce((s: number, w: { amount: number }) => s + w.amount, 0);

  // Cash in register
  const cashSales = sales
    .filter((s: { paymentMethod: string }) => s.paymentMethod === "CASH")
    .reduce((sum: number, s: { total: number }) => sum + s.total, 0);

  const firstShift = await prisma.shift.findFirst({
    where: { branchId, openedAt: { gte: start } },
    orderBy: { openedAt: "asc" },
  });

  const enCaja = (firstShift?.openingAmount ?? 0) + cashSales - totalGastos - totalRetiros;

  // Shifts today
  const shifts = await prisma.shift.findMany({
    where: { branchId, openedAt: { gte: start } },
    include: { sales: true, expenses: true, withdrawals: true },
    orderBy: { openedAt: "asc" },
  });

  // Fiados today
  const fiadoSales = sales.filter((s: { paymentMethod: string }) => s.paymentMethod === "CREDIT");
  const creditCustomerIds = [...new Set(fiadoSales.map((s: { creditCustomerId: string | null }) => s.creditCustomerId).filter(Boolean))];
  const fiados = creditCustomerIds.length > 0
    ? await prisma.creditCustomer.findMany({
        where: { id: { in: creditCustomerIds as string[] } },
        select: { id: true, name: true, balance: true },
      })
    : [];

  // Hours worked
  const horasHoy = firstShift
    ? Math.round((Date.now() - firstShift.openedAt.getTime()) / 3600000)
    : 0;

  return NextResponse.json({
    totalVentas,
    totalGastos,
    totalRetiros,
    enCaja: Math.max(0, enCaja),
    ganancia: hasCosts ? ganancia : null,
    hasCosts,
    horasHoy,
    shifts: shifts.map((s: any) => ({
      id: s.id,
      employeeName: s.employeeName,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      ventas: s.sales.filter((sItems: any) => !sItems.voided).reduce((sum: number, v: any) => sum + v.total, 0),
      expectedAmount: s.expectedAmount,
      closingAmount: s.closingAmount,
      difference: s.difference,
    })),
    fiados: fiados.map((f: any) => ({
      name: f.name,
      total: fiadoSales.filter((sSale: { creditCustomerId: string | null; total: number }) => sSale.creditCustomerId === f.id).reduce((sum: number, sSale: { total: number }) => sum + sSale.total, 0),
    })),
  });
}
