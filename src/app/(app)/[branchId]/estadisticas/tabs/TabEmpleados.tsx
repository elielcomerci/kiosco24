"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, BarChart, EmptyState } from "@/components/stats";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  gastosCantidad: number;
  gastosTotal: number;
  retirosCantidad: number;
  retirosTotal: number;
  turnosCantidad: number;
  reposicionesCantidad: number;
  anulacionesCantidad: number;
  anulacionesTotal: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  CASHIER: "Cajero",
  MANAGER: "Encargado",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function VentasPorFranjaChart({ ventasPorFranja }: { ventasPorFranja: FranjaData[] }) {
  return (
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
        data={ventasPorFranja.map((f) => ({ label: f.label, total: f.total }))}
        valueKey="total"
        labelKey="label"
      />
    </div>
  );
}

function VentasPorDiaChart({ ventasPorDia }: { ventasPorDia: DiaData[] }) {
  return (
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
        data={ventasPorDia.map((d) => ({ label: d.dia, total: d.total }))}
        valueKey="total"
        labelKey="label"
      />
    </div>
  );
}

function EmpleadosTable({
  empleados,
  page,
  setPage,
}: {
  empleados: EmpleadoItem[];
  page: number;
  setPage: (p: number) => void;
}) {
  const itemsPerPage = 20;
  const totalPages = Math.ceil(empleados.length / itemsPerPage);
  const paginatedEmpleados = empleados.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
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
        Equipo de trabajo
      </h3>

      {empleados.length === 0 ? (
        <EmptyState emoji="📭" title="Sin empleados" description="No hay empleados para mostrar" />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Empleado</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Rol</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Estado</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Horas</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Venta/Hora</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Ventas</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Ticket Prom.</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Gastos</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Turnos</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmpleados.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: !emp.active || emp.suspendedUntil ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-2)" }}>
                        {emp.name}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: emp.role === "MANAGER" ? "rgba(34,197,94,0.15)" : "var(--surface-2)",
                          color: emp.role === "MANAGER" ? "var(--green)" : "var(--text-3)",
                        }}
                      >
                        {ROLE_LABEL[emp.role] ?? emp.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {emp.suspendedUntil ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(239,68,68,0.15)",
                            color: "var(--red)",
                          }}
                        >
                          Suspendido
                        </span>
                      ) : emp.active ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(34,197,94,0.15)",
                            color: "var(--green)",
                          }}
                        >
                          Activo
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--surface-2)",
                            color: "var(--text-3)",
                          }}
                        >
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {emp.horasTrabajadas}h
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--primary)",
                        }}
                      >
                        {formatARS(emp.ventaPorHora)}/h
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 700 }}>{formatARS(emp.ventasTotal)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {emp.ventasCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {formatARS(emp.ticketPromedio)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600, color: "var(--red)" }}>
                        {formatARS(emp.gastosTotal)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {emp.gastosCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ color: "var(--text-2)" }}>{emp.turnosCantidad}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                ‹ Anterior
              </button>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Página {page} de {totalPages}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                Siguiente ›
              </button>
            </div>
          )}
        </>
      )}
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
  const [page, setPage] = useState(1);

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
      setPage(1);
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

      {/* Gráfico de ventas por franja horaria */}
      <VentasPorFranjaChart ventasPorFranja={data.ventasPorFranja} />

      {/* Gráfico de ventas por día */}
      <VentasPorDiaChart ventasPorDia={data.ventasPorDia} />

      {/* Tabla de empleados */}
      <EmpleadosTable
        empleados={data.empleados}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}
