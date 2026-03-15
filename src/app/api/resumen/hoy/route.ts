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

  // ─── Ventas del día (no anuladas) ────────────────────────────────────────
  const sales = await prisma.sale.findMany({
    where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
    include: { items: true },
  });

  // Subtotales por método de cobro — un solo loop sobre el array ya cargado
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
      case "CASH":        ventasEfectivo     += sale.total; break;
      case "MERCADOPAGO": ventasMp           += sale.total; break;
      case "DEBIT":       ventasDebito       += sale.total; break;
      case "TRANSFER":    ventasTransferencia += sale.total; break;
      case "CREDIT_CARD": ventasTarjeta      += sale.total; break;
      case "CREDIT":      ventasFiado        += sale.total; break;
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

  const totalVentas = ventasEfectivo + ventasMp + ventasDebito + ventasTransferencia + ventasTarjeta + ventasFiado;

  // ─── Gastos del día ────────────────────────────────────────────────────────
  const expenses = await prisma.expense.findMany({
    where: { branchId, createdAt: { gte: start, lte: end } },
  });
  const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
  if (hasCosts) ganancia -= totalGastos;

  // ─── Retiros del día ───────────────────────────────────────────────────────
  const withdrawals = await prisma.withdrawal.findMany({
    where: { branchId, createdAt: { gte: start, lte: end } },
  });
  const totalRetiros = withdrawals.reduce((s, w) => s + w.amount, 0);

  // ─── Caja física (solo afectada por efectivo) ─────────────────────────────
  // El primer turno del día marca cuánto había al abrir
  const firstShift = await prisma.shift.findFirst({
    where: { branchId, openedAt: { gte: start } },
    orderBy: { openedAt: "asc" },
  });
  const apertura = firstShift?.openingAmount ?? 0;
  const enCaja = apertura + ventasEfectivo - totalGastos - totalRetiros;

  // ─── Turnos del día ───────────────────────────────────────────────────────
  const shifts = await prisma.shift.findMany({
    where: { branchId, openedAt: { gte: start } },
    include: {
      sales: { where: { voided: false } },
      expenses: true,
      withdrawals: true,
    },
    orderBy: { openedAt: "asc" },
  });

  // ─── Fiados del día ───────────────────────────────────────────────────────
  const fiadoSales = sales.filter((s) => s.paymentMethod === "CREDIT");
  const creditCustomerIds = [
    ...new Set(fiadoSales.map((s) => s.creditCustomerId).filter(Boolean)),
  ] as string[];
  const fiados =
    creditCustomerIds.length > 0
      ? await prisma.creditCustomer.findMany({
          where: { id: { in: creditCustomerIds } },
          select: { id: true, name: true, balance: true },
        })
      : [];

  // ─── Horas trabajadas ─────────────────────────────────────────────────────
  const horasHoy = firstShift
    ? Math.round((Date.now() - firstShift.openedAt.getTime()) / 3_600_000)
    : 0;

  return NextResponse.json({
    // Caja física
    apertura,
    ventasEfectivo,
    totalGastos,
    totalRetiros,
    enCaja: Math.round(enCaja),

    // Otros cobros (informativo, no están en el cajón)
    ventasMp,
    ventasDebito,
    ventasTransferencia,
    ventasTarjeta,
    ventasFiado,

    // Totales generales
    totalVentas,
    ganancia: hasCosts ? Math.round(ganancia) : null,
    hasCosts,
    horasHoy,

    // Turnos y fiados
    shifts: shifts.map((s) => ({
      id: s.id,
      employeeName: s.employeeName,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingAmount: s.openingAmount,
      expectedAmount: s.expectedAmount,
      closingAmount: s.closingAmount,
      difference: s.difference,
      ventas: s.sales.reduce((sum, v) => sum + v.total, 0),
      gastos: s.expenses.reduce((sum, e) => sum + e.amount, 0),
      retiros: s.withdrawals.reduce((sum, w) => sum + w.amount, 0),
    })),
    fiados: fiados.map((f) => ({
      name: f.name,
      total: fiadoSales
        .filter((s) => s.creditCustomerId === f.id)
        .reduce((sum, s) => sum + s.total, 0),
    })),
  });
}
