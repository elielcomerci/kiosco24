import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/empleados?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&rol=CASHIER|MANAGER
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
  const rol = searchParams.get("rol"); // optional - CASHIER | MANAGER

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

  // Aggregate data for each employee
  const empleadosConDatos = await Promise.all(
    empleados.map(async (empleado) => {
      // Sales by this employee (as creator)
      const ventas = await prisma.sale.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
          voided: false,
        },
        _sum: { total: true },
        _count: true,
      });

      // Voided sales (anulaciones)
      const anulaciones = await prisma.sale.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
          voided: true,
        },
        _sum: { total: true },
        _count: true,
      });

      // Expenses created by this employee
      const gastos = await prisma.expense.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      });

      // Withdrawals created by this employee
      const retiros = await prisma.withdrawal.aggregate({
        where: {
          createdByEmployeeId: empleado.id,
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      });

      // Shifts worked
      const turnos = await prisma.shift.count({
        where: {
          employeeId: empleado.id,
          openedAt: { gte: start, lte: end },
        },
      });

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

      return {
        id: empleado.id,
        name: empleado.name,
        role: empleado.role,
        active: empleado.active,
        suspendedUntil: empleado.suspendedUntil?.toISOString() ?? null,
        ventasCantidad,
        ventasTotal: Math.round(ventasTotal),
        ticketPromedio: Math.round(ticketPromedio),
        gastosCantidad: gastos._count,
        gastosTotal: Math.round(gastos._sum.amount ?? 0),
        retirosCantidad: retiros._count,
        retirosTotal: Math.round(retiros._sum.amount ?? 0),
        turnosCantidad: turnos,
        reposicionesCantidad: reposiciones,
        anulacionesCantidad: anulaciones._count,
        anulacionesTotal: Math.round(anulaciones._sum.total ?? 0),
      };
    })
  );

  // Summary
  const totalEmpleados = empleadosConDatos.length;
  const empleadosActivos = empleadosConDatos.filter((e) => e.active && !e.suspendedUntil).length;
  const empleadosSuspendidos = empleadosConDatos.filter((e) => e.suspendedUntil).length;

  // Top employee by sales
  const topEmpleado = empleadosConDatos.length > 0
    ? empleadosConDatos.reduce((max, e) => e.ventasTotal > max.ventasTotal ? e : max, empleadosConDatos[0])
    : null;

  // Ranking
  const ranking = empleadosConDatos
    .sort((a, b) => b.ventasTotal - a.ventasTotal)
    .slice(0, 5)
    .map((e, i) => ({
      id: e.id,
      name: e.name,
      total: e.ventasTotal,
      rank: i + 1,
    }));

  return NextResponse.json({
    empleados: empleadosConDatos,
    ranking,
    resumen: {
      totalEmpleados,
      empleadosActivos,
      empleadosSuspendidos,
      topEmpleadoId: topEmpleado?.id ?? null,
      topEmpleadoVentas: topEmpleado?.ventasTotal ?? 0,
    },
  });
}
