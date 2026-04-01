import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/empleados?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&rol=CASHIER|MANAGER&empleadoId=XXX
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
  const rol = searchParams.get("rol"); // optional
  const empleadoId = searchParams.get("empleadoId"); // optional - para detalle individual

  // Build date range
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

  // Fetch employees for this branch
  const whereEmpleados: any = {
    branches: { some: { id: branchId } },
  };

  if (rol) {
    whereEmpleados.role = rol;
  }

  const empleados = await prisma.employee.findMany({
    where: whereEmpleados,
    include: {
      branches: { select: { id: true } },
    },
  });

  // Fetch all sales in period for analysis
  const allVentas = await prisma.sale.findMany({
    where: {
      branchId,
      createdAt: { gte: start, lte: end },
      voided: false,
    },
    select: {
      createdAt: true,
      total: true,
      createdByEmployeeId: true,
    },
  });

  // Aggregate ventas por franja horaria (global del local)
  const getFranja = (hour: number): "manana" | "tarde" | "noche" => {
    if (hour >= 6 && hour < 12) return "manana";
    if (hour >= 12 && hour < 18) return "tarde";
    return "noche";
  };

  const ventasPorFranja = { manana: 0, tarde: 0, noche: 0 };
  const ventasPorDia = [0, 0, 0, 0, 0, 0, 0]; // Dom-Sáb

  for (const venta of allVentas) {
    const hour = new Date(venta.createdAt).getHours();
    ventasPorFranja[getFranja(hour)] += venta.total;
    ventasPorDia[new Date(venta.createdAt).getDay()] += venta.total;
  }

  // Aggregate data for each employee
  const empleadosConDatos = await Promise.all(
    empleados.map(async (empleado) => {
      // Si hay empleadoId específico, filtrar solo ese empleado
      if (empleadoId && empleado.id !== empleadoId) {
        return null;
      }

      // Sales by this employee
      const ventas = await prisma.sale.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
          voided: false,
        },
        _sum: { total: true },
        _count: true,
      });

      // Voided sales
      const anulaciones = await prisma.sale.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
          voided: true,
        },
        _sum: { total: true },
        _count: true,
      });

      // Expenses
      const gastos = await prisma.expense.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      });

      // Withdrawals
      const retiros = await prisma.withdrawal.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      });

      // Shifts with details
      const turnosData = await prisma.shift.findMany({
        where: {
          employeeId: empleado.id,
          openedAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          openedAt: true,
          closedAt: true,
          openingAmount: true,
          closingAmount: true,
          expectedAmount: true,
          difference: true,
        },
        orderBy: { openedAt: "desc" },
      });

      // Calculate horas trabajadas y días
      let horasTrabajadas = 0;
      const diasSet = new Set<string>();
      const diasTrabajadosSet = new Set<string>();

      for (const turno of turnosData) {
        const openedDate = turno.openedAt.toISOString().split("T")[0];
        diasSet.add(openedDate);

        if (turno.closedAt) {
          diasTrabajadosSet.add(openedDate);
          const diffMs = turno.closedAt.getTime() - turno.openedAt.getTime();
          horasTrabajadas += diffMs / (1000 * 60 * 60);
        }
      }

      const diasProgramados = diasSet.size;
      const diasTrabajados = diasTrabajadosSet.size;
      const ausencias = diasProgramados - diasTrabajados;
      const turnosCantidad = turnosData.length;

      // Restock events
      const reposiciones = await prisma.restockEvent.count({
        where: {
          employeeId: empleado.id,
          createdAt: { gte: start, lte: end },
        },
      });

      const ventasTotal = ventas._sum.total ?? 0;
      const ventasCantidad = ventas._count;
      const ticketPromedio = ventasCantidad > 0 ? ventasTotal / ventasCantidad : 0;
      const ventaPorHora = horasTrabajadas > 0 ? ventasTotal / horasTrabajadas : 0;

      // Turnos detalle para vista diaria
      const turnosDetalle = turnosData.map((t) => ({
        id: t.id,
        openedAt: t.openedAt.toISOString(),
        closedAt: t.closedAt?.toISOString() ?? null,
        openingAmount: t.openingAmount,
        closingAmount: t.closingAmount ?? null,
        difference: t.difference ?? null,
        duracionMinutos: t.closedAt
          ? Math.floor((t.closedAt.getTime() - t.openedAt.getTime()) / (1000 * 60))
          : null,
      }));

      return {
        id: empleado.id,
        name: empleado.name,
        role: empleado.role,
        active: empleado.active,
        suspendedUntil: empleado.suspendedUntil?.toISOString() ?? null,
        ventasCantidad,
        ventasTotal: Math.round(ventasTotal),
        ticketPromedio: Math.round(ticketPromedio),
        ventaPorHora: Math.round(ventaPorHora),
        horasTrabajadas: Math.round(horasTrabajadas),
        diasProgramados,
        diasTrabajados,
        ausencias,
        gastosCantidad: gastos._count,
        gastosTotal: Math.round(gastos._sum.amount ?? 0),
        retirosCantidad: retiros._count,
        retirosTotal: Math.round(retiros._sum.amount ?? 0),
        turnosCantidad,
        reposicionesCantidad: reposiciones,
        anulacionesCantidad: anulaciones._count,
        anulacionesTotal: Math.round(anulaciones._sum.total ?? 0),
        turnos: turnosDetalle,
      };
    })
  );

  const empleadosFiltrados = empleadosConDatos.filter((e) => e !== null);

  // Summary
  const totalEmpleados = empleadosFiltrados.length;
  const empleadosActivos = empleadosFiltrados.filter((e) => e!.active && !e!.suspendedUntil).length;
  const empleadosSuspendidos = empleadosFiltrados.filter((e) => e!.suspendedUntil).length;

  // Top employee by ventaPorHora
  const topEmpleado = empleadosFiltrados
    .filter((e) => e!.horasTrabajadas > 0)
    .length > 0
    ? empleadosFiltrados
        .filter((e) => e!.horasTrabajadas > 0)
        .reduce((max, e) => e!.ventaPorHora > max.ventaPorHora ? e : max, empleadosFiltrados[0])
    : null;

  // Ventas por franja horaria
  const franjasParaGrafico = [
    { franja: "Mañana", label: "☀️ 6-12hs", total: Math.round(ventasPorFranja.manana) },
    { franja: "Tarde", label: "🌆 12-18hs", total: Math.round(ventasPorFranja.tarde) },
    { franja: "Noche", label: "🌙 18-23hs", total: Math.round(ventasPorFranja.noche) },
  ];

  // Ventas por día de la semana
  const DIAS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const diasParaGrafico = ventasPorDia.map((total, idx) => ({
    dia: DIAS_LABEL[idx],
    label: DIAS_LABEL[idx],
    total: Math.round(total),
  }));

  return NextResponse.json({
    empleados: empleadosFiltrados,
    resumen: {
      totalEmpleados,
      empleadosActivos,
      empleadosSuspendidos,
      topEmpleadoId: topEmpleado?.id ?? null,
      topEmpleadoVentaPorHora: topEmpleado?.ventaPorHora ?? 0,
    },
    ventasPorFranja: franjasParaGrafico,
    ventasPorDia: diasParaGrafico,
  });
}
