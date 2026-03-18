import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { artDayRange, todayART } from "@/lib/utils";
import { getBranchId } from "@/lib/branch";

// GET /api/stats/periodo?periodo=dia|semana|mes&isoDate=YYYY-MM-DD
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? "dia";
  const isoDate = searchParams.get("isoDate") ?? todayART();

  // ─── Build date range ─────────────────────────────────────────────────────
  const { start: dayStart, end: dayEnd } = artDayRange(isoDate);

  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (periodo === "semana") {
    // Current week: Monday to Sunday containing isoDate
    const d = new Date(dayStart);
    const dow = d.getUTCDay(); // 0=Sun, 1=Mon
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    start = new Date(d);
    start.setUTCDate(d.getUTCDate() - daysFromMonday);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);

    // Prev week: exactly 7 days before
    prevStart = new Date(start);
    prevStart.setUTCDate(prevStart.getUTCDate() - 7);
    prevEnd = new Date(end);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 7);
  } else if (periodo === "mes") {
    // Current month: First to last day of the calendar month
    const [y, m] = isoDate.split("-").map(Number);
    start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`);
    const lastDay = new Date(y, m, 0).getDate();
    end = new Date(`${y}-${String(m).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`);

    // Prev month: Decisions - "Mes anterior completo calendario" (e.g. Marzo vs Febrero).
    // This is much more intuitive for kiosk owners than a rolling 30-day window.
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    prevStart = new Date(`${prevY}-${String(prevM).padStart(2, "0")}-01T00:00:00-03:00`);
    const prevLastDay = new Date(prevY, prevM, 0).getDate();
    prevEnd = new Date(`${prevY}-${String(prevM).padStart(2, "0")}-${prevLastDay}T23:59:59.999-03:00`);
  } else {
    // "dia"
    start = dayStart;
    end = dayEnd;

    // Prev day: exactly 1 day before
    prevStart = new Date(start);
    prevStart.setUTCDate(prevStart.getUTCDate() - 1);
    prevEnd = new Date(end);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  }

  // ─── Load data (Current & Prev Period) ───────────────────────────────────
  const [sales, expenses, withdrawals, prevSales, prevExpenses] = await Promise.all([
    prisma.sale.findMany({
      where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
      include: { items: true },
    }),
    prisma.expense.findMany({
      where: { branchId, createdAt: { gte: start, lte: end } },
    }),
    prisma.withdrawal.findMany({
      where: { branchId, createdAt: { gte: start, lte: end } },
    }),
    // We fetch prevPeriod strictly for KPI comparisons
    prisma.sale.findMany({
      where: { branchId, voided: false, createdAt: { gte: prevStart, lte: prevEnd } },
      include: { items: true },
    }),
    prisma.expense.findMany({
      where: { branchId, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
  ]);

  // ─── Aggregate by payment method ─────────────────────────────────────────
  const ventasPorMetodo: Record<string, number> = {};
  let totalVentas = 0;
  let gananciasBrutas = 0;
  let hasCosts = false;

  // For per-day breakdown
  const mapaVentas: Record<string, number> = {};
  const mapaGanancia: Record<string, number> = {};
  const mapaCostsPresent: Record<string, boolean> = {};

  for (const sale of sales) {
    const saleDateART = toARTDateString(sale.createdAt);
    ventasPorMetodo[sale.paymentMethod] = (ventasPorMetodo[sale.paymentMethod] ?? 0) + sale.total;
    totalVentas += sale.total;
    mapaVentas[saleDateART] = (mapaVentas[saleDateART] ?? 0) + sale.total;

    for (const item of sale.items) {
      if (item.cost !== null) {
        hasCosts = true;
        mapaCostsPresent[saleDateART] = true;
        const profit = (item.price - item.cost) * item.quantity;
        gananciasBrutas += profit;
        mapaGanancia[saleDateART] = (mapaGanancia[saleDateART] ?? 0) + profit;
      } else {
        mapaGanancia[saleDateART] = (mapaGanancia[saleDateART] ?? 0) + item.price * item.quantity;
      }
    }
  }

  const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRetiros = withdrawals.reduce((s, w) => s + w.amount, 0);

  const gananciasNetas = hasCosts ? gananciasBrutas - totalGastos : null;
  const margenPorcentaje =
    hasCosts && totalVentas > 0
      ? Math.round(((gananciasNetas ?? 0) / totalVentas) * 100)
      : null;

  // ─── Gastos por categoría ─────────────────────────────────────────────────
  const gastosPorCategoria: Record<string, number> = {};
  for (const e of expenses) {
    gastosPorCategoria[e.reason] = (gastosPorCategoria[e.reason] ?? 0) + e.amount;
  }

  // ─── Top productos ────────────────────────────────────────────────────────
  const productoMap: Record<string, { cantidad: number; total: number }> = {};
  for (const sale of sales) {
    for (const item of sale.items) {
      if (!productoMap[item.name]) productoMap[item.name] = { cantidad: 0, total: 0 };
      productoMap[item.name].cantidad += item.quantity;
      productoMap[item.name].total += item.price * item.quantity;
    }
  }
  const topProductos = Object.entries(productoMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);

  // ─── Build ventasPorDia (zero-filled) ─────────────────────────────────────
  const allDays = eachDayOfInterval(start, end);
  const ventasPorDia = allDays.map((day) => {
    const key = toARTDateString(day);
    return {
      fecha: key,
      ventas: mapaVentas[key] ?? 0,
      ganancia: mapaCostsPresent[key] ? (mapaGanancia[key] ?? 0) : null,
    };
  });

  // ─── For monthly view: aggregate by week ──────────────────────────────────
  let ventasPorSemana: { semana: number; ventas: number; ganancia: number | null }[] | null = null;
  if (periodo === "mes") {
    const weekMap: Record<number, { ventas: number; ganancia: number; hasCosts: boolean }> = {};
    for (const day of ventasPorDia) {
      const dayDate = new Date(`${day.fecha}T00:00:00-03:00`);
      const weekNum = getWeekOfMonth(dayDate, start);
      if (!weekMap[weekNum]) weekMap[weekNum] = { ventas: 0, ganancia: 0, hasCosts: false };
      weekMap[weekNum].ventas += day.ventas;
      if (day.ganancia !== null) {
        weekMap[weekNum].ganancia += day.ganancia;
        weekMap[weekNum].hasCosts = true;
      }
    }
    ventasPorSemana = Object.entries(weekMap).map(([w, data]) => ({
      semana: Number(w),
      ventas: data.ventas,
      ganancia: data.hasCosts ? data.ganancia : null,
    }));
  }

  const promedioVentasDia = allDays.length > 0 ? Math.round(totalVentas / allDays.length) : 0;

  // ─── Aggregate Prior Period KPIs ──────────────────────────────────────────
  let prevTotalVentas = 0;
  let prevGananciasBrutas = 0;
  let prevHasCosts = false;

  for (const sale of prevSales) {
    prevTotalVentas += sale.total;
    for (const item of sale.items) {
      if (item.cost !== null) {
        prevHasCosts = true;
        prevGananciasBrutas += (item.price - item.cost) * item.quantity;
      } else {
        prevGananciasBrutas += item.price * item.quantity;
      }
    }
  }

  const prevTotalGastos = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
  const prevGananciasNetas = prevHasCosts ? prevGananciasBrutas - prevTotalGastos : null;

  return NextResponse.json({
    periodo,
    totalVentas: Math.round(totalVentas),
    ventasPorMetodo,
    totalGastos: Math.round(totalGastos),
    totalRetiros: Math.round(totalRetiros),
    gananciasBrutas: hasCosts ? Math.round(gananciasBrutas) : null,
    gananciasNetas: hasCosts ? Math.round(gananciasNetas ?? 0) : null,
    hasCosts,
    margenPorcentaje,
    promedioVentasDia,
    gastosPorCategoria,
    topProductos,
    ventasPorDia,
    ventasPorSemana,
    prev: {
      totalVentas: Math.round(prevTotalVentas),
      totalGastos: Math.round(prevTotalGastos),
      gananciasNetas: prevGananciasNetas !== null ? Math.round(prevGananciasNetas) : null,
      hasCosts: prevHasCosts,
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UTC Date to a YYYY-MM-DD string in ART timezone */
function toARTDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Returns an array of Date objects for each day in [start, end] (UTC midnight-aligned) */
function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  // Normalize to midnight UTC of the start day
  cur.setUTCHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setUTCHours(23, 59, 59, 999);

  while (cur <= endNorm) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/** Returns 1-based week number within the month (week 1 = days 1-7, etc.) */
function getWeekOfMonth(date: Date, monthStart: Date): number {
  const dayIndex = Math.floor(
    (date.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.floor(dayIndex / 7) + 1;
}
