import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/reports/ventas?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";

  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "Faltan parámetros from y to" },
      { status: 400 }
    );
  }

  const startDate = new Date(from);
  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  const [sales, expenses, withdrawals, shifts, branch] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId,
        voided: false,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        items: true,
        shift: { select: { employeeName: true } },
        createdByEmployee: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: {
        branchId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        createdByEmployee: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.withdrawal.findMany({
      where: {
        branchId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        createdByEmployee: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.shift.findMany({
      where: {
        branchId,
        openedAt: { gte: startDate, lte: endDate },
      },
      include: {
        employee: { select: { name: true } },
      },
      orderBy: { openedAt: "asc" },
    }),
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true, kiosco: { select: { name: true } } },
    }),
  ]);

  // Calcular totales por método de pago
  let ventasEfectivo = 0;
  let ventasMp = 0;
  let ventasDebito = 0;
  let ventasTransferencia = 0;
  let ventasTarjeta = 0;
  let ventasFiado = 0;
  let ganancia = 0;
  let hasCosts = false;

  for (const sale of sales) {
    switch (sale.paymentMethod) {
      case "CASH":
        ventasEfectivo += sale.total;
        break;
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

  const totalVentas =
    ventasEfectivo +
    ventasMp +
    ventasDebito +
    ventasTransferencia +
    ventasTarjeta +
    ventasFiado;

  const totalGastos = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRetiros = withdrawals.reduce((sum, w) => sum + w.amount, 0);

  if (hasCosts) {
    ganancia -= totalGastos;
  }

  return NextResponse.json({
    branchName: branch?.name ?? "Sucursal",
    kioscoName: branch?.kiosco?.name ?? "Kiosco",
    period: { from, to },
    summary: {
      totalVentas: Math.round(totalVentas),
      ventasEfectivo: Math.round(ventasEfectivo),
      ventasMp: Math.round(ventasMp),
      ventasDebito: Math.round(ventasDebito),
      ventasTransferencia: Math.round(ventasTransferencia),
      ventasTarjeta: Math.round(ventasTarjeta),
      ventasFiado: Math.round(ventasFiado),
      totalGastos: Math.round(totalGastos),
      totalRetiros: Math.round(totalRetiros),
      ganancia: hasCosts ? Math.round(ganancia) : null,
      hasCosts,
    },
    stats: {
      totalVentas: sales.length,
      totalGastos: expenses.length,
      totalRetiros: withdrawals.length,
      totalTurnos: shifts.length,
    },
    sales: sales.map((s) => ({
      id: s.id,
      date: s.createdAt.toISOString(),
      total: s.total,
      paymentMethod: s.paymentMethod,
      employeeName: s.createdByEmployee?.name ?? s.shift?.employeeName ?? "N/A",
      itemsCount: s.items.length,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      date: e.createdAt.toISOString(),
      amount: e.amount,
      reason: e.reason,
      note: e.note,
      employeeName: e.createdByEmployee?.name ?? "N/A",
    })),
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      date: w.createdAt.toISOString(),
      amount: w.amount,
      note: w.note,
      employeeName: w.createdByEmployee?.name ?? "N/A",
    })),
    shifts: shifts.map((s) => ({
      id: s.id,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString(),
      employeeName: s.employee?.name ?? s.employeeName,
      openingAmount: s.openingAmount,
      closingAmount: s.closingAmount,
      difference: s.difference,
    })),
  });
}
