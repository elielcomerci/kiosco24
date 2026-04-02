import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { todayART } from "@/lib/utils";

type FiadoCliente = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  createdAt: string;
  ultimaCompra: string | null;
  ultimoPago: string | null;
  ultimaCompraMonto: number | null;
  ultimoPagoMonto: number | null;
  comprasCantidad: number;
  comprasTotal: number;
  pagosCantidad: number;
  pagosTotal: number;
  diasDeuda: number | null;
};

type FiadosStats = {
  clientes: FiadoCliente[];
  resumen: {
    totalClientes: number;
    clientesDeudores: number;
    deudaTotal: number;
    deudaVencida: number;
    pagosDelMes: number;
    pagosTotalMes: number;
  };
  movimientosRecientes: Array<{
    tipo: "compra" | "pago";
    clienteId: string;
    clienteNombre: string;
    fecha: string;
    monto: number;
    saldoPosterior: number;
  }>;
  topDeudores: Array<{
    id: string;
    name: string;
    phone: string | null;
    balance: number;
    diasDeuda: number | null;
  }>;
};

const getFiadosStatsCached = unstable_cache(
  async (branchId: string, search: string, estado: string): Promise<FiadosStats> => {
    const where: any = { branchId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    if (estado === "deudores") {
      where.balance = { gt: 0 };
    } else if (estado === "sin_deuda") {
      where.balance = { lte: 0 };
    }

    const clientes = await prisma.creditCustomer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
        createdAt: true,
        sales: {
          where: { voided: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, total: true },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, amount: true },
        },
      },
      orderBy: { balance: "desc" },
    });

    if (clientes.length === 0) {
      return {
        clientes: [],
        resumen: {
          totalClientes: 0,
          clientesDeudores: 0,
          deudaTotal: 0,
          deudaVencida: 0,
          pagosDelMes: 0,
          pagosTotalMes: 0,
        },
        movimientosRecientes: [],
        topDeudores: [],
      };
    }

    const customerIds = clientes.map((cliente) => cliente.id);
    const today = todayART();
    const startOfMonth = new Date(`${today.slice(0, 7)}-01T00:00:00-03:00`);

    const [salesAgg, paymentsAgg, pagosDelMes] = await Promise.all([
      prisma.sale.groupBy({
        by: ["creditCustomerId"],
        where: {
          creditCustomerId: { in: customerIds },
          voided: false,
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.creditPayment.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: customerIds },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.creditPayment.aggregate({
        where: {
          customerId: { in: customerIds },
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const salesByCustomer = new Map(
      salesAgg
        .filter((row) => row.creditCustomerId)
        .map((row) => [
          row.creditCustomerId as string,
          {
            total: row._sum.total ?? 0,
            count: row._count,
          },
        ])
    );
    const paymentsByCustomer = new Map(
      paymentsAgg.map((row) => [
        row.customerId,
        {
          total: row._sum.amount ?? 0,
          count: row._count,
        },
      ])
    );

    const clientesConDatos = clientes.map((cliente) => {
      const ventasData = salesByCustomer.get(cliente.id);
      const pagosData = paymentsByCustomer.get(cliente.id);

      const ultimaCompra = cliente.sales[0]?.createdAt ?? null;
      const ultimaCompraMonto = cliente.sales[0]?.total ?? null;
      const ultimoPago = cliente.payments[0]?.createdAt ?? null;
      const ultimoPagoMonto = cliente.payments[0]?.amount ?? null;
      const ultimoMovimiento = ultimaCompra || ultimoPago;
      const diasDeuda = ultimoMovimiento
        ? Math.floor((Date.now() - ultimoMovimiento.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: cliente.id,
        name: cliente.name,
        phone: cliente.phone,
        balance: cliente.balance,
        createdAt: cliente.createdAt.toISOString(),
        ultimaCompra: ultimaCompra?.toISOString() ?? null,
        ultimoPago: ultimoPago?.toISOString() ?? null,
        ultimaCompraMonto,
        ultimoPagoMonto,
        comprasCantidad: ventasData?.count ?? 0,
        comprasTotal: ventasData?.total ?? 0,
        pagosCantidad: pagosData?.count ?? 0,
        pagosTotal: pagosData?.total ?? 0,
        diasDeuda,
      };
    });

    const clientesDeudores = clientesConDatos.filter((cliente) => cliente.balance > 0).length;
    const deudaTotal = clientesConDatos.reduce((sum, cliente) => sum + cliente.balance, 0);
    const deudaVencida = clientesConDatos
      .filter((cliente) => cliente.balance > 0)
      .reduce((sum, cliente) => {
        if (cliente.diasDeuda !== null && cliente.diasDeuda > 30) {
          return sum + cliente.balance;
        }
        return sum;
      }, 0);

    const movimientosRecientes: FiadosStats["movimientosRecientes"] = [];
    for (const cliente of clientesConDatos.slice(0, 10)) {
      if (cliente.ultimaCompra) {
        movimientosRecientes.push({
          tipo: "compra",
          clienteId: cliente.id,
          clienteNombre: cliente.name,
          fecha: cliente.ultimaCompra,
          monto: cliente.ultimaCompraMonto ?? cliente.comprasTotal,
          saldoPosterior: cliente.balance,
        });
      }
      if (cliente.ultimoPago) {
        movimientosRecientes.push({
          tipo: "pago",
          clienteId: cliente.id,
          clienteNombre: cliente.name,
          fecha: cliente.ultimoPago,
          monto: cliente.ultimoPagoMonto ?? cliente.pagosTotal,
          saldoPosterior: cliente.balance,
        });
      }
    }

    movimientosRecientes.sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    const topDeudores = clientesConDatos
      .filter((cliente) => cliente.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5)
      .map((cliente) => ({
        id: cliente.id,
        name: cliente.name,
        phone: cliente.phone,
        balance: cliente.balance,
        diasDeuda: cliente.diasDeuda,
      }));

    return {
      clientes: clientesConDatos,
      resumen: {
        totalClientes: clientesConDatos.length,
        clientesDeudores,
        deudaTotal: Math.round(deudaTotal),
        deudaVencida: Math.round(deudaVencida),
        pagosDelMes: pagosDelMes._count,
        pagosTotalMes: Math.round(pagosDelMes._sum.amount ?? 0),
      },
      movimientosRecientes: movimientosRecientes.slice(0, 20),
      topDeudores,
    };
  },
  ["stats-fiados"],
  { revalidate: 30 }
);

export { getFiadosStatsCached as getFiadosStats };
