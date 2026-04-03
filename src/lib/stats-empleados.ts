
import { prisma } from "@/lib/prisma";
import { artDayRange } from "@/lib/utils";

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

type TurnoDetalle = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  difference: number | null;
  duracionMinutos: number | null;
};

type EmpleadoStats = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  suspendedUntil: string | null;
  ventasCantidad: number;
  ventasTotal: number;
  ticketPromedio: number;
  ventaPorHora: number;
  horasTrabajadas: number;
  diasProgramados: number;
  diasTrabajados: number;
  ausencias: number;
  gastosCantidad: number;
  gastosTotal: number;
  retirosCantidad: number;
  retirosTotal: number;
  turnosCantidad: number;
  reposicionesCantidad: number;
  anulacionesCantidad: number;
  anulacionesTotal: number;
  turnos: TurnoDetalle[];
};

type EmpleadosStats = {
  empleados: EmpleadoStats[];
  resumen: {
    totalEmpleados: number;
    empleadosActivos: number;
    empleadosSuspendidos: number;
    topEmpleadoId: string | null;
    topEmpleadoVentaPorHora: number;
  };
  ventasPorFranja: Array<{ franja: string; label: string; total: number }>;
  ventasPorDia: Array<{ dia: string; label: string; total: number }>;
};

function buildDateRange(periodo: string, isoDate: string) {
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

  return { start, end };
}

function toARTDateKey(date: Date): string {
  return new Date(date.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10);
}

function toARTHour(date: Date): number {
  return new Date(date.getTime() - ART_OFFSET_MS).getUTCHours();
}

