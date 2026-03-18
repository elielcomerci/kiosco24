"use client";

import { useEffect, useState } from "react";
import { formatARS } from "@/lib/utils";

interface ShiftRecord {
  id: string;
  employeeName: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  note: string | null;
  ventas: number;
  ventasEfectivo: number;
  gastos: number;
  retiros: number;
}

interface TurnosHistorialProps {
  /** ISO string — start of the period (inclusive) */
  from: string;
  /** ISO string — end of the period (inclusive) */
  to: string;
  /** If true, renders collapsed inside an accordion; otherwise always expanded */
  collapsible?: boolean;
  /** Max shifts to show (default 10) */
  limit?: number;
}

export default function TurnosHistorial({
  from,
  to,
  collapsible = false,
  limit = 10,
}: TurnosHistorialProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/turnos/historial?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${limit}`
      );
      const data = await res.json();
      setShifts(data.shifts ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!collapsible) {
      load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, collapsible]);

  const handleToggle = () => {
    if (!expanded && shifts.length === 0) {
      load();
    }
    setExpanded((v) => !v);
  };

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {loading && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--text-3)", fontSize: 14 }}>
          Cargando turnos...
        </div>
      )}
      {!loading && shifts.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--text-3)", fontSize: 14 }}>
          No hay turnos cerrados en este período.
        </div>
      )}
      {shifts.map((shift) => {
        const hasDiff = shift.difference !== null && shift.difference !== 0;
        const durationMin = shift.closedAt
          ? Math.round(
              (new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()) / 60000
            )
          : null;

        return (
          <div
            key={shift.id}
            className="card"
            style={{
              padding: "14px 16px",
              borderLeft: `3px solid ${hasDiff && shift.difference! < 0 ? "var(--red)" : "var(--border)"}`,
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{shift.employeeName}</span>
                <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: 2 }}>
                  {new Date(shift.openedAt).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  ·{" "}
                  {new Date(shift.openedAt).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {shift.closedAt &&
                    ` – ${new Date(shift.closedAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`}
                  {durationMin !== null && (
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>
                      ({durationMin < 60 ? `${durationMin}min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}min`})
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{formatARS(shift.ventas)}</div>
                <div style={{ fontSize: "11px", color: "var(--text-3)" }}>en ventas</div>
              </div>
            </div>

            {/* Cash flow detail */}
            {shift.expectedAmount !== null && (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm, 6px)",
                  padding: "10px 12px",
                  fontSize: "13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-3)" }}>Apertura</span>
                  <span>{formatARS(shift.openingAmount)}</span>
                </div>
                {shift.gastos > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Gastos</span>
                    <span style={{ color: "var(--red)" }}>-{formatARS(shift.gastos)}</span>
                  </div>
                )}
                {shift.retiros > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Retiros</span>
                    <span style={{ color: "var(--red)" }}>-{formatARS(shift.retiros)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: 4,
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ color: "var(--text-3)" }}>Esperado</span>
                  <span style={{ fontWeight: 600 }}>{formatARS(shift.expectedAmount)}</span>
                </div>
                {shift.closingAmount !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Contado</span>
                    <span>{formatARS(shift.closingAmount)}</span>
                  </div>
                )}
                {hasDiff && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 700,
                      color: shift.difference! < 0 ? "var(--red)" : "var(--green)",
                      marginTop: 2,
                      paddingTop: 4,
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <span>{shift.difference! < 0 ? "⚠️ Faltante" : "✓ Sobrante"}</span>
                    <span>
                      {shift.difference! < 0 ? "" : "+"}
                      {formatARS(shift.difference!)}
                    </span>
                  </div>
                )}
                {!hasDiff && (
                  <div
                    style={{
                      textAlign: "center",
                      fontWeight: 600,
                      color: "var(--green)",
                      fontSize: "12px",
                      marginTop: 2,
                    }}
                  >
                    ✓ Caja exacta
                  </div>
                )}
                {shift.note && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "var(--text-3)",
                      fontStyle: "italic",
                    }}
                  >
                    {shift.note}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {total > shifts.length && (
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", paddingTop: 4 }}>
          Mostrando {shifts.length} de {total} turnos
        </p>
      )}
    </div>
  );

  if (!collapsible) {
    return content;
  }

  return (
    <div>
      <button
        className="btn btn-ghost"
        style={{
          width: "100%",
          justifyContent: "space-between",
          padding: "14px 12px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: expanded ? "var(--radius) var(--radius) 0 0" : "var(--radius)",
        }}
        onClick={handleToggle}
      >
        <span style={{ fontWeight: 600, color: "var(--text-2)" }}>🕐 Turnos cerrados</span>
        <span style={{ color: "var(--text-3)" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderTop: "none",
            borderRadius: "0 0 var(--radius) var(--radius)",
            padding: "12px",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
