import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/stats/fiados?search=XXX&estado=deudores|todos|sin_deuda
export async function GET(req: Request) {
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
  const search = searchParams.get("search"); // optional - search by name
  const estado = searchParams.get("estado") ?? "deudores"; // deudores | todos | sin_deuda

  // Build where clause
  const where: any = { branchId };

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  if (estado === "deudores") {
    where.balance = { gt: 0 };
  } else if (estado === "sin_deuda") {
    where.balance = { lte: 0 };
  }
  // "todos" no filter on balance

  // Fetch customers
  const clientes = await prisma.creditCustomer.findMany({
    where,
    include: {
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

  // Aggregate customer data
  const clientesConDatos = await Promise.all(
    clientes.map(async (cliente) => {
      // Get all sales for this customer (for totals)
      const allSales = await prisma.sale.findMany({
        where: { creditCustomerId: cliente.id, voided: false },
        select: { total: true, createdAt: true },
      });

      // Get all payments
      const allPayments = await prisma.creditPayment.findMany({
        where: { customerId: cliente.id },
        select: { amount: true, createdAt: true },
      });

      const comprasTotal = allSales.reduce((sum, s) => sum + s.total, 0);
      const comprasCantidad = allSales.length;
      const pagosTotal = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const pagosCantidad = allPayments.length;

      // Days in debt (since last purchase or last payment, whichever is more recent)
      const ultimaCompra = cliente.sales.length > 0 ? cliente.sales[0].createdAt : null;
      const ultimoPago = cliente.payments.length > 0 ? cliente.payments[0].createdAt : null;
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
        comprasCantidad,
        comprasTotal,
        pagosCantidad,
        pagosTotal,
        diasDeuda,
      };
    })
  );

  // Summary
  const totalClientes = clientes.length;
  const clientesDeudores = clientes.filter((c) => c.balance > 0).length;
  const deudaTotal = clientes.reduce((sum, c) => sum + c.balance, 0);
  const deudaVencida = clientes
    .filter((c) => c.balance > 0)
    .reduce((sum, c) => {
      const ultimaCompra = c.sales.length > 0 ? c.sales[0].createdAt : null;
      const ultimoPago = c.payments.length > 0 ? c.payments[0].createdAt : null;
      const ultimoMovimiento = ultimaCompra || ultimoPago;
      const diasDeuda = ultimoMovimiento
        ? Math.floor((Date.now() - ultimoMovimiento.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return diasDeuda > 30 ? sum + c.balance : sum;
    }, 0);

  // Payments this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const pagosDelMes = await prisma.creditPayment.findMany({
    where: {
      customerId: { in: clientes.map((c) => c.id) },
      createdAt: { gte: startOfMonth },
    },
    select: { amount: true },
  });
  const pagosTotalMes = pagosDelMes.reduce((sum, p) => sum + p.amount, 0);
  const pagosCantidadMes = pagosDelMes.length;

  // Recent movements (combine sales and payments)
  const movimientosRecientes: Array<{
    tipo: "compra" | "pago";
    clienteId: string;
    clienteNombre: string;
    fecha: string;
    monto: number;
    saldoPosterior: number;
  }> = [];

  for (const cliente of clientes.slice(0, 10)) {
    if (cliente.sales.length > 0) {
      movimientosRecientes.push({
        tipo: "compra",
        clienteId: cliente.id,
        clienteNombre: cliente.name,
        fecha: cliente.sales[0].createdAt.toISOString(),
        monto: cliente.sales[0].total,
        saldoPosterior: cliente.balance,
      });
    }
    if (cliente.payments.length > 0) {
      movimientosRecientes.push({
        tipo: "pago",
        clienteId: cliente.id,
        clienteNombre: cliente.name,
        fecha: cliente.payments[0].createdAt.toISOString(),
        monto: cliente.payments[0].amount,
        saldoPosterior: cliente.balance,
      });
    }
  }

  // Sort by date and take top 20
  movimientosRecientes.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Top deudores
  const topDeudores = clientesConDatos
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.balance,
      diasDeuda: c.diasDeuda,
    }));

  return NextResponse.json({
    clientes: clientesConDatos,
    resumen: {
      totalClientes,
      clientesDeudores,
      deudaTotal: Math.round(deudaTotal),
      deudaVencida: Math.round(deudaVencida),
      pagosDelMes: pagosCantidadMes,
      pagosTotalMes: Math.round(pagosTotalMes),
    },
    movimientosRecientes: movimientosRecientes.slice(0, 20),
    topDeudores,
  });
}
