"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, BarChart, EmptyState } from "@/components/stats";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TurnoItem {
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
}

interface TurnosData {
  turnos: TurnoItem[];
  resumen: {
    totalTurnos: number;
    turnosAbiertos: number;
    turnosCerrados: number;
    diferenciaPromedio: number;
    diferenciaTotal: number;
    turnosConDiferenciaNegativa: number;
    duracionPromedioMinutos: number | null;
  };
  diferenciasPorTurno: Array<{ id: string; label: string; difference: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function TurnosFilterBar({
  estado,
  setEstado,
}: {
  estado: string;
  setEstado: (e: string) => void;
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
          Estado del turno
        </label>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
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
          <option value="todos">Todos</option>
          <option value="abiertos">Abiertos</option>
          <option value="cerrados">Cerrados</option>
        </select>
      </div>
    </div>
  );
}

function AlertasDiferenciaNegativa({ turnos }: { turnos: TurnoItem[] }) {
  const alertas = turnos.filter((t) => t.difference !== null && t.difference < 0);

  if (alertas.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.03))",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: "var(--radius-lg)",
        padding: "16px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--red)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Diferencias Negativas Detectadas
        </span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {alertas.slice(0, 5).map((turno) => (
          <div
            key={turno.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              background: "rgba(239,68,68,0.08)",
              borderRadius: "8px",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-2)" }}>
                {turno.employeeName}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                {formatDate(new Date(turno.openedAt))} {formatTime(new Date(turno.openedAt))}
              </div>
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                color: "var(--red)",
              }}
            >
              {formatARS(turno.difference ?? 0)}
            </div>
          </div>
        ))}
        {alertas.length > 5 && (
          <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", marginTop: 4 }}>
            + {alertas.length - 5} alertas más
          </div>
        )}
      </div>
    </div>
  );
}

function TurnosTable({
  turnos,
  page,
  setPage,
}: {
  turnos: TurnoItem[];
  page: number;
  setPage: (p: number) => void;
}) {
  const itemsPerPage = 20;
  const totalPages = Math.ceil(turnos.length / itemsPerPage);
  const paginatedTurnos = turnos.slice((page - 1) * itemsPerPage, page * itemsPerPage);

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
        Listado de turnos
      </h3>

      {turnos.length === 0 ? (
        <EmptyState emoji="📭" title="Sin turnos" description="No hay turnos en este período" />
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
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Apertura</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Cierre</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Apertura Caja</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Ventas</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Gastos/Retiros</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Diferencia</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Duración</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTurnos.map((turno) => (
                  <tr
                    key={turno.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: !turno.closedAt ? 0.7 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-2)" }}>
                        {turno.employeeName}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{formatDate(new Date(turno.openedAt))}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {formatTime(new Date(turno.openedAt))}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {turno.closedAt ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{formatDate(new Date(turno.closedAt))}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                            {formatTime(new Date(turno.closedAt))}
                          </div>
                        </>
                      ) : (
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
                          ABIERTO
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {formatARS(turno.openingAmount)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{formatARS(turno.ventasTotal)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {turno.ventasCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600, color: "var(--red)" }}>
                        {formatARS(turno.gastosTotal + turno.retirosTotal)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {turno.gastosCantidad + turno.retirosCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {turno.difference !== null ? (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: turno.difference >= 0 ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {turno.difference >= 0 ? "+" : ""}{formatARS(turno.difference)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                        {formatDuration(turno.duracionMinutos)}
                      </span>
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

function DiferenciasChart({ diferencias }: { diferencias: TurnosData["diferenciasPorTurno"] }) {
  const data = diferencias.slice(0, 15).map((d) => ({
    label: d.label.length > 15 ? d.label.slice(0, 15) + "..." : d.label,
    diferencia: d.difference,
  }));

  if (data.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="Sin datos"
        description="No hay diferencias registradas"
      />
    );
  }

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
        Diferencias de caja por turno
      </h3>
      <BarChart
        data={data}
        valueKey="diferencia"
        labelKey="label"
        color={data.some((d) => d.diferencia < 0) ? "var(--red)" : "var(--green)"}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabTurnos({
  periodo,
  currentDate,
}: {
  periodo: string;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<TurnosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState("todos");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        periodo,
        isoDate: currentDate,
        estado,
      });

      const res = await fetch(`/api/stats/turnos?${params}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [branchId, periodo, currentDate, estado]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Cargando turnos...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <TurnosFilterBar estado={estado} setEstado={setEstado} />

      {/* Alertas de diferencia negativa */}
      <AlertasDiferenciaNegativa turnos={data.turnos} />

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Total turnos"
          value={String(data.resumen.totalTurnos)}
          sub={`${data.resumen.turnosAbiertos} abiertos · ${data.resumen.turnosCerrados} cerrados`}
        />
        <KpiCard
          label="Diferencia promedio"
          value={data.resumen.diferenciaPromedio}
          highlight={data.resumen.diferenciaPromedio >= 0}
          warning={data.resumen.diferenciaPromedio < 0}
        />
        <KpiCard
          label="Diferencia total"
          value={data.resumen.diferenciaTotal}
          highlight={data.resumen.diferenciaTotal >= 0}
          warning={data.resumen.diferenciaTotal < 0}
        />
        <KpiCard
          label="Turnos con faltante"
          value={String(data.resumen.turnosConDiferenciaNegativa)}
          warning={data.resumen.turnosConDiferenciaNegativa > 0}
          sub={data.resumen.turnosConDiferenciaNegativa > 0 ? "Requieren atención" : "Sin alertas"}
        />
      </div>

      {/* Duración promedio (si hay datos) */}
      {data.resumen.duracionPromedioMinutos !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <KpiCard
            label="Duración promedio"
            value={formatDuration(data.resumen.duracionPromedioMinutos)}
            sub="Por turno cerrado"
          />
        </div>
      )}

      {/* Gráfico de diferencias */}
      <DiferenciasChart diferencias={data.diferenciasPorTurno} />

      {/* Tabla de turnos */}
      <TurnosTable
        turnos={data.turnos}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}
