"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import TurnosHistorial from "@/components/turnos/TurnosHistorial";
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
  lowStockItems: { name: string; stock: number; minStock: number }[];
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

function MetodoBar({
  label,
  amount,
  total,
  icon,
}: {
  label: string;
  amount: number;
  total: number;
  icon: string;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, alignItems: "center" }}>
        <span style={{ color: "var(--text-2)", display: "flex", gap: "6px", alignItems: "center" }}>
          <span>{icon}</span> {label}
        </span>
        <span style={{ fontWeight: 600 }}>
          {formatARS(amount)}
          <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 6, width: "32px", display: "inline-block", textAlign: "right" }}>
            {pct}%
          </span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--surface-2)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--primary)",
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
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
  const { branchId } = useParams();

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

  const fechaFormateada = new Date().toLocaleDateString("es-AR", {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const openingTime = shifts.length > 0 ? new Date(shifts[0].openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : 'N/A';


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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BackButton fallback={`/${branchId}/caja`} />
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Cierre de caja</h1>
        </div>
        <div style={{ textAlign: "right", marginTop: "4px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>{fechaFormateada}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
            Abre: {openingTime}
          </div>
        </div>
      </div>

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

      {/* ── Alertas de Bajo Stock ─────────────────────────────────────────── */}
      {data.lowStockItems && data.lowStockItems.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(249,115,22,0.02))",
            border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: "var(--radius-lg)",
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <span style={{ fontSize: "22px" }}>⚠️</span>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)", margin: 0, lineHeight: 1.2 }}>
                {data.lowStockItems.length} {data.lowStockItems.length === 1 ? 'producto necesita' : 'productos necesitan'} reposición
              </h3>
              <div style={{ fontSize: "13px", color: "var(--text-2)", marginTop: 4 }}>
                Stock disponible igual o menor al mínimo configurado
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface)", padding: "12px", borderRadius: "12px" }}>
            {data.lowStockItems.slice(0, 5).map((item, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", paddingBottom: "8px", borderBottom: idx < Math.min(data.lowStockItems.length - 1, 4) ? "1px dashed var(--border)" : "none" }}>
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <span style={{ color: "#f97316", fontWeight: 700 }}>{item.stock} / {item.minStock}</span>
              </div>
            ))}
            {data.lowStockItems.length > 5 && (
              <div style={{ fontSize: "13px", color: "var(--text-3)", textAlign: "center", marginTop: "4px", fontWeight: 600 }}>
                y {data.lowStockItems.length - 5} más... (ver inventario)
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* ── Resultados del día (Rendimiento) ────────────────────────────────────────────────── */}
      {totalVentas > 0 && (
        <>
          <div className="separator" />
          <SectionTitle>📊 Rendimiento del día</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            {/* Grid de KPIs financieros */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>Total Ventas</span>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>{formatARS(totalVentas)}</span>
              </div>
              
              {hasCosts && ganancia !== null ? (
                <div 
                  className="card" 
                  style={{ 
                    padding: "14px", 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "4px",
                    background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))",
                    borderColor: "rgba(34,197,94,0.25)"
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)" }}>Ganancia Neta</span>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--green)" }}>{formatARS(ganancia)}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Costo y gastos deducidos</span>
                </div>
              ) : (
                <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>Ganancia Neta</span>
                  <span style={{ fontSize: "12px", color: "var(--text-3)", fontStyle: "italic" }}>Requiere cargar costos</span>
                </div>
              )}

              {/* Fila secundaria: Costo estimado y Gastos */}
              {hasCosts && ganancia !== null && (
                <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>Costo Mercadería</span>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-2)" }}>{formatARS(totalVentas - (ganancia + totalGastos))}</span>
                </div>
              )}
              
              <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>Gastos Registrados</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: totalGastos > 0 ? "var(--red)" : "var(--text-2)" }}>{formatARS(totalGastos)}</span>
              </div>
            </div>

            {/* Desglose de cobros consolidado */}
            <div className="card" style={{ padding: "16px" }}>
              <h3 style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: "16px" }}>
                Composición de ingresos (Todos los medios)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {ventasEfectivo > 0 && <MetodoBar label="Efectivo" amount={ventasEfectivo} total={totalVentas} icon="💵" />}
                {ventasMp > 0 && <MetodoBar label="MercadoPago" amount={ventasMp} total={totalVentas} icon="📱" />}
                {ventasDebito > 0 && <MetodoBar label="Débito" amount={ventasDebito} total={totalVentas} icon="💳" />}
                {ventasTransferencia > 0 && <MetodoBar label="Transferencia" amount={ventasTransferencia} total={totalVentas} icon="🏦" />}
                {ventasTarjeta > 0 && <MetodoBar label="Tarjeta de Crédito" amount={ventasTarjeta} total={totalVentas} icon="🏧" />}
                {ventasFiado > 0 && <MetodoBar label="Fiado" amount={ventasFiado} total={totalVentas} icon="📋" />}
              </div>
            </div>
          </div>
        </>
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
                                : "✓ A favor"}
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
