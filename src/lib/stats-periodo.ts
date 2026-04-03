import { prisma } from "@/lib/prisma";
import { getSaleItemCostSubtotal, getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange } from "@/lib/utils";

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

type Periodo = "dia" | "semana" | "mes";

type PeriodoStats = {
  periodo: Periodo;
  totalVentas: number;
  ventasPorMetodo: Record<string, number>;
  totalGastos: number;
  totalRetiros: number;
  gananciasBrutas: number | null;
  gananciasNetas: number | null;
  hasCosts: boolean;
  margenPorcentaje: number | null;
  promedioVentasDia: number;
  gastosPorCategoria: Record<string, number>;
  topProductos: Array<{ name: string; cantidad: number; total: number }>;
  ventasPorDia: Array<{ fecha: string; ventas: number; ganancia: number | null }>;
  ventasPorSemana: Array<{ semana: number; ventas: number; ganancia: number | null }> | null;
  prev: {
    totalVentas: number;
    totalGastos: number;
    gananciasNetas: number | null;
    hasCosts: boolean;
  };
};

export const getPeriodoStats = async (branchId: string, periodo: Periodo, isoDate: string): Promise<PeriodoStats> => {
    const { start: dayStart, end: dayEnd } = artDayRange(isoDate);

    let start: Date;
    let end: Date;
    let prevStart: Date;
    let prevEnd: Date;

    if (periodo === "semana") {
      const d = new Date(dayStart);
      const dow = d.getUTCDay();
      const daysFromMonday = dow === 0 ? 6 : dow - 1;
      start = new Date(d);
      start.setUTCDate(d.getUTCDate() - daysFromMonday);
      end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);

      prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      prevEnd = new Date(end);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 7);
    } else if (periodo === "mes") {
      const [y, m] = isoDate.split("-").map(Number);
      start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`);
      const lastDay = new Date(y, m, 0).getDate();
      end = new Date(`${y}-${String(m).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`);

      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      prevStart = new Date(`${prevY}-${String(prevM).padStart(2, "0")}-01T00:00:00-03:00`);
      const prevLastDay = new Date(prevY, prevM, 0).getDate();
      prevEnd = new Date(`${prevY}-${String(prevM).padStart(2, "0")}-${prevLastDay}T23:59:59.999-03:00`);
    } else {
      start = dayStart;
      end = dayEnd;

      prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - 1);
      prevEnd = new Date(end);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    }

    const [sales, expenseGroups, withdrawals, prevSales, prevExpenses] = await Promise.all([
      prisma.sale.findMany({
        where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
        select: {
          total: true,
          paymentMethod: true,
          createdAt: true,
            items: {
              select: {
                name: true,
                quantity: true,
                price: true,
                cost: true,
                soldByWeight: true,
              },
            },
        },
      }),
      prisma.expense.groupBy({
        by: ["reason"],
        where: { branchId, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { branchId, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.sale.findMany({
        where: { branchId, voided: false, createdAt: { gte: prevStart, lte: prevEnd } },
        select: {
          total: true,
          paymentMethod: true,
          createdAt: true,
            items: {
              select: {
                name: true,
                quantity: true,
                price: true,
                cost: true,
                soldByWeight: true,
              },
            },
        },
      }),
      prisma.expense.aggregate({
        where: { branchId, createdAt: { gte: prevStart, lte: prevEnd } },
        _sum: { amount: true },
      }),
    ]);

    const ventasPorMetodo: Record<string, number> = {};
    const mapaVentas: Record<string, number> = {};
    const mapaGanancia: Record<string, number> = {};
    const mapaCostsPresent: Record<string, boolean> = {};
    const productoMap: Record<string, { cantidad: number; total: number }> = {};

    let totalVentas = 0;
    let gananciasBrutas = 0;
    let hasCosts = false;

    for (const sale of sales) {
      const saleDateART = toARTDateString(sale.createdAt);
      ventasPorMetodo[sale.paymentMethod] = (ventasPorMetodo[sale.paymentMethod] ?? 0) + sale.total;
      totalVentas += sale.total;
      mapaVentas[saleDateART] = (mapaVentas[saleDateART] ?? 0) + sale.total;

      for (const item of sale.items) {
        if (!productoMap[item.name]) {
          productoMap[item.name] = { cantidad: 0, total: 0 };
        }
        productoMap[item.name].cantidad += item.quantity;
        productoMap[item.name].total += getSaleItemSubtotal(item);

        if (item.cost !== null) {
          hasCosts = true;
          mapaCostsPresent[saleDateART] = true;
          const profit =
            getSaleItemSubtotal(item) -
            getSaleItemCostSubtotal({
              quantity: item.quantity,
              soldByWeight: item.soldByWeight,
              cost: item.cost,
            });
          gananciasBrutas += profit;
          mapaGanancia[saleDateART] = (mapaGanancia[saleDateART] ?? 0) + profit;
        } else {
          mapaGanancia[saleDateART] = (mapaGanancia[saleDateART] ?? 0) + getSaleItemSubtotal(item);
        }
      }
    }

    const totalGastos = expenseGroups.reduce((sum, group) => sum + (group._sum.amount ?? 0), 0);
    const totalRetiros = withdrawals._sum.amount ?? 0;
    const gastosPorCategoria = expenseGroups.reduce((acc, group) => {
      acc[group.reason] = group._sum.amount ?? 0;
      return acc;
    }, {} as Record<string, number>);

    const gananciasNetas = hasCosts ? gananciasBrutas - totalGastos : null;
    const margenPorcentaje =
      hasCosts && totalVentas > 0
        ? Math.round(((gananciasNetas ?? 0) / totalVentas) * 100)
        : null;

    const topProductos = Object.entries(productoMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const allDays = eachDayOfInterval(start, end);
    const ventasPorDia = allDays.map((day) => {
      const key = toARTDateString(day);
      return {
        fecha: key,
        ventas: mapaVentas[key] ?? 0,
        ganancia: mapaCostsPresent[key] ? (mapaGanancia[key] ?? 0) : null,
      };
    });

    let ventasPorSemana: PeriodoStats["ventasPorSemana"] = null;
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

    let prevTotalVentas = 0;
    let prevGananciasBrutas = 0;
    let prevHasCosts = false;

    for (const sale of prevSales) {
      prevTotalVentas += sale.total;
      for (const item of sale.items) {
        if (item.cost !== null) {
          prevHasCosts = true;
          prevGananciasBrutas +=
            getSaleItemSubtotal(item) -
            getSaleItemCostSubtotal({
              quantity: item.quantity,
              soldByWeight: item.soldByWeight,
              cost: item.cost,
            });
        } else {
          prevGananciasBrutas += getSaleItemSubtotal(item);
        }
      }
    }

    const prevTotalGastos = prevExpenses._sum.amount ?? 0;
    const prevGananciasNetas = prevHasCosts ? prevGananciasBrutas - prevTotalGastos : null;

    return {
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
      },
    };
};

function toARTDateString(date: Date): string {
  return new Date(date.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10);
}

function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  const endNorm = new Date(end);
  endNorm.setUTCHours(23, 59, 59, 999);

  while (cur <= endNorm) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return days;
}

function getWeekOfMonth(date: Date, monthStart: Date): number {
  const dayIndex = Math.floor((date.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(dayIndex / 7) + 1;
}
