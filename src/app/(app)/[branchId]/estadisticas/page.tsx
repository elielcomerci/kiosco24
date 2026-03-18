"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatARS, todayART } from "@/lib/utils";
import TurnosHistorial from "@/components/turnos/TurnosHistorial";
import BackButton from "@/components/ui/BackButton";
import PrintablePage from "@/components/print/PrintablePage";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeriodoData {
  periodo: string;
  totalVentas: number;
  ventasPorMetodo: Record<string, number>;
  totalGastos: number;
  totalRetiros: number;
  gananciasBrutas: number | null;
  gananciasNetas: number | null;
  hasCosts: boolean;
  margenPorcentaje: number | null;
  promedioVentasDia: number;
  gastosPorCategoria: Record<string, number>;
  topProductos: { name: string; cantidad: number; total: number }[];
  ventasPorDia: { fecha: string; ventas: number; ganancia: number | null }[];
  ventasPorSemana: { semana: number; ventas: number; ganancia: number | null }[] | null;
  prev?: {
    totalVentas: number;
    totalGastos: number;
    gananciasNetas: number | null;
    hasCosts: boolean;
  };
}

type Periodo = "dia" | "semana" | "mes";

const PERIODO_LABEL: Record<Periodo, string> = {
  dia: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
};

const METODO_LABEL: Record<string, string> = {
  CASH: "💵 Efectivo",
  MERCADOPAGO: "📱 MercadoPago",
  TRANSFER: "🏦 Transferencia",
  DEBIT: "💳 Débito",
  CREDIT_CARD: "🏧 Tarjeta",
  CREDIT: "📋 Fiado",
};

const GASTO_LABEL: Record<string, string> = {
  ICE: "🧊 Hielo",
  MERCHANDISE: "📦 Mercadería",
  DELIVERY: "🚚 Delivery",
  OTHER: "💸 Otros",
};

// ─── Helper components ────────────────────────────────────────────────────────

function getNavLabel(periodo: Periodo, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  
  if (periodo === "mes") {
    const month = dateObj.toLocaleDateString("es-AR", { month: "long" });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`;
  }
  if (periodo === "semana") {
    const dow = dateObj.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const mon = new Date(dateObj);
    mon.setDate(dateObj.getDate() - daysFromMonday);
    return `Semana del ${mon.getDate()} ${mon.toLocaleDateString("es-AR", { month: "short" })}`;
  }
  return dateObj.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

function offsetDate(iso: string, periodo: Periodo, dir: 1 | -1): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  if (periodo === "dia") {
    dateObj.setDate(dateObj.getDate() + 1 * dir);
  } else if (periodo === "semana") {
    dateObj.setDate(dateObj.getDate() + 7 * dir);
  } else if (periodo === "mes") {
    dateObj.setMonth(dateObj.getMonth() + 1 * dir);
  }
  
  const yy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
  warning,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warning?: boolean;
  trend?: number | null;
}) {
  return (
    <div
      style={{
        background: highlight
          ? "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.03))"
          : "var(--surface)",
        border: `1px solid ${highlight ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-3)",
          }}
        >
          {label}
        </span>
        {trend !== undefined && trend !== null && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "4px",
            background: trend > 0 ? "rgba(34,197,94,0.15)" : trend < 0 ? "rgba(239,68,68,0.15)" : "var(--surface-2)",
            color: trend > 0 ? "var(--green)" : trend < 0 ? "var(--red)" : "var(--text-3)",
            display: "flex",
            alignItems: "center",
            gap: "2px"
          }}>
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "−"} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: warning ? "var(--red)" : highlight ? "var(--green)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</span>
      )}
    </div>
  );
}

