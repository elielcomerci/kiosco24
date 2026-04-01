"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, BarChart, EmptyState } from "@/components/stats";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TurnoDetalle {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  difference: number | null;
  duracionMinutos: number | null;
}

interface EmpleadoItem {
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
}

interface FranjaData {
  franja: string;
  label: string;
  total: number;
}

interface DiaData {
  dia: string;
  label: string;
  total: number;
}

interface EmpleadosData {
  empleados: EmpleadoItem[];
  resumen: {
    totalEmpleados: number;
    empleadosActivos: number;
    empleadosSuspendidos: number;
    topEmpleadoId: string | null;
    topEmpleadoVentaPorHora: number;
  };
  ventasPorFranja: FranjaData[];
  ventasPorDia: DiaData[];
}

type VistaTipo = "diaria" | "semanal" | "mensual";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  CASHIER: "Cajero",
  MANAGER: "Encargado",
};

const DIAS_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VistaSelector({
  vista,
  setVista,
}: {
  vista: VistaTipo;
  setVista: (v: VistaTipo) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        background: "var(--surface-2)",
        padding: 4,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        marginBottom: 16,
        width: "fit-content",
      }}
    >
      {[
        { value: "diaria", label: "📅 Diaria" },
        { value: "semanal", label: "📆 Semanal" },
        { value: "mensual", label: "📊 Mensual" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setVista(option.value as VistaTipo)}
          style={{
            border: "none",
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: "calc(var(--radius) - 2px)",
            fontSize: 13,
            fontWeight: 700,
            background: vista === option.value ? "var(--primary)" : "transparent",
            color: vista === option.value ? "#000" : "var(--text-2)",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmpleadosFilterBar({
  rol,
  setRol,
}: {
  rol: string;
  setRol: (r: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-3)",
            marginBottom: 4,
          }}
        >
          Rol
        </label>
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          <option value="">Todos los roles</option>
          <option value="CASHIER">Cajeros</option>
          <option value="MANAGER">Encargados</option>
        </select>
      </div>
    </div>
  );
}

// ─── Vista Diaria ─────────────────────────────────────────────────────────────

function VistaDiaria({ empleados }: { empleados: EmpleadoItem[] }) {
  if (empleados.length === 0) {
    return <EmptyState emoji="📭" title="Sin empleados" description="No hay empleados para mostrar" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empleados.map((emp) => (
        <div
          key={emp.id}
          className="card"
          style={{ padding: "16px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "2px solid var(--border)",
            }}
          >
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-2)" }}>
                {emp.name}
              </h3>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                {ROLE_LABEL[emp.role]} · {emp.turnosCantidad} turno{emp.turnosCantidad !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Horas trabajadas
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>
                {emp.horasTrabajadas}h
              </div>
            </div>
          </div>

          {emp.turnos.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {emp.turnos.map((turno) => (
                <div
                  key={turno.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "12px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* Icono de estado */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: turno.closedAt ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)",
                      color: turno.closedAt ? "var(--green)" : "var(--amber)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {turno.closedAt ? "✓" : "⏳"}
                  </div>

                  {/* Información del turno */}
                  <div>
                    <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                          Apertura
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {formatTime(new Date(turno.openedAt))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                          {turno.closedAt ? "Cierre" : "Estado"}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {turno.closedAt
                            ? formatTime(new Date(turno.closedAt))
                            : "Abierto"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                          Duración
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {formatDuration(turno.duracionMinutos)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-3)" }}>
                      <span>Caja inicial: {formatARS(turno.openingAmount)}</span>
                      {turno.difference !== null && turno.difference !== undefined && (
                        <span
                          style={{
                            fontWeight: 600,
                            color: turno.difference >= 0 ? "var(--green)" : "var(--red)",
                          }}
                        >
                          Diferencia: {turno.difference >= 0 ? "+" : ""}{formatARS(turno.difference)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ventas del turno */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>
                      Ventas
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                      {formatARS(emp.ventasTotal)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-3)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div>Sin turnos en este período</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Vista Semanal ────────────────────────────────────────────────────────────

function VistaSemanal({ empleados }: { empleados: EmpleadoItem[] }) {
  if (empleados.length === 0) {
    return <EmptyState emoji="📭" title="Sin empleados" description="No hay empleados para mostrar" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empleados.map((emp) => {
        const asistenciaColor = emp.ausencias === 0
          ? "var(--green)"
          : emp.ausencias <= 2
          ? "var(--amber)"
          : "var(--red)";

        return (
          <div
            key={emp.id}
            className="card"
            style={{ padding: "16px" }}
          >
            {/* Header del empleado */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 16,
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: "2px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Empleado
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-2)" }}>
                  {emp.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {ROLE_LABEL[emp.role]}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Asistencia
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: asistenciaColor }}>
                  {emp.diasTrabajados}/{emp.diasProgramados} días
                </div>
                {emp.ausencias > 0 && (
                  <div style={{ fontSize: 12, color: "var(--red)", marginTop: 2 }}>
                    {emp.ausencias} falta{emp.ausencias !== 1 ? "s" : ""}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Horas totales
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)" }}>
                  {emp.horasTrabajadas}h
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Venta/hora
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--green)" }}>
                  {formatARS(emp.ventaPorHora)}/h
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Ventas total
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                  {formatARS(emp.ventasTotal)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {emp.ventasCantidad} operaciones
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Ticket prom.
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-2)" }}>
                  {formatARS(emp.ticketPromedio)}
                </div>
              </div>
            </div>

            {/* Calendario visual de la semana */}
            <div>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8 }}>
                Días trabajados esta semana
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {DIAS_LABEL.map((dia, idx) => {
                  // Simplemente mostramos los días, en el futuro podríamos marcar cuáles trabajó
                  const trabajoHoy = idx < emp.diasTrabajados;
                  return (
                    <div
                      key={dia}
                      style={{
                        padding: "8px 4px",
                        borderRadius: "var(--radius)",
                        background: trabajoHoy
                          ? "rgba(34,197,94,0.15)"
                          : "var(--surface-2)",
                        border: `1px solid ${trabajoHoy ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 4 }}>
                        {dia.slice(0, 3)}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>
                        {trabajoHoy ? "✅" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista Mensual ────────────────────────────────────────────────────────────

function VistaMensual({ empleados }: { empleados: EmpleadoItem[] }) {
  if (empleados.length === 0) {
    return <EmptyState emoji="📭" title="Sin empleados" description="No hay empleados para mostrar" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {empleados.map((emp) => {
        const ausenciasPorcentaje = emp.diasProgramados > 0
          ? Math.round((emp.ausencias / emp.diasProgramados) * 100)
          : 0;

        return (
          <div
            key={emp.id}
            className="card"
            style={{ padding: "16px" }}
          >
            {/* Header con resumen */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: "2px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Empleado
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-2)" }}>
                  {emp.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {ROLE_LABEL[emp.role]}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Horas para liquidar
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--primary)" }}>
                  {emp.horasTrabajadas}h
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {emp.turnosCantidad} turnos
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Asistencia
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, color: emp.ausencias > 2 ? "var(--red)" : "var(--green)" }}>
                  {emp.diasTrabajados}/{emp.diasProgramados}
                </div>
                {emp.ausencias > 0 && (
                  <div style={{ fontSize: 12, color: "var(--red)", marginTop: 2 }}>
                    {emp.ausencias} falta{emp.ausencias !== 1 ? "s" : ""} ({ausenciasPorcentaje}%)
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Rendimiento
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--green)" }}>
                  {formatARS(emp.ventaPorHora)}/h
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {formatARS(emp.ventasTotal)} total
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Ticket promedio
                </div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text-2)" }}>
                  {formatARS(emp.ticketPromedio)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {emp.ventasCantidad} ventas
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>
                  Gastos/Retiros
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--red)" }}>
                  {formatARS(emp.gastosTotal + emp.retirosTotal)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {emp.gastosCantidad + emp.retirosCantidad} operaciones
                </div>
              </div>
            </div>

            {/* Estadísticas adicionales */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
                padding: "12px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                  Anulaciones
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: emp.anulacionesCantidad > 0 ? "var(--red)" : "var(--text-2)" }}>
                  {emp.anulacionesCantidad} ({formatARS(emp.anulacionesTotal)})
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                  Reposiciones
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-2)" }}>
                  {emp.reposicionesCantidad}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                  Eficiencia
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--green)" }}>
                  {emp.diasProgramados > 0 ? Math.round((emp.diasTrabajados / emp.diasProgramados) * 100) : 0}% asistencia
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabEmpleados({
  periodo,
  currentDate,
}: {
  periodo: string;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<EmpleadosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [rol, setRol] = useState("");
  const [vista, setVista] = useState<VistaTipo>("semanal");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        periodo,
        isoDate: currentDate,
      });
      if (rol) params.set("rol", rol);

      const res = await fetch(`/api/stats/empleados?${params}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [branchId, periodo, currentDate, rol]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Cargando empleados...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Selector de vista */}
      <VistaSelector vista={vista} setVista={setVista} />

      {/* Filtros */}
      <EmpleadosFilterBar rol={rol} setRol={setRol} />

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Total empleados"
          value={String(data.resumen.totalEmpleados)}
          sub={`${data.resumen.empleadosActivos} activos · ${data.resumen.empleadosSuspendidos} suspendidos`}
        />
        <KpiCard
          label="Mejor venta/hora"
          value={data.resumen.topEmpleadoId
            ? (data.empleados.find((e) => e.id === data.resumen.topEmpleadoId)?.name ?? "—")
            : "—"}
          sub={data.resumen.topEmpleadoVentaPorHora > 0 ? formatARS(data.resumen.topEmpleadoVentaPorHora) + "/h" : "Sin datos"}
          highlight
        />
      </div>

      {/* Gráficos de contexto (solo en vista semanal/mensual) */}
      {vista !== "diaria" && (
        <>
          <div className="card" style={{ padding: "16px" }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
                marginBottom: 14,
              }}
            >
              ☀️ Ventas por Franja Horaria
            </h3>
            <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-3)" }}>
              Mañana (6-12hs) · Tarde (12-18hs) · Noche (18-23hs)
            </div>
            <BarChart
              data={data.ventasPorFranja.map((f) => ({ label: f.label, total: f.total }))}
              valueKey="total"
              labelKey="label"
            />
          </div>

          <div className="card" style={{ padding: "16px" }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
                marginBottom: 14,
              }}
            >
              📅 Ventas por Día de la Semana
            </h3>
            <BarChart
              data={data.ventasPorDia.map((d) => ({ label: d.dia, total: d.total }))}
              valueKey="total"
              labelKey="label"
            />
          </div>
        </>
      )}

      {/* Vista seleccionada */}
      {vista === "diaria" && <VistaDiaria empleados={data.empleados} />}
      {vista === "semanal" && <VistaSemanal empleados={data.empleados} />}
      {vista === "mensual" && <VistaMensual empleados={data.empleados} />}
    </div>
  );
}
