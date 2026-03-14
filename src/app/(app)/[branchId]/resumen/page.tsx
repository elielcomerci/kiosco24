"use client";

import { useEffect, useState } from "react";
import { formatARS } from "@/lib/utils";

interface ResumenData {
  totalVentas: number;
  totalGastos: number;
  enCaja: number;
  ganancia: number | null;
  horasHoy: number;
  hasCosts: boolean;
  shifts: {
    id: string;
    employeeName: string;
    openedAt: string;
    closedAt: string | null;
    ventas: number;
    difference: number | null;
  }[];
  fiados: { name: string; total: number }[];
}

export default function ResumenPage() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/resumen/hoy")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--text-3)" }}>
        Cargando...
      </div>
    );
  }

  if (!data) return null;

  const showGanancia = data.hasCosts && data.ganancia !== null;

  return (
    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Hero — número emocional */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "var(--radius-lg)",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {data.horasHoy > 0 && (
          <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
            Hoy trabajaste {data.horasHoy} {data.horasHoy === 1 ? "hora" : "horas"}
          </p>
        )}
        {showGanancia ? (
          <>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "var(--green)", letterSpacing: "-0.02em" }}>
              Ganaste {formatARS(data.ganancia!)}
            </div>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>
              Ventas − costo de mercadería − gastos
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>
              {formatARS(data.totalVentas)}
            </div>
            <p style={{ color: "var(--text-2)", fontSize: "14px" }}>en ventas hoy</p>
            {!data.hasCosts && (
              <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "4px" }}>
                Cargá el costo de tus productos para ver tu ganancia real
              </p>
            )}
          </>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
        {[
          { label: "Ventas hoy", value: formatARS(data.totalVentas), color: "var(--text)" },
          { label: "Gastos", value: formatARS(data.totalGastos), color: "var(--red)" },
          { label: "En caja", value: formatARS(data.enCaja), color: "var(--green)" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Separator */}
      <div className="separator" />

      {/* Turnos */}
      {data.shifts.length > 0 && (
        <div>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
            Turnos de hoy
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.shifts.map((shift) => (
              <div key={shift.id} className="card" style={{ padding: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{shift.employeeName}</span>
                    <span style={{ color: "var(--text-3)", fontSize: "13px", marginLeft: "8px" }}>
                      {new Date(shift.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      {shift.closedAt
                        ? ` – ${new Date(shift.closedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
                        : " – en curso"}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600 }}>{formatARS(shift.ventas)}</span>
                </div>
                {shift.difference !== null && shift.difference !== 0 && (
                  <div style={{ marginTop: "6px", fontSize: "13px", color: shift.difference < 0 ? "var(--red)" : "var(--green)" }}>
                    {shift.difference < 0 ? "⚠️ " : "✓ "}
                    Diferencia: {formatARS(shift.difference)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fiados del día */}
      {data.fiados.length > 0 && (
        <>
          <div className="separator" />
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
              Fiados de hoy
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {data.fiados.map((f) => (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{f.name}</span>
                  <span style={{ fontWeight: 600, color: "var(--amber)" }}>{formatARS(f.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Separator Ventas Detalladas */}
      <div className="separator" />

      {/* Ventas detalladas */}
      <VentasDetail />
    </div>
  );
}

// Subcomponente para aislar la carga del detalle
function VentasDetail() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadVentas = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoading(true);
    const res = await fetch("/api/resumen/ventas");
    const data = await res.json();
    setVentas(data);
    setLoading(false);
    setExpanded(true);
  };

  return (
    <div>
      <button 
        className="btn btn-ghost" 
        style={{ width: "100%", justifyContent: "space-between", padding: "16px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
        onClick={loadVentas}
      >
        <span style={{ fontWeight: 600, color: "var(--text-2)" }}>📋 Ver detalle de ventas</span>
        <span>{expanded ? "▴" : "▾"}</span>
      </button>

      {loading && <div style={{ textAlign: "center", padding: "20px", color: "var(--text-3)" }}>Cargando ventas...</div>}

      {expanded && !loading && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {ventas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-3)" }}>No hay ventas hoy.</div>
          ) : (
            ventas.map((v: any) => (
              <div key={v.id} className="card" style={{ padding: "12px", opacity: v.voided ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px", color: "var(--text-3)" }}>
                  <span>{new Date(v.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} • {v.employeeName}</span>
                  <span style={{ fontWeight: 600, color: v.voided ? "var(--red)" : "var(--text)" }}>
                    {v.voided ? "ANULADA" : v.paymentMethod === "CASH" ? "Efectivo" : v.paymentMethod === "CREDIT" ? "Fiado" : v.paymentMethod}
                  </span>
                </div>
                
                {v.items.map((i: any, idx: number) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "4px 0" }}>
                    <span>{i.quantity}x {i.name}</span>
                    <span>{formatARS(i.total)}</span>
                  </div>
                ))}

                <div style={{ borderTop: "1px dashed var(--border)", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>Total</span>
                  <span>{formatARS(v.total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
