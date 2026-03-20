import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getActiveShift } from "@/lib/shift-access";

// GET /api/stats/hoy
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ enCaja: 0, ganancia: 0, hasCosts: false });
  }

  const canSeeProfit = session.user.role === "OWNER";
  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ enCaja: 0, ganancia: 0, hasCosts: false });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift) {
    return NextResponse.json({
      enCaja: 0,
      ganancia: null,
      hasCosts: false,
      openingAmount: 0,
      ventasEfectivo: 0,
      ventasMp: 0,
      ventasDebito: 0,
      ventasTransferencia: 0,
      ventasTarjeta: 0,
      ventasFiado: 0,
      totalVentas: 0,
      totalGastos: 0,
      totalRetiros: 0,
    });
  }

  const [cashSales, allSales, expenses, withdrawals] = await Promise.all([
    prisma.sale.aggregate({
      where: { shiftId: activeShift.id, paymentMethod: "CASH", voided: false },
      _sum: { total: true },
    }),
    prisma.sale.findMany({
      where: { shiftId: activeShift.id, voided: false },
      include: { items: true },
    }),
    prisma.expense.aggregate({
      where: { shiftId: activeShift.id },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { shiftId: activeShift.id },
      _sum: { amount: true },
    }),
  ]);

  const openingAmount = activeShift.openingAmount ?? 0;
  const cashSalesTotal = cashSales._sum.total ?? 0;
  const expensesTotal = expenses._sum.amount ?? 0;
  const withdrawalsTotal = withdrawals._sum.amount ?? 0;

  const enCaja = openingAmount + cashSalesTotal - expensesTotal - withdrawalsTotal;

  let ganancia = 0;
  let hasCosts = false;
  let ventasMp = 0;
  let ventasDebito = 0;
  let ventasTransferencia = 0;
  let ventasTarjeta = 0;
  let ventasFiado = 0;

  for (const sale of allSales) {
    switch (sale.paymentMethod) {
      case "MERCADOPAGO":
        ventasMp += sale.total;
        break;
      case "DEBIT":
        ventasDebito += sale.total;
        break;
      case "TRANSFER":
        ventasTransferencia += sale.total;
        break;
      case "CREDIT_CARD":
        ventasTarjeta += sale.total;
        break;
      case "CREDIT":
        ventasFiado += sale.total;
        break;
      default:
        break;
    }

    for (const item of sale.items) {
      if (item.cost !== null) {
        hasCosts = true;
        ganancia += (item.price - item.cost) * item.quantity;
      } else {
        ganancia += item.price * item.quantity;
      }
    }
  }

  if (hasCosts) {
    ganancia -= expensesTotal;
  }

  const totalVentas =
    cashSalesTotal +
    ventasMp +
    ventasDebito +
    ventasTransferencia +
    ventasTarjeta +
    ventasFiado;

  return NextResponse.json({
    enCaja: Math.round(enCaja),
    ganancia: canSeeProfit && hasCosts ? Math.round(ganancia) : null,
    hasCosts: canSeeProfit ? hasCosts : false,
    openingAmount: Math.round(openingAmount),
    ventasEfectivo: Math.round(cashSalesTotal),
    ventasMp: Math.round(ventasMp),
    ventasDebito: Math.round(ventasDebito),
    ventasTransferencia: Math.round(ventasTransferencia),
    ventasTarjeta: Math.round(ventasTarjeta),
    ventasFiado: Math.round(ventasFiado),
    totalVentas: Math.round(totalVentas),
    totalGastos: Math.round(expensesTotal),
    totalRetiros: Math.round(withdrawalsTotal),
  });
}
