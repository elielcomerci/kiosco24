import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { artDayRange, todayART } from "@/lib/utils";

// GET /api/stats/turnos?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&empleadoId=XXX&estado=abiertos|cerrados|todos
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? "semana";
  const isoDate = searchParams.get("isoDate") ?? todayART();
  const empleadoId = searchParams.get("empleadoId"); // optional
  const estado = searchParams.get("estado") ?? "todos"; // abiertos | cerrados | todos

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

  // Build where clause
  const where: any = { branchId, openedAt: { gte: start, lte: end } };

  // CASHIER only sees their own shifts
  if (isCashier && session.user.employeeId) {
    where.employeeId = session.user.employeeId;
  }

  if (empleadoId && !isCashier) {
    where.employeeId = empleadoId;
  }

  if (estado === "abiertos") {
    where.closedAt = null;
  } else if (estado === "cerrados") {
    where.closedAt = { not: null };
  }
  // "todos" no filter on closedAt

  // Fetch shifts
  const turnos = await prisma.shift.findMany({
    where,
    include: {
      employee: { select: { name: true, id: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  // Aggregate shift data
  const turnosConDatos = await Promise.all(
    turnos.map(async (turno) => {
      // Sales in this shift
      const ventas = await prisma.sale.aggregate({
        where: { shiftId: turno.id, voided: false },
        _sum: { total: true },
        _count: true,
      });

      // Expenses in this shift
      const gastos = await prisma.expense.aggregate({
        where: { shiftId: turno.id },
        _sum: { amount: true },
        _count: true,
      });

      // Withdrawals in this shift
      const retiros = await prisma.withdrawal.aggregate({
        where: { shiftId: turno.id },
        _sum: { amount: true },
        _count: true,
      });

      // Duration in minutes
      const duracionMinutos = turno.closedAt
        ? Math.floor((turno.closedAt.getTime() - turno.openedAt.getTime()) / (1000 * 60))
        : null;

      return {
        id: turno.id,
        employeeName: turno.employeeName,
        employeeId: turno.employeeId,
        openedAt: turno.openedAt.toISOString(),
        closedAt: turno.closedAt?.toISOString() ?? null,
        openingAmount: turno.openingAmount,
        closingAmount: turno.closingAmount ?? null,
        expectedAmount: turno.expectedAmount ?? null,
        difference: turno.difference ?? null,
        ventasTotal: ventas._sum.total ?? 0,
        ventasCantidad: ventas._count,
        gastosTotal: gastos._sum.amount ?? 0,
        gastosCantidad: gastos._count,
        retirosTotal: retiros._sum.amount ?? 0,
        retirosCantidad: retiros._count,
        duracionMinutos,
      };
    })
  );

  // Summary
  const totalTurnos = turnosConDatos.length;
  const turnosAbiertos = turnosConDatos.filter((t) => !t.closedAt).length;
  const turnosCerrados = turnosConDatos.filter((t) => t.closedAt).length;
  const diferenciaPromedio = turnosCerrados > 0
    ? turnosConDatos.filter((t) => t.difference !== null).reduce((sum, t) => sum + (t.difference ?? 0), 0) / turnosCerrados
    : 0;
  const diferenciaTotal = turnosConDatos.reduce((sum, t) => sum + (t.difference ?? 0), 0);
  const turnosConDiferenciaNegativa = turnosConDatos.filter((t) => (t.difference ?? 0) < 0).length;
  const turnosConDuracion = turnosConDatos.filter((t) => t.duracionMinutos !== null);
  const duracionPromedioMinutos = turnosConDuracion.length > 0
    ? turnosConDuracion.reduce((sum, t) => sum + (t.duracionMinutos ?? 0), 0) / turnosConDuracion.length
    : null;

  // Differences by shift (for chart)
  const diferenciasPorTurno = turnosConDatos
    .filter((t) => t.closedAt !== null)
    .map((t) => ({
      id: t.id,
      label: `${t.employeeName} - ${new Date(t.openedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`,
      difference: t.difference ?? 0,
    }));

  return NextResponse.json({
    turnos: turnosConDatos,
    resumen: {
      totalTurnos,
      turnosAbiertos,
      turnosCerrados,
      diferenciaPromedio: Math.round(diferenciaPromedio),
      diferenciaTotal: Math.round(diferenciaTotal),
      turnosConDiferenciaNegativa,
      duracionPromedioMinutos: duracionPromedioMinutos ? Math.round(duracionPromedioMinutos) : null,
    },
    diferenciasPorTurno,
  });
}
