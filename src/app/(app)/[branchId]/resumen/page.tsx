"use client";

import { useEffect, useState, useRef } from "react";
import { formatARS } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResumenData {
  // Caja física
  apertura: number;
  ventasEfectivo: number;
  totalGastos: number;
  totalRetiros: number;
  enCaja: number;

  // Otros cobros
  ventasMp: number;
  ventasDebito: number;
  ventasTransferencia: number;
  ventasTarjeta: number;
  ventasFiado: number;

  // Totales
  totalVentas: number;
  ganancia: number | null;
  hasCosts: boolean;
  horasHoy: number;

  shifts: {
    id: string;
    employeeName: string;
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    expectedAmount: number | null;
    closingAmount: number | null;
    difference: number | null;
    ventas: number;
    gastos: number;
    retiros: number;
  }[];
  fiados: { name: string; total: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CajaStat({
  label,
  value,
  sign,
  muted,
}: {
  label: string;
  value: number;
  sign?: "+" | "-";
  muted?: boolean;
}) {
  const color =
    muted
      ? "var(--text-3)"
      : sign === "+"
      ? "var(--green)"
      : sign === "-"
      ? "var(--red)"
      : "var(--text)";

  if (value === 0 && sign) return null; // Ocultar líneas en cero

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        fontSize: "14px",
      }}
    >
      <span style={{ color: "var(--text-2)" }}>
        {sign && (
          <span style={{ color, marginRight: 4, fontWeight: 700, fontSize: 13 }}>
            {sign}
          </span>
        )}
        {label}
      </span>
      <span style={{ fontWeight: 600, color }}>{formatARS(value)}</span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--border)",
        margin: "6px 0",
      }}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--text-3)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "10px",
      }}
    >
      {children}
    </h3>
  );
}

// ─── Componente Saldo MP ──────────────────────────────────────────────────────

