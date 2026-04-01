import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/ventas?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&metodo=XXX&empleadoId=XXX&search=XXX
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
  const periodo = searchParams.get("periodo") ?? "semana";
  const isoDate = searchParams.get("isoDate") ?? todayART();
  const metodo = searchParams.get("metodo"); // optional
  const empleadoId = searchParams.get("empleadoId"); // optional
  const search = searchParams.get("search"); // optional

  // Build date range based on periodo
  const { start: dayStart, end: dayEnd } = artDayRange(isoDate);
  let start: Date;
  let end: Date;

  if (periodo === "semana") {
    const d = new Date(dayStart);
    const dow = d.getUTCDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    start = new Date(d);
    start.setUTCDate(d.getUTCDate() - daysFromMonday);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
  } else if (periodo === "mes") {
    const [y, m] = isoDate.split("-").map(Number);
    start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`);
    const lastDay = new Date(y, m, 0).getDate();
    end = new Date(`${y}-${String(m).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`);
  } else {
    start = dayStart;
    end = dayEnd;
  }

  // Build where clause for sales
  const where: any = {
    branchId,
    createdAt: { gte: start, lte: end },
  };

  if (metodo) {
    where.paymentMethod = metodo;
  }

  if (empleadoId) {
    where.createdByEmployeeId = empleadoId;
  }

  // Fetch sales with items and related data
  const sales = await prisma.sale.findMany({
    where,
    include: {
      items: true,
      createdByEmployee: { select: { name: true } },
      invoice: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100, // Pagination limit
  });

  // Filter by product name if searching (non-numeric search)
  let filteredSales = sales;
  if (search && !/^\d+$/.test(search)) {
    const searchLower = search.toLowerCase();
    filteredSales = sales.filter((sale) =>
      sale.items.some((item) => item.name.toLowerCase().includes(searchLower))
    );
  }

  // Filter by ticket number if numeric search
  if (search && /^\d+$/.test(search)) {
    const ticketNum = parseInt(search);
    filteredSales = sales.filter((sale) => sale.ticketNumber === ticketNum);
  }

  // Aggregate totals
  let totalVentas = 0;
  let cantidadVentas = 0;
  const ventasPorMetodo: Record<string, number> = {};
  const ventasPorHora: Array<{ hora: number; cantidad: number; total: number }> = Array(24).fill(null).map((_, i) => ({ hora: i, cantidad: 0, total: 0 }));
  const productoMap: Record<string, { name: string; cantidad: number; total: number }> = {};
  let ventasFiadoCantidad = 0;
  let ventasFiadoTotal = 0;
  let facturasEmitidas = 0;
  let facturasPendientes = 0;
  let facturasFallidas = 0;

  for (const sale of filteredSales) {
    if (!sale.voided) {
      totalVentas += sale.total;
      cantidadVentas++;
    }

    // Payment method aggregation
    ventasPorMetodo[sale.paymentMethod] = (ventasPorMetodo[sale.paymentMethod] ?? 0) + sale.total;

    // Hour of day (0-23)
    const hour = new Date(sale.createdAt).getHours();
    if (!sale.voided) {
      ventasPorHora[hour].cantidad++;
      ventasPorHora[hour].total += sale.total;
    }

    // Products aggregation
    for (const item of sale.items) {
      if (!productoMap[item.name]) {
        productoMap[item.name] = { name: item.name, cantidad: 0, total: 0 };
      }
      productoMap[item.name].cantidad += item.quantity;
      productoMap[item.name].total += item.price * item.quantity;
    }

    // Fiado (credit sales)
    if (sale.paymentMethod === "CREDIT") {
      ventasFiadoCantidad++;
      ventasFiadoTotal += sale.total;
    }

    // Invoices status
    if (sale.invoice) {
      if (sale.invoice.status === "ISSUED") facturasEmitidas++;
      else if (sale.invoice.status === "PENDING") facturasPendientes++;
      else if (sale.invoice.status === "FAILED") facturasFallidas++;
    }
  }

  // Products sorted by quantity (most and least sold)
  const productosMasVendidos = Object.values(productoMap)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);

  const productosMenosVendidos = Object.values(productoMap)
    .sort((a, b) => a.cantidad - b.cantidad)
    .slice(0, 10);

  // Format sales list for response
  const ventas = filteredSales.map((sale) => ({
    id: sale.id,
    ticketNumber: sale.ticketNumber,
    createdAt: sale.createdAt.toISOString(),
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    employeeName: sale.createdByEmployee?.name ?? null,
    voided: sale.voided,
    invoiceStatus: sale.invoice?.status ?? null,
    itemsCount: sale.items.length,
  }));

  return NextResponse.json({
    ventas,
    totalVentas: Math.round(totalVentas),
    cantidadVentas,
    ventasPorMetodo,
    ventasPorHora,
    productosMasVendidos,
    productosMenosVendidos,
    categoriasTop: [], // TODO: requiere join con Product para obtener categorías
    ventasFiado: { cantidad: ventasFiadoCantidad, total: ventasFiadoTotal },
    facturasAfip: { emitidas: facturasEmitidas, pendientes: facturasPendientes, fallidas: facturasFallidas },
  });
}
