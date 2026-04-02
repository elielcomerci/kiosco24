import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { artDayRange } from "@/lib/utils";

type Periodo = "dia" | "semana" | "mes";

type TurnosStats = {
  turnos: Array<{
    id: string;
    employeeName: string;
    employeeId: string | null;
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    closingAmount: number | null;
    expectedAmount: number | null;
    difference: number | null;
    ventasTotal: number;
    ventasCantidad: number;
    gastosTotal: number;
    gastosCantidad: number;
    retirosTotal: number;
    retirosCantidad: number;
    duracionMinutos: number | null;
  }>;
  resumen: {
    totalTurnos: number;
    turnosAbiertos: number;
    turnosCerrados: number;
    diferenciaPromedio: number;
    diferenciaTotal: number;
    turnosConDiferenciaNegativa: number;
    duracionPromedioMinutos: number | null;
  };
  diferenciasPorTurno: Array<{
    id: string;
    label: string;
    difference: number;
  }>;
};

const getTurnosStatsCached = unstable_cache(
  async (
    branchId: string,
    periodo: Periodo,
    isoDate: string,
    empleadoId: string,
    estado: string,
    cashierEmployeeId: string
  ): Promise<TurnosStats> => {
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
      openedAt: { gte: start, lte: end },
    };

    if (cashierEmployeeId) {
      where.employeeId = cashierEmployeeId;
    } else if (empleadoId) {
      where.employeeId = empleadoId;
    }

    if (estado === "abiertos") {
      where.closedAt = null;
    } else if (estado === "cerrados") {
      where.closedAt = { not: null };
    }

    const turnos = await prisma.shift.findMany({
      where,
      select: {
        id: true,
        employeeName: true,
        employeeId: true,
        openedAt: true,
        closedAt: true,
        openingAmount: true,
        closingAmount: true,
        expectedAmount: true,
        difference: true,
      },
      orderBy: { openedAt: "desc" },
    });

    if (turnos.length === 0) {
      return {
        turnos: [],
        resumen: {
          totalTurnos: 0,
          turnosAbiertos: 0,
          turnosCerrados: 0,
          diferenciaPromedio: 0,
          diferenciaTotal: 0,
          turnosConDiferenciaNegativa: 0,
          duracionPromedioMinutos: null,
        },
        diferenciasPorTurno: [],
      };
    }

    const shiftIds = turnos.map((turno) => turno.id);

    const [ventasAgg, gastosAgg, retirosAgg] = await Promise.all([
      prisma.sale.groupBy({
        by: ["shiftId"],
        where: { shiftId: { in: shiftIds }, voided: false },
        _sum: { total: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["shiftId"],
        where: { shiftId: { in: shiftIds } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.withdrawal.groupBy({
        by: ["shiftId"],
        where: { shiftId: { in: shiftIds } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const ventasByShift = new Map(
      ventasAgg
        .filter((row) => row.shiftId)
        .map((row) => [
          row.shiftId as string,
          { total: row._sum.total ?? 0, count: row._count },
        ])
    );
    const gastosByShift = new Map(
      gastosAgg
        .filter((row) => row.shiftId)
        .map((row) => [
          row.shiftId as string,
          { total: row._sum.amount ?? 0, count: row._count },
        ])
    );
    const retirosByShift = new Map(
      retirosAgg
        .filter((row) => row.shiftId)
        .map((row) => [
          row.shiftId as string,
          { total: row._sum.amount ?? 0, count: row._count },
        ])
    );

    const turnosConDatos = turnos.map((turno) => {
      const ventas = ventasByShift.get(turno.id) ?? { total: 0, count: 0 };
      const gastos = gastosByShift.get(turno.id) ?? { total: 0, count: 0 };
      const retiros = retirosByShift.get(turno.id) ?? { total: 0, count: 0 };

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
        ventasTotal: ventas.total,
        ventasCantidad: ventas.count,
        gastosTotal: gastos.total,
        gastosCantidad: gastos.count,
        retirosTotal: retiros.total,
        retirosCantidad: retiros.count,
        duracionMinutos,
      };
    });

    const totalTurnos = turnosConDatos.length;
    const turnosAbiertos = turnosConDatos.filter((turno) => !turno.closedAt).length;
    const turnosCerrados = turnosConDatos.filter((turno) => turno.closedAt).length;
    const diferenciaPromedio =
      turnosCerrados > 0
        ? turnosConDatos
            .filter((turno) => turno.difference !== null)
            .reduce((sum, turno) => sum + (turno.difference ?? 0), 0) / turnosCerrados
        : 0;
    const diferenciaTotal = turnosConDatos.reduce((sum, turno) => sum + (turno.difference ?? 0), 0);
    const turnosConDiferenciaNegativa = turnosConDatos.filter((turno) => (turno.difference ?? 0) < 0).length;
    const turnosConDuracion = turnosConDatos.filter((turno) => turno.duracionMinutos !== null);
    const duracionPromedioMinutos =
      turnosConDuracion.length > 0
        ? turnosConDuracion.reduce((sum, turno) => sum + (turno.duracionMinutos ?? 0), 0) / turnosConDuracion.length
        : null;

    const diferenciasPorTurno = turnosConDatos
      .filter((turno) => turno.closedAt !== null)
      .map((turno) => ({
        id: turno.id,
        label: `${turno.employeeName} - ${new Date(turno.openedAt).toLocaleDateString("es-AR", {
          day: "numeric",
          month: "short",
        })}`,
        difference: turno.difference ?? 0,
      }));

    return {
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
    };
  },
  ["stats-turnos"],
  { revalidate: 30 }
);

export { getTurnosStatsCached as getTurnosStats };