function BarChart({
  data,
  valueKey,
  labelKey,
  color = "var(--primary)",
}: {
  data: Record<string, number | string>[];
  valueKey: string;
  labelKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: 80,
        padding: "0 4px",
      }}
    >
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const height = Math.max((val / max) * 72, val > 0 ? 4 : 0);
        const label = String(d[labelKey]);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <div
              title={`${label}: ${formatARS(val)}`}
              style={{
                width: "100%",
                height,
                background: val > 0 ? color : "var(--border)",
                borderRadius: "3px 3px 0 0",
                transition: "height 0.3s ease",
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: "var(--text-3)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MetodoBar({
  label,
  amount,
  total,
}: {
  label: string;
  amount: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--text-2)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>
          {formatARS(amount)}
          <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const today = todayART();
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [data, setData] = useState<PeriodoData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: Periodo, iso: string) => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(
        `/api/stats/periodo?periodo=${p}&isoDate=${iso}`,
        { headers: { "x-branch-id": branchId } }
      );
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load(periodo, currentDate);
  }, [periodo, currentDate, load]);

  const handlePeriodoChange = (p: Periodo) => {
    setPeriodo(p);
    setCurrentDate(today); // Reset to today when switching periods to avoid confusion
  };

  const handleNav = (dir: 1 | -1) => {
    setCurrentDate((prev) => offsetDate(prev, periodo, dir));
  };

  // Build period date range for TurnosHistorial
  const { from, to } = getPeriodRange(periodo, currentDate);

  // Build chart data
  const chartData = buildChartData(data, periodo);

  // Trend calcs
  const getTrend = (current: number | null, prev: number | null) => {
    if (current === null || prev === null) return null;
    if (prev === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
    return ((current - prev) / Math.abs(prev)) * 100;
  };

  const isCurrentPeriod = (() => {
    if (periodo === "dia") return currentDate === today;
    const nextOffset = offsetDate(currentDate, periodo, 1);
    // If navigating forward puts us strictly past today, we are at the edge
    return nextOffset > today;
  })();

  useRegisterShortcuts([
    {
      key: "[",
      combo: "[",
      label: "Periodo anterior",
      description: "Retrocede en el periodo que estas viendo.",
      group: "Estadisticas",
      action: () => handleNav(-1),
    },
    {
      key: "]",
      combo: "]",
      label: "Periodo siguiente",
      description: "Avanza al siguiente periodo disponible.",
      group: "Estadisticas",
      action: () => {
        if (!isCurrentPeriod) handleNav(1);
      },
    },
    {
      key: "d",
      combo: "D",
      label: "Ver dia",
      description: "Cambia la vista al dia actual.",
      group: "Estadisticas",
      action: () => handlePeriodoChange("dia"),
    },
    {
      key: "s",
      combo: "S",
      label: "Ver semana",
      description: "Cambia la vista a esta semana.",
      group: "Estadisticas",
      action: () => handlePeriodoChange("semana"),
    },
    {
      key: "m",
      combo: "M",
      label: "Ver mes",
      description: "Cambia la vista a este mes.",
      group: "Estadisticas",
      action: () => handlePeriodoChange("mes"),
    },
  ]);

  return (
    <>
    <div className="screen-only" style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 100 }}>

      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <BackButton fallback={`/${branchId}/caja`} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📊 Estadísticas</h1>
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 13, marginTop: "8px" }}>
          Ventas, rentabilidad y rendimiento de tu kiosco
        </p>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "8px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            background: "var(--surface-2)",
            padding: 4,
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          {(["dia", "semana", "mes"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodoChange(p)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: "calc(var(--radius) - 2px)",
                border: "none",
                background: periodo === p ? "var(--primary)" : "transparent",
                color: periodo === p ? "#000" : "var(--text-2)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
        </div>

        {/* Date Navigator */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", padding: "8px", borderRadius: "12px", border: "1px solid var(--border)" }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", borderRadius: "8px" }} onClick={() => handleNav(-1)}>
            ‹ Ant
          </button>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text)", textTransform: "capitalize" }}>
            {getNavLabel(periodo, currentDate)}
          </span>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", borderRadius: "8px", opacity: isCurrentPeriod ? 0.3 : 1 }} onClick={() => handleNav(1)} disabled={isCurrentPeriod}>
            Sig ›
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
          Calculando...
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPIs grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <KpiCard
              label="Total ventas"
              value={formatARS(data.totalVentas)}
              sub={`Prom: ${formatARS(data.promedioVentasDia)}/día`}
              trend={getTrend(data.totalVentas, data.prev?.totalVentas ?? null)}
            />
            {data.hasCosts && data.gananciasNetas !== null ? (
              <KpiCard
                label="Ganancia neta"
                value={formatARS(data.gananciasNetas)}
                sub={data.margenPorcentaje !== null ? `Margen: ${data.margenPorcentaje}%` : undefined}
                highlight
                trend={getTrend(data.gananciasNetas, data.prev?.gananciasNetas ?? null)}
              />
            ) : (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>
                  Ganancia neta
                </span>
                <span style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
                  Cargá costos en productos
                </span>
              </div>
            )}
            <KpiCard
              label="Gastos"
              value={formatARS(data.totalGastos)}
              warning={data.totalGastos > 0}
              trend={getTrend(data.totalGastos, data.prev?.totalGastos ?? null)}
            />
            <KpiCard
              label="Margen %"
              value={data.margenPorcentaje !== null ? `${data.margenPorcentaje}%` : "—"}
              sub={data.hasCosts ? undefined : "Requiere costos"}
            />
          </div>

          {/* Chart */}
          {chartData.length > 1 && (
            <div
              className="card"
              style={{ padding: "16px" }}
            >
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-3)",
                  marginBottom: 16,
                }}
              >
                {periodo === "mes" ? "Ventas por semana" : "Ventas por día"}
              </h3>
              <BarChart
                data={chartData}
                valueKey="ventas"
                labelKey="label"
              />
              {data.hasCosts && (
                <>
                  <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />
                  <h3
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-3)",
                      marginBottom: 8,
                    }}
                  >
                    Ganancia por{periodo === "mes" ? " semana" : " día"}
                  </h3>
                  <BarChart
                    data={chartData}
                    valueKey="ganancia"
                    labelKey="label"
                    color="rgba(34,197,94,0.7)"
                  />
                </>
              )}
            </div>
          )}

          {/* Payment method breakdown */}
          {data.totalVentas > 0 && Object.keys(data.ventasPorMetodo).length > 0 && (
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
                Desglose por método de cobro
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(data.ventasPorMetodo)
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => (
                    <MetodoBar
                      key={method}
                      label={METODO_LABEL[method] ?? method}
                      amount={amount}
                      total={data.totalVentas}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Top productos */}
          {data.topProductos.length > 0 && (
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
                🏆 Productos más vendidos
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {data.topProductos.map((p, idx) => (
                  <div
                    key={p.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: idx < data.topProductos.length - 1 ? "1px solid var(--border)" : "none",
                      fontSize: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: idx < 3 ? "var(--primary)" : "var(--surface-2)",
                          color: idx < 3 ? "#000" : "var(--text-3)",
                          fontSize: 10,
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ color: "var(--text-2)" }}>{p.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>{p.cantidad} ud.</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{formatARS(p.total)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gastos por categoría */}
          {data.totalGastos > 0 && (
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
                💸 Gastos por categoría
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
                {Object.entries(data.gastosPorCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div
                      key={cat}
                      style={{ display: "flex", justifyContent: "space-between" }}
                    >
                      <span style={{ color: "var(--text-2)" }}>{GASTO_LABEL[cat] ?? cat}</span>
                      <span style={{ fontWeight: 600, color: "var(--red)" }}>
                        {formatARS(amount)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Turnos del período */}
          <TurnosHistorial from={from} to={to} collapsible={false} limit={15} />

          {/* Empty state */}
          {data.totalVentas === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--text-3)",
                fontSize: 15,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              Sin ventas en este período
            </div>
          )}
        </>
      )}
    </div>

    {!loading && data && (
      <PrintablePage
        title="Estadisticas"
        subtitle={`${PERIODO_LABEL[periodo]} · ${getNavLabel(periodo, currentDate)}`}
        meta={[
          { label: "Ventas", value: formatARS(data.totalVentas) },
          {
            label: "Ganancia neta",
            value:
              data.hasCosts && data.gananciasNetas !== null
                ? formatARS(data.gananciasNetas)
                : "Sin costos",
          },
        ]}
      >
        <section className="print-section">
          <div className="print-section__title">Indicadores clave</div>
          <div className="print-kpis">
            <div className="print-kpi">
              <div className="print-kpi__label">Total ventas</div>
              <div className="print-kpi__value">{formatARS(data.totalVentas)}</div>
              <div className="print-kpi__sub">
                Promedio diario: {formatARS(data.promedioVentasDia)}
              </div>
            </div>
            <div className="print-kpi">
              <div className="print-kpi__label">Ganancia neta</div>
              <div className="print-kpi__value">
                {data.hasCosts && data.gananciasNetas !== null
                  ? formatARS(data.gananciasNetas)
                  : "Sin costos"}
              </div>
              <div className="print-kpi__sub">
                {data.margenPorcentaje !== null ? `Margen: ${data.margenPorcentaje}%` : "Margen no disponible"}
              </div>
            </div>
            <div className="print-kpi">
              <div className="print-kpi__label">Gastos</div>
              <div className="print-kpi__value">{formatARS(data.totalGastos)}</div>
              <div className="print-kpi__sub">Retiros: {formatARS(data.totalRetiros)}</div>
            </div>
            <div className="print-kpi">
              <div className="print-kpi__label">Comparativo</div>
              <div className="print-kpi__value">
                {data.prev ? formatARS(data.prev.totalVentas) : "Sin base"}
              </div>
              <div className="print-kpi__sub">Periodo anterior</div>
            </div>
          </div>
        </section>

        <section className="print-section">
          <div className="print-section__title">Ventas por periodo</div>
          <table className="print-table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Ventas</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td>{formatARS(item.ventas)}</td>
                  <td>{data.hasCosts ? formatARS(item.ganancia) : "Sin costos"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <div className="print-section__title">Metodos y productos</div>
          <div className="print-grid-two">
            <div>
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>Metodos de cobro</div>
              {Object.keys(data.ventasPorMetodo).length === 0 ? (
                <div className="print-note">Sin ventas registradas.</div>
              ) : (
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Metodo</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.ventasPorMetodo)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, amount]) => (
                        <tr key={method}>
                          <td>{METODO_LABEL[method] ?? method}</td>
                          <td>{formatARS(amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>Top productos</div>
              {data.topProductos.length === 0 ? (
                <div className="print-note">Sin datos de productos para este periodo.</div>
              ) : (
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Unid.</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProductos.map((product) => (
                      <tr key={product.name}>
                        <td>{product.name}</td>
                        <td>{product.cantidad}</td>
                        <td>{formatARS(product.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        {data.totalGastos > 0 && (
          <section className="print-section">
            <div className="print-section__title">Gastos por categoria</div>
            <table className="print-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.gastosPorCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, amount]) => (
                    <tr key={category}>
                      <td>{GASTO_LABEL[category] ?? category}</td>
                      <td>{formatARS(amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}
      </PrintablePage>
    )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodRange(periodo: Periodo, today: string): { from: string; to: string } {
  if (periodo === "dia") {
    return { from: `${today}T00:00:00-03:00`, to: `${today}T23:59:59.999-03:00` };
  }
  if (periodo === "semana") {
    const d = new Date(`${today}T12:00:00-03:00`);
    const dow = d.getDay(); // 0=Sun
    const daysBack = dow === 0 ? 6 : dow - 1;
    const mon = new Date(d);
    mon.setDate(d.getDate() - daysBack);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
    return {
      from: `${fmt(mon)}T00:00:00-03:00`,
      to: `${fmt(sun)}T23:59:59.999-03:00`,
    };
  }
  // mes
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`,
    to: `${y}-${String(m).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`,
  };
}

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function buildChartData(
  data: PeriodoData | null,
  periodo: Periodo
): { label: string; ventas: number; ganancia: number }[] {
  if (!data) return [];
  if (periodo === "mes" && data.ventasPorSemana) {
    return data.ventasPorSemana.map((w) => ({
      label: `S${w.semana}`,
      ventas: w.ventas,
      ganancia: w.ganancia ?? 0,
    }));
  }
  return data.ventasPorDia.map((d, i) => {
    // Convert date to day label
    const dt = new Date(`${d.fecha}T12:00:00-03:00`);
    const dow = dt.getDay(); // 0=Sun
    const labelIdx = dow === 0 ? 6 : dow - 1; // map to Mon-Sun 0-6
    return {
      label: periodo === "semana" ? DAY_LABELS[labelIdx] : String(dt.getDate()),
      ventas: d.ventas,
      ganancia: d.ganancia ?? 0,
    };
  });
}
