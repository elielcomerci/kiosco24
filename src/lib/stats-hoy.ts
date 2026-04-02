import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSaleItemCostSubtotal, getSaleItemSubtotal } from "@/lib/sale-item";

type HoyStats = {
  enCaja: number;
  ganancia: number | null;
  hasCosts: boolean;
  openingAmount: number;
  ventasEfectivo: number;
  ventasMp: number;
  ventasDebito: number;
  ventasTransferencia: number;
  ventasTarjeta: number;
  ventasFiado: number;
  totalVentas: number;
  totalGastos: number;
  totalRetiros: number;
};

export const getHoyStats = unstable_cache(
  async (branchId: string, shiftId: string, openingAmount = 0): Promise<HoyStats> => {
    const [allSales, expenses, withdrawals] = await Promise.all([
      prisma.sale.findMany({
        where: { shiftId, voided: false },
        select: {
          total: true,
          paymentMethod: true,
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
      prisma.expense.aggregate({
        where: { branchId, shiftId },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { branchId, shiftId },
        _sum: { amount: true },
      }),
    ]);

    const expensesTotal = expenses._sum.amount ?? 0;
    const withdrawalsTotal = withdrawals._sum.amount ?? 0;

    let cashSalesTotal = 0;
    let ganancia = 0;
    let hasCosts = false;
    let ventasMp = 0;
    let ventasDebito = 0;
    let ventasTransferencia = 0;
    let ventasTarjeta = 0;
    let ventasFiado = 0;

    for (const sale of allSales) {
      if (sale.paymentMethod === "CASH") {
        cashSalesTotal += sale.total;
      } else if (sale.paymentMethod === "MERCADOPAGO") {
        ventasMp += sale.total;
      } else if (sale.paymentMethod === "DEBIT") {
        ventasDebito += sale.total;
      } else if (sale.paymentMethod === "TRANSFER") {
        ventasTransferencia += sale.total;
      } else if (sale.paymentMethod === "CREDIT_CARD") {
        ventasTarjeta += sale.total;
      } else if (sale.paymentMethod === "CREDIT") {
        ventasFiado += sale.total;
      }

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

    const enCaja = openingAmount + cashSalesTotal - expensesTotal - withdrawalsTotal;

    return {
      enCaja: Math.round(enCaja),
      ganancia: hasCosts ? Math.round(ganancia) : null,
      hasCosts,
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
    };
  },
  ["stats-hoy"],
  { revalidate: 15 }
);
