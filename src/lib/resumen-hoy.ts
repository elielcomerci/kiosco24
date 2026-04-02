import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSaleItemCostSubtotal, getSaleItemSubtotal } from "@/lib/sale-item";
import { todayRange } from "@/lib/utils";

type ResumenHoy = {
  apertura: number;
  ventasEfectivo: number;
  totalGastos: number;
  totalRetiros: number;
  enCaja: number;
  ventasMp: number;
  ventasDebito: number;
  ventasTransferencia: number;
  ventasTarjeta: number;
  ventasFiado: number;
  totalVentas: number;
  ganancia: number | null;
  hasCosts: boolean;
  horasHoy: number;
  shifts: Array<{
    id: string;
    employeeName: string;
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    expectedAmount: number | null;
    closingAmount: number | null;
    difference: number | null;
    ventas: number;
    gastos: number;
    retiros: number;
  }>;
  fiados: Array<{
    name: string;
    total: number;
  }>;
  lowStockItems: Array<{
    name: string;
    stock: number;
    minStock: number;
  }>;
};

type ShiftRow = {
  id: string;
  employeeName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingAmount: number;
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
};

function sumMapValue(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

const getResumenHoyCached = unstable_cache(
  async (
    branchId: string,
    dayKey: string,
    firstShiftId: string,
    openingAmount: number,
    firstShiftOpenedAtIso: string
  ): Promise<ResumenHoy> => {
    const { start, end } = todayRange();

    const [
      salesForProfit,
      salesByMethodAgg,
      totalExpensesAgg,
      totalWithdrawalsAgg,
      shifts,
      shiftSalesAgg,
      shiftExpensesAgg,
      shiftWithdrawalsAgg,
      fiadoAgg,
      productInventories,
      variantInventories,
    ] = await Promise.all([
      prisma.sale.findMany({
        where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
        select: {
          items: {
            select: {
              price: true,
              cost: true,
              quantity: true,
              soldByWeight: true,
            },
          },
        },
      }),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: { branchId, voided: false, createdAt: { gte: start, lte: end } },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: { branchId, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { branchId, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.shift.findMany({
        where: { branchId, openedAt: { gte: start } },
        select: {
          id: true,
          employeeName: true,
          openedAt: true,
          closedAt: true,
          openingAmount: true,
          expectedAmount: true,
          closingAmount: true,
          difference: true,
        },
        orderBy: { openedAt: "asc" },
      }),
      prisma.sale.groupBy({
        by: ["shiftId"],
        where: {
          branchId,
          voided: false,
          createdAt: { gte: start, lte: end },
          shiftId: { not: null },
        },
        _sum: { total: true },
      }),
      prisma.expense.groupBy({
        by: ["shiftId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          shiftId: { not: null },
        },
        _sum: { amount: true },
      }),
      prisma.withdrawal.groupBy({
        by: ["shiftId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          shiftId: { not: null },
        },
        _sum: { amount: true },
      }),
      prisma.sale.groupBy({
        by: ["creditCustomerId"],
        where: {
          branchId,
          voided: false,
          paymentMethod: "CREDIT",
          createdAt: { gte: start, lte: end },
          creditCustomerId: { not: null },
        },
        _sum: { total: true },
      }),
      prisma.inventoryRecord.findMany({
        where: {
          branchId,
          minStock: { gt: 0 },
        },
        select: {
          stock: true,
          minStock: true,
          product: { select: { name: true } },
        },
      }),
      prisma.variantInventory.findMany({
        where: {
          branchId,
          minStock: { gt: 0 },
        },
        select: {
          stock: true,
          minStock: true,
          variant: {
            select: {
              name: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const fiadoCustomerIds = fiadoAgg
      .map((row) => row.creditCustomerId)
      .filter((value): value is string => Boolean(value));

    const fiadoCustomers = fiadoCustomerIds.length
      ? await prisma.creditCustomer.findMany({
          where: {
            branchId,
            id: {
              in: fiadoCustomerIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const salesByMethod = new Map(
      salesByMethodAgg.map((row) => [row.paymentMethod, row._sum.total ?? 0] as const)
    );
    const ventasEfectivo = salesByMethod.get("CASH") ?? 0;
    const ventasMp = salesByMethod.get("MERCADOPAGO") ?? 0;
    const ventasDebito = salesByMethod.get("DEBIT") ?? 0;
    const ventasTransferencia = salesByMethod.get("TRANSFER") ?? 0;
    const ventasTarjeta = salesByMethod.get("CREDIT_CARD") ?? 0;
    const ventasFiado = salesByMethod.get("CREDIT") ?? 0;
    const totalVentas = sumMapValue(salesByMethod);

    let ganancia = 0;
    let hasCosts = false;
    for (const sale of salesForProfit) {
      for (const item of sale.items) {
        if (item.cost !== null) {
          hasCosts = true;
          ganancia +=
            getSaleItemSubtotal(item) -
            getSaleItemCostSubtotal({
              quantity: item.quantity,
              soldByWeight: item.soldByWeight,
              cost: item.cost,
            });
        } else {
          ganancia += getSaleItemSubtotal(item);
        }
      }
    }

    const totalGastos = totalExpensesAgg._sum.amount ?? 0;
    const totalRetiros = totalWithdrawalsAgg._sum.amount ?? 0;
    if (hasCosts) {
      ganancia -= totalGastos;
    }

    const shiftSalesById = new Map<string, number>();
    for (const row of shiftSalesAgg) {
      if (!row.shiftId) continue;
      shiftSalesById.set(row.shiftId, row._sum.total ?? 0);
    }

    const shiftExpensesById = new Map<string, number>();
    for (const row of shiftExpensesAgg) {
      if (!row.shiftId) continue;
      shiftExpensesById.set(row.shiftId, row._sum.amount ?? 0);
    }

    const shiftWithdrawalsById = new Map<string, number>();
    for (const row of shiftWithdrawalsAgg) {
      if (!row.shiftId) continue;
      shiftWithdrawalsById.set(row.shiftId, row._sum.amount ?? 0);
    }

    const shiftsData = shifts.map((shift) => ({
      id: shift.id,
      employeeName: shift.employeeName,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingAmount: shift.openingAmount,
      expectedAmount: shift.expectedAmount ?? null,
      closingAmount: shift.closingAmount ?? null,
      difference: shift.difference ?? null,
      ventas: roundMoney(shiftSalesById.get(shift.id) ?? 0),
      gastos: roundMoney(shiftExpensesById.get(shift.id) ?? 0),
      retiros: roundMoney(shiftWithdrawalsById.get(shift.id) ?? 0),
    }));

    const fiadoNameById = new Map(fiadoCustomers.map((customer) => [customer.id, customer.name] as const));
    const fiados = fiadoAgg
      .map((row) => {
        const customerId = row.creditCustomerId;
        if (!customerId) {
          return null;
        }

        const name = fiadoNameById.get(customerId);
        if (!name) {
          return null;
        }

        return {
          name,
          total: roundMoney(row._sum.total ?? 0),
        };
      })
      .filter((value): value is { name: string; total: number } => value !== null)
      .sort((a, b) => b.total - a.total);

    const lowStockItems: ResumenHoy["lowStockItems"] = [];
    for (const inv of productInventories) {
      const stock = inv.stock ?? 0;
      const minStock = inv.minStock ?? 0;
      if (stock <= minStock) {
        lowStockItems.push({
          name: inv.product.name,
          stock,
          minStock,
        });
      }
    }
    for (const inv of variantInventories) {
      const stock = inv.stock ?? 0;
      const minStock = inv.minStock ?? 0;
      if (stock <= minStock) {
        lowStockItems.push({
          name: `${inv.variant.product.name} - ${inv.variant.name}`,
          stock,
          minStock,
        });
      }
    }

    const apertura = openingAmount;
    const horasHoy = firstShiftOpenedAtIso
      ? Math.round((Date.now() - new Date(firstShiftOpenedAtIso).getTime()) / 3_600_000)
      : 0;
    const enCaja = apertura + ventasEfectivo - totalGastos - totalRetiros;

    return {
      apertura: roundMoney(apertura),
      ventasEfectivo: roundMoney(ventasEfectivo),
      totalGastos: roundMoney(totalGastos),
      totalRetiros: roundMoney(totalRetiros),
      enCaja: roundMoney(enCaja),
      ventasMp: roundMoney(ventasMp),
      ventasDebito: roundMoney(ventasDebito),
      ventasTransferencia: roundMoney(ventasTransferencia),
      ventasTarjeta: roundMoney(ventasTarjeta),
      ventasFiado: roundMoney(ventasFiado),
      totalVentas: roundMoney(totalVentas),
      ganancia: hasCosts ? roundMoney(ganancia) : null,
      hasCosts,
      horasHoy,
      shifts: shiftsData,
      fiados,
      lowStockItems: lowStockItems.slice(0, 20),
    };
  },
  ["resumen-hoy"],
  { revalidate: 15 }
);

export { getResumenHoyCached as getResumenHoy };