export const getEmpleadosStats = async (
    branchId: string,
    periodo: string,
    isoDate: string,
    rol: string,
    empleadoId: string
  ): Promise<EmpleadosStats> => {
    const { start, end } = buildDateRange(periodo, isoDate);

    const whereEmpleados: any = {
      branches: { some: { id: branchId } },
    };

    if (rol) {
      whereEmpleados.role = rol;
    }

    if (empleadoId) {
      whereEmpleados.id = empleadoId;
    }

    const empleados = await prisma.employee.findMany({
      where: whereEmpleados,
      select: {
        id: true,
        name: true,
        role: true,
        active: true,
        suspendedUntil: true,
      },
    });

    if (empleados.length === 0) {
      return {
        empleados: [],
        resumen: {
          totalEmpleados: 0,
          empleadosActivos: 0,
          empleadosSuspendidos: 0,
          topEmpleadoId: null,
          topEmpleadoVentaPorHora: 0,
        },
        ventasPorFranja: [
          { franja: "MaÃ±ana", label: "â˜€ï¸ 6-12hs", total: 0 },
          { franja: "Tarde", label: "ðŸŒ† 12-18hs", total: 0 },
          { franja: "Noche", label: "ðŸŒ™ 18-23hs", total: 0 },
        ],
        ventasPorDia: ["Dom", "Lun", "Mar", "MiÃ©", "Jue", "Vie", "SÃ¡b"].map((dia) => ({
          dia,
          label: dia,
          total: 0,
        })),
      };
    }

    const employeeIds = empleados.map((empleado) => empleado.id);

    const [
      ventas,
      ventasAgg,
      anulacionesAgg,
      gastosAgg,
      retirosAgg,
      reposicionesAgg,
      turnosData,
    ] = await Promise.all([
      prisma.sale.findMany({
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          voided: false,
        },
        select: {
          createdAt: true,
          total: true,
        },
      }),
      prisma.sale.groupBy({
        by: ["createdByEmployeeId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          voided: false,
          createdByEmployeeId: { in: employeeIds },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.sale.groupBy({
        by: ["createdByEmployeeId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          voided: true,
          createdByEmployeeId: { in: employeeIds },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["createdByEmployeeId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          createdByEmployeeId: { in: employeeIds },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.withdrawal.groupBy({
        by: ["createdByEmployeeId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          createdByEmployeeId: { in: employeeIds },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.restockEvent.groupBy({
        by: ["employeeId"],
        where: {
          branchId,
          createdAt: { gte: start, lte: end },
          employeeId: { in: employeeIds },
        },
        _count: true,
      }),
      prisma.shift.findMany({
        where: {
          branchId,
          employeeId: { in: employeeIds },
          openedAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          employeeId: true,
          openedAt: true,
          closedAt: true,
          openingAmount: true,
          closingAmount: true,
          difference: true,
        },
        orderBy: { openedAt: "desc" },
      }),
    ]);

    const ventasByEmployee = new Map(
      ventasAgg
        .filter((row) => row.createdByEmployeeId)
        .map((row) => [
          row.createdByEmployeeId as string,
          {
            total: row._sum.total ?? 0,
            count: row._count,
          },
        ])
    );
    const anulacionesByEmployee = new Map(
      anulacionesAgg
        .filter((row) => row.createdByEmployeeId)
        .map((row) => [
          row.createdByEmployeeId as string,
          {
            total: row._sum.total ?? 0,
            count: row._count,
          },
        ])
    );
    const gastosByEmployee = new Map(
      gastosAgg
        .filter((row) => row.createdByEmployeeId)
        .map((row) => [
          row.createdByEmployeeId as string,
          {
            total: row._sum.amount ?? 0,
            count: row._count,
          },
        ])
    );
    const retirosByEmployee = new Map(
      retirosAgg
        .filter((row) => row.createdByEmployeeId)
        .map((row) => [
          row.createdByEmployeeId as string,
          {
            total: row._sum.amount ?? 0,
            count: row._count,
          },
        ])
    );
    const reposicionesByEmployee = new Map(
      reposicionesAgg
        .filter((row): row is (typeof reposicionesAgg)[number] & { employeeId: string } => Boolean(row.employeeId))
        .map((row) => [row.employeeId, row._count])
    );
    const turnosByEmployee = new Map<string, typeof turnosData>();
    for (const turno of turnosData) {
      if (!turno.employeeId) {
        continue;
      }

      const bucket = turnosByEmployee.get(turno.employeeId);
      if (bucket) {
        bucket.push(turno);
      } else {
        turnosByEmployee.set(turno.employeeId, [turno]);
      }
    }

    const ventasPorFranjaTotals = { manana: 0, tarde: 0, noche: 0 };
    const ventasPorDiaTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const venta of ventas) {
      const hour = toARTHour(venta.createdAt);
      if (hour >= 6 && hour < 12) {
        ventasPorFranjaTotals.manana += venta.total;
      } else if (hour >= 12 && hour < 18) {
        ventasPorFranjaTotals.tarde += venta.total;
      } else {
        ventasPorFranjaTotals.noche += venta.total;
      }

      const dayIndex = new Date(venta.createdAt.getTime() - ART_OFFSET_MS).getUTCDay();
      ventasPorDiaTotals[dayIndex] += venta.total;
    }

    const empleadosConDatos = empleados.map((empleado) => {
      const ventasData = ventasByEmployee.get(empleado.id);
      const anulacionesData = anulacionesByEmployee.get(empleado.id);
      const gastosData = gastosByEmployee.get(empleado.id);
      const retirosData = retirosByEmployee.get(empleado.id);
      const reposicionesCantidad = reposicionesByEmployee.get(empleado.id) ?? 0;
      const shiftRows = turnosByEmployee.get(empleado.id) ?? [];

      let horasTrabajadas = 0;
      const diasSet = new Set<string>();
      const diasTrabajadosSet = new Set<string>();

      const turnos = shiftRows.map((turno) => {
        const openedDate = toARTDateKey(turno.openedAt);
        diasSet.add(openedDate);

        let duracionMinutos: number | null = null;
        if (turno.closedAt) {
          diasTrabajadosSet.add(openedDate);
          const diffMs = turno.closedAt.getTime() - turno.openedAt.getTime();
          horasTrabajadas += diffMs / (1000 * 60 * 60);
          duracionMinutos = Math.floor(diffMs / (1000 * 60));
        }

        return {
          id: turno.id,
          openedAt: turno.openedAt.toISOString(),
          closedAt: turno.closedAt?.toISOString() ?? null,
          openingAmount: turno.openingAmount,
          closingAmount: turno.closingAmount ?? null,
          difference: turno.difference ?? null,
          duracionMinutos,
        };
      });

      const diasProgramados = diasSet.size;
      const diasTrabajados = diasTrabajadosSet.size;
      const ausencias = diasProgramados - diasTrabajados;
      const turnosCantidad = shiftRows.length;

      const ventasTotal = ventasData?.total ?? 0;
      const ventasCantidad = ventasData?.count ?? 0;
      const ticketPromedio = ventasCantidad > 0 ? ventasTotal / ventasCantidad : 0;
      const ventaPorHora = horasTrabajadas > 0 ? ventasTotal / horasTrabajadas : 0;

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
        gastosCantidad: gastosData?.count ?? 0,
        gastosTotal: Math.round(gastosData?.total ?? 0),
        retirosCantidad: retirosData?.count ?? 0,
        retirosTotal: Math.round(retirosData?.total ?? 0),
        turnosCantidad,
        reposicionesCantidad,
        anulacionesCantidad: anulacionesData?.count ?? 0,
        anulacionesTotal: Math.round(anulacionesData?.total ?? 0),
        turnos,
      };
    });

    let empleadosActivos = 0;
    let empleadosSuspendidos = 0;
    let topEmpleado: EmpleadoStats | null = null;

    for (const empleado of empleadosConDatos) {
      if (empleado.active && !empleado.suspendedUntil) {
        empleadosActivos++;
      }
      if (empleado.suspendedUntil) {
        empleadosSuspendidos++;
      }
      if (empleado.horasTrabajadas > 0) {
        if (!topEmpleado || empleado.ventaPorHora > topEmpleado.ventaPorHora) {
          topEmpleado = empleado;
        }
      }
    }

    return {
      empleados: empleadosConDatos,
      resumen: {
        totalEmpleados: empleadosConDatos.length,
        empleadosActivos,
        empleadosSuspendidos,
        topEmpleadoId: topEmpleado?.id ?? null,
        topEmpleadoVentaPorHora: topEmpleado?.ventaPorHora ?? 0,
      },
      ventasPorFranja: [
        { franja: "MaÃ±ana", label: "â˜€ï¸ 6-12hs", total: Math.round(ventasPorFranjaTotals.manana) },
        { franja: "Tarde", label: "ðŸŒ† 12-18hs", total: Math.round(ventasPorFranjaTotals.tarde) },
        { franja: "Noche", label: "ðŸŒ™ 18-23hs", total: Math.round(ventasPorFranjaTotals.noche) },
      ],
      ventasPorDia: ["Dom", "Lun", "Mar", "MiÃ©", "Jue", "Vie", "SÃ¡b"].map((dia, idx) => ({
        dia,
        label: dia,
        total: Math.round(ventasPorDiaTotals[idx]),
      })),
    };
};
