import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/ventas?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&metodo=XXX&empleadoId=XXX&search=XXX
const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

const getVentasStats = unstable_cache(
  async (
    branchId: string,
    periodo: string,
    isoDate: string,
    metodo: string,
    empleadoId: string,
    search: string
  ) => {
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

    if (search) {
      if (/^\d+$/.test(search)) {
        where.ticketNumber = Number.parseInt(search, 10);
      } else {
        where.items = {
          some: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        };
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      select: {
        id: true,
        ticketNumber: true,
        createdAt: true,
        total: true,
        paymentMethod: true,
        voided: true,
        items: {
          select: {
            name: true,
            quantity: true,
            price: true,
            soldByWeight: true,
          },
        },
        createdByEmployee: { select: { name: true } },
        invoice: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Pagination limit
    });

    let totalVentas = 0;
    let cantidadVentas = 0;
    const ventasPorMetodo: Record<string, number> = {};
    const ventasPorHora: Array<{ hora: number; cantidad: number; total: number }> = Array(24)
      .fill(null)
      .map((_, i) => ({ hora: i, cantidad: 0, total: 0 }));
    const productoMap: Record<string, { name: string; cantidad: number; total: number }> = {};
    let ventasFiadoCantidad = 0;
    let ventasFiadoTotal = 0;
    let facturasEmitidas = 0;
    let facturasPendientes = 0;
    let facturasFallidas = 0;

    for (const sale of sales) {
      if (!sale.voided) {
        totalVentas += sale.total;
        cantidadVentas++;
      }

      ventasPorMetodo[sale.paymentMethod] = (ventasPorMetodo[sale.paymentMethod] ?? 0) + sale.total;

      const hour = new Date(sale.createdAt.getTime() - ART_OFFSET_MS).getUTCHours();
      if (!sale.voided) {
        ventasPorHora[hour].cantidad++;
        ventasPorHora[hour].total += sale.total;
      }

      for (const item of sale.items) {
        if (!productoMap[item.name]) {
          productoMap[item.name] = { name: item.name, cantidad: 0, total: 0 };
        }
        productoMap[item.name].cantidad += item.quantity;
        productoMap[item.name].total += getSaleItemSubtotal(item);
      }

      if (sale.paymentMethod === "CREDIT") {
        ventasFiadoCantidad++;
        ventasFiadoTotal += sale.total;
      }

      if (sale.invoice) {
        if (sale.invoice.status === "ISSUED") facturasEmitidas++;
        else if (sale.invoice.status === "PENDING") facturasPendientes++;
        else if (sale.invoice.status === "FAILED") facturasFallidas++;
      }
    }

    const productosOrdenados = Object.values(productoMap).sort((a, b) => b.cantidad - a.cantidad);
    const productosMasVendidos = productosOrdenados.slice(0, 10);
    const productosMenosVendidos = [...productosOrdenados].reverse().slice(0, 10);

    const ventas = sales.map((sale) => ({
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

    return {
      ventas,
      totalVentas: Math.round(totalVentas),
      cantidadVentas,
      ventasPorMetodo,
      ventasPorHora,
      productosMasVendidos,
      productosMenosVendidos,
      categoriasTop: [] as Array<{ name: string; cantidad: number; total: number }>,
      ventasFiado: { cantidad: ventasFiadoCantidad, total: ventasFiadoTotal },
      facturasAfip: {
        emitidas: facturasEmitidas,
        pendientes: facturasPendientes,
        fallidas: facturasFallidas,
      },
    };
  },
  ["stats-ventas"],
  { revalidate: 30 }
);

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
  const metodo = searchParams.get("metodo")?.trim() ?? ""; // optional
  const empleadoId = searchParams.get("empleadoId")?.trim() ?? ""; // optional
  const search = searchParams.get("search")?.trim() ?? ""; // optional

  const data = await getVentasStats(branchId, periodo, isoDate, metodo, empleadoId, search);

  return NextResponse.json(data);
}