function MpBalanceCard() {
  const [balance, setBalance] = useState<{ connected: boolean; available?: number; total?: number; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetched = useRef(0);

  const fetchBalance = async (isManualClick = false) => {
    const now = Date.now();
    // Si se hace click manual, evitar spamear (mínimo 60s entre request manuales)
    if (isManualClick && now - lastFetched.current < 60000 && balance !== null) {
      return;
    }
    
    setRefreshing(true);
    try {
      const res = await fetch("/api/mp/balance");
      const data = await res.json();
      setBalance(data);
      lastFetched.current = Date.now();
    } catch {
      // Ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return null; // Espera silenciosa
  if (!balance?.connected) return null; // Solo se muestra si está conectado

  return (
    <div
      onClick={() => fetchBalance(true)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        opacity: refreshing ? 0.6 : 1,
        transition: "opacity 0.2s"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#009ee3",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 20,
          }}
        >
          mp
        </div>
        <div>
          <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
            Tu dinero en MercadoPago
          </h3>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
            {balance.error ? (
              <span style={{ fontSize: "14px", color: "var(--red)" }}>No disponible</span>
            ) : (
              formatARS(balance.available ?? 0)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
      <div
        style={{
          textAlign: "center",
          padding: "80px 24px",
          color: "var(--text-3)",
        }}
      >
        Cargando...
      </div>
    );
  }

  if (!data) return null;

  const {
    apertura,
    ventasEfectivo,
    totalGastos,
    totalRetiros,
    enCaja,
    ventasMp,
    ventasDebito,
    ventasTransferencia,
    ventasTarjeta,
    ventasFiado,
    totalVentas,
    ganancia,
    hasCosts,
    horasHoy,
    shifts,
    fiados,
  } = data;

  const otrosCobros = ventasMp + ventasDebito + ventasTransferencia + ventasTarjeta;
  const tieneOtrosCobros = otrosCobros > 0 || ventasFiado > 0;

  return (
    <div
      style={{
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        paddingBottom: "100px",
      }}
    >
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))",
          border: "1px solid rgba(34,197,94,0.18)",
          borderRadius: "var(--radius-lg)",
          padding: "24px 20px 20px",
        }}
      >
        {horasHoy > 0 && (
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: 8 }}>
            {horasHoy} {horasHoy === 1 ? "hora" : "horas"} de turno
          </p>
        )}
        <div
          style={{
            fontSize: "36px",
            fontWeight: 800,
            color: hasCosts && ganancia !== null ? "var(--green)" : "var(--text)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {hasCosts && ganancia !== null
            ? `Ganaste ${formatARS(ganancia)}`
            : formatARS(totalVentas)}
        </div>
        <p style={{ color: "var(--text-2)", fontSize: "14px", marginTop: 6 }}>
          {hasCosts && ganancia !== null
            ? "Ganancia neta del día"
            : "en ventas totales hoy"}
        </p>
        {!hasCosts && (
          <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: 4 }}>
            Cargá el costo de tus productos para ver tu ganancia real
          </p>
        )}
      </div>

      {/* ── Saldo MercadoPago ────────────────────────────────────────────── */}
      <MpBalanceCard />

      {/* ── Caja Física ─────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "18px 16px" }}
      >
        <SectionTitle>💵 Caja física</SectionTitle>

        <CajaStat label="Apertura" value={apertura} muted />
        <CajaStat label="Ventas en efectivo" value={ventasEfectivo} sign="+" />
        <CajaStat label="Gastos" value={totalGastos} sign="-" />
        <CajaStat label="Retiros" value={totalRetiros} sign="-" />

        <Divider />

        {/* Esperado en caja = enCaja calculado */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0 4px",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "15px" }}>
            Esperado en caja
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: "20px",
              color: "var(--primary)",
            }}
          >
            {formatARS(enCaja)}
          </span>
        </div>
      </div>

      {/* ── Otros cobros ────────────────────────────────────────────────── */}
      {tieneOtrosCobros && (
        <div className="card" style={{ padding: "18px 16px" }}>
          <SectionTitle>🏦 Otros cobros (no están en el cajón)</SectionTitle>

          {ventasMp > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>📱</span> MercadoPago
              </span>
              <span style={{ fontWeight: 600 }}>{formatARS(ventasMp)}</span>
            </div>
          )}
          {ventasDebito > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>💳</span> Débito
              </span>
              <span style={{ fontWeight: 600 }}>{formatARS(ventasDebito)}</span>
            </div>
          )}
          {ventasTransferencia > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>🏦</span> Transferencia
              </span>
              <span style={{ fontWeight: 600 }}>{formatARS(ventasTransferencia)}</span>
            </div>
          )}
          {ventasTarjeta > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>🏧</span> Tarjeta de crédito
              </span>
              <span style={{ fontWeight: 600 }}>{formatARS(ventasTarjeta)}</span>
            </div>
          )}
          {ventasFiado > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                padding: "6px 0",
              }}
            >
              <span
                style={{
                  color: "var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>📋</span> Fiado (pendiente)
              </span>
              <span style={{ fontWeight: 600, color: "var(--amber)" }}>
                {formatARS(ventasFiado)}
              </span>
            </div>
          )}

          {otrosCobros > 0 && (
            <>
              <Divider />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  padding: "4px 0",
                  color: "var(--text-3)",
                }}
              >
                <span>Subtotal otros medios</span>
                <span style={{ fontWeight: 700 }}>{formatARS(otrosCobros)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Total del día ────────────────────────────────────────────────── */}
      {totalVentas > 0 && (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text-2)", fontSize: "14px" }}>
            Total del día (todos los medios)
          </span>
          <span style={{ fontWeight: 800, fontSize: "18px", color: "var(--text)" }}>
            {formatARS(totalVentas)}
          </span>
        </div>
      )}

      {/* ── Turnos ──────────────────────────────────────────────────────── */}
      {shifts.length > 0 && (
        <>
          <div className="separator" />
          <div>
            <SectionTitle>Turnos de hoy</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {shifts.map((shift) => {
                const isOpen = !shift.closedAt;
                const hasDiff =
                  shift.difference !== null && shift.difference !== 0;
                return (
                  <div
                    key={shift.id}
                    className="card"
                    style={{
                      padding: "14px 16px",
                      borderLeft: isOpen
                        ? "3px solid var(--primary)"
                        : "3px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700 }}>
                          {shift.employeeName}
                        </span>
                        {isOpen && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--primary)",
                              background: "rgba(34,197,94,0.1)",
                              padding: "2px 6px",
                              borderRadius: "99px",
                            }}
                          >
                            EN CURSO
                          </span>
                        )}
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--text-3)",
                            marginTop: 2,
                          }}
                        >
                          {new Date(shift.openedAt).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {shift.closedAt
                            ? ` – ${new Date(shift.closedAt).toLocaleTimeString(
                                "es-AR",
                                { hour: "2-digit", minute: "2-digit" }
                              )}`
                            : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>
                          {formatARS(shift.ventas)}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                          en ventas
                        </div>
                      </div>
                    </div>

                    {/* Detalle del turno cerrado */}
                    {!isOpen && shift.expectedAmount !== null && (
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
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ color: "var(--text-3)" }}>Esperado</span>
                          <span>{formatARS(shift.expectedAmount)}</span>
                        </div>
                        {shift.closingAmount !== null && (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
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
                              color:
                                shift.difference! < 0
                                  ? "var(--red)"
                                  : "var(--green)",
                              marginTop: 2,
                              paddingTop: 4,
                              borderTop: "1px dashed var(--border)",
                            }}
                          >
                            <span>
                              {shift.difference! < 0
                                ? "⚠️ Faltante"
                                : "✓ Sobrante"}
                            </span>
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Fiados ──────────────────────────────────────────────────────── */}
      {fiados.length > 0 && (
        <>
          <div className="separator" />
          <div>
            <SectionTitle>📋 Fiados de hoy</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {fiados.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span>{f.name}</span>
                  <span
                    style={{ fontWeight: 700, color: "var(--amber)" }}
                  >
                    {formatARS(f.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Ventas detalladas ────────────────────────────────────────────── */}
      <div className="separator" />
      <VentasDetail />
    </div>
  );
}

// ─── Subcomponente de detalle de ventas ───────────────────────────────────────

const METODO_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  MERCADOPAGO: "MercadoPago",
  TRANSFER: "Transferencia",
  DEBIT: "Débito",
  CREDIT_CARD: "Tarjeta",
  CREDIT: "Fiado",
};

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
        style={{
          width: "100%",
          justifyContent: "space-between",
          padding: "16px 12px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}
        onClick={loadVentas}
      >
        <span style={{ fontWeight: 600, color: "var(--text-2)" }}>
          📋 Ver detalle de ventas
        </span>
        <span style={{ color: "var(--text-3)" }}>{expanded ? "▴" : "▾"}</span>
      </button>

      {loading && (
        <div
          style={{ textAlign: "center", padding: "20px", color: "var(--text-3)" }}
        >
          Cargando ventas...
        </div>
      )}

      {expanded && !loading && (
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {ventas.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "20px",
                color: "var(--text-3)",
              }}
            >
              No hay ventas hoy.
            </div>
          ) : (
            ventas.map((v: any) => (
              <div
                key={v.id}
                className="card"
                style={{ padding: "12px", opacity: v.voided ? 0.55 : 1 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                    fontSize: "12px",
                    color: "var(--text-3)",
                  }}
                >
                  <span>
                    {new Date(v.createdAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {v.employeeName}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: v.voided
                        ? "var(--red)"
                        : v.paymentMethod === "CREDIT"
                        ? "var(--amber)"
                        : "var(--text-2)",
                    }}
                  >
                    {v.voided
                      ? "ANULADA"
                      : METODO_LABEL[v.paymentMethod] ?? v.paymentMethod}
                  </span>
                </div>

                {v.items.map((i: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "14px",
                      padding: "3px 0",
                    }}
                  >
                    <span>
                      {i.quantity}× {i.name}
                    </span>
                    <span>{formatARS(i.total)}</span>
                  </div>
                ))}

                <div
                  style={{
                    borderTop: "1px dashed var(--border)",
                    marginTop: "8px",
                    paddingTop: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                  }}
                >
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
