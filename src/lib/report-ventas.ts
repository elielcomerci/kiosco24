import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSaleItemCostSubtotal, getSaleItemSubtotal } from "@/lib/sale-item";

type ReportVentas = {
  branchName: string;
  kioscoName: string;
  period: { from: string; to: string };
  summary: {
    totalVentas: number;
    ventasEfectivo: number;
    ventasMp: number;
    ventasDebito: number;
    ventasTransferencia: number;
    ventasTarjeta: number;
    ventasFiado: number;
    totalGastos: number;
    totalRetiros: number;
    ganancia: number | null;
    hasCosts: boolean;
  };
  stats: {
    totalVentas: number;
    totalGastos: number;
    totalRetiros: number;
    totalTurnos: number;
  };
  sales: Array<{
    id: string;
    date: string;
    total: number;
    paymentMethod: string;
    employeeName: string;
    itemsCount: number;
  }>;
  expenses: Array<{
    id: string;
    date: string;
    amount: number;
    reason: string;
    note: string | null;
    employeeName: string;
  }>;
  withdrawals: Array<{
    id: string;
    date: string;
    amount: number;
    note: string | null;
    employeeName: string;
  }>;
  shifts: Array<{
    id: string;
    openedAt: string;
    closedAt?: string;
    employeeName: string;
    openingAmount: number;
    closingAmount: number | null;
    difference: number | null;
  }>;
};

type SaleRow = {
  id: string;
  total: number;
  paymentMethod: string;
  createdAt: Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    cost: number | null;
    soldByWeight?: boolean;
  }>;
  shift: { employeeName: string } | null;
  createdByEmployee: { name: string } | null;
};

type ExpenseRow = {
  id: string;
  createdAt: Date;
  amount: number;
  reason: string;
  note: string | null;
  createdByEmployee: { name: string } | null;
};

type WithdrawalRow = {
  id: string;
  createdAt: Date;
  amount: number;
  note: string | null;
  createdByEmployee: { name: string } | null;
};

type ShiftRow = {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  employeeName: string;
  openingAmount: number;
  closingAmount: number | null;
  difference: number | null;
};

function roundMoney(value: number): number {
  return Math.round(value);
}

const getVentasReportCached = unstable_cache(
  async (branchId: string, from: string, to: string): Promise<ReportVentas> => {
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
        select: {
          id: true,
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
        select: {
          id: true,
          createdAt: true,
          amount: true,
          reason: true,
          note: true,
          createdByEmployee: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.withdrawal.findMany({
        where: {
          branchId,
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          note: true,
          createdByEmployee: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.shift.findMany({
        where: {
          branchId,
          openedAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          employeeName: true,
          openingAmount: true,
          closingAmount: true,
          difference: true,
        },
        orderBy: { openedAt: "asc" },
      }),
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { name: true, kiosco: { select: { name: true } } },
      }),
    ]);

    let ventasEfectivo = 0;
    let ventasMp = 0;
    let ventasDebito = 0;
    let ventasTransferencia = 0;
    let ventasTarjeta = 0;
    let ventasFiado = 0;
    let ganancia = 0;
    let hasCosts = false;

    for (const sale of sales as SaleRow[]) {
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
        // The report needs the gross margin estimate by item cost.
        // Cost is not returned to the client, only used for this aggregation.
        const cost = item.cost;
        if (cost !== null) {
          hasCosts = true;
          ganancia +=
            getSaleItemSubtotal(item) -
            getSaleItemCostSubtotal({
              quantity: item.quantity,
              soldByWeight: item.soldByWeight,
              cost,
            });
        } else {
          ganancia += getSaleItemSubtotal(item);
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

    return {
      branchName: branch?.name ?? "Sucursal",
      kioscoName: branch?.kiosco?.name ?? "Kiosco",
      period: { from, to },
      summary: {
        totalVentas: roundMoney(totalVentas),
        ventasEfectivo: roundMoney(ventasEfectivo),
        ventasMp: roundMoney(ventasMp),
        ventasDebito: roundMoney(ventasDebito),
        ventasTransferencia: roundMoney(ventasTransferencia),
        ventasTarjeta: roundMoney(ventasTarjeta),
        ventasFiado: roundMoney(ventasFiado),
        totalGastos: roundMoney(totalGastos),
        totalRetiros: roundMoney(totalRetiros),
        ganancia: hasCosts ? roundMoney(ganancia) : null,
        hasCosts,
      },
      stats: {
        totalVentas: sales.length,
        totalGastos: expenses.length,
        totalRetiros: withdrawals.length,
        totalTurnos: shifts.length,
      },
      sales: (sales as SaleRow[]).map((s) => ({
        id: s.id,
        date: s.createdAt.toISOString(),
        total: s.total,
        paymentMethod: s.paymentMethod,
        employeeName: s.createdByEmployee?.name ?? s.shift?.employeeName ?? "N/A",
        itemsCount: s.items.length,
      })),
      expenses: (expenses as ExpenseRow[]).map((e) => ({
        id: e.id,
        date: e.createdAt.toISOString(),
        amount: e.amount,
        reason: e.reason,
        note: e.note,
        employeeName: e.createdByEmployee?.name ?? "N/A",
      })),
      withdrawals: (withdrawals as WithdrawalRow[]).map((w) => ({
        id: w.id,
        date: w.createdAt.toISOString(),
        amount: w.amount,
        note: w.note,
        employeeName: w.createdByEmployee?.name ?? "N/A",
      })),
      shifts: (shifts as ShiftRow[]).map((s) => ({
        id: s.id,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString(),
        employeeName: s.employeeName,
        openingAmount: s.openingAmount,
        closingAmount: s.closingAmount,
        difference: s.difference,
      })),
    };
  },
  ["reports-ventas"],
  { revalidate: 30 }
);

export { getVentasReportCached as getVentasReport };
