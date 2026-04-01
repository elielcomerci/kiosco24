"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { todayART } from "@/lib/utils";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";
import BackButton from "@/components/ui/BackButton";
import PrintablePage from "@/components/print/PrintablePage";
import {
  TabResumen,
  TabVentas,
  TabTurnos,
  TabEmpleados,
  TabStock,
  TabFiados,
} from "./tabs";
import {
  type Periodo,
  PERIODO_LABEL,
  getNavLabel,
  offsetDate,
  getPeriodRange,
  isCurrentPeriod,
} from "@/lib/stats-helpers";
import type { PeriodoData } from "@/lib/stats-types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "resumen" | "ventas" | "turnos" | "empleados" | "stock" | "fiados";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "resumen",   label: "Resumen",   emoji: "📊" },
  { id: "ventas",    label: "Ventas",    emoji: "💰" },
  { id: "turnos",    label: "Turnos",    emoji: "🕐" },
  { id: "empleados", label: "Empleados", emoji: "👷" },
  { id: "stock",     label: "Stock",     emoji: "📦" },
  { id: "fiados",    label: "Fiados",    emoji: "💳" },
];

// Tabs that use the period selector
const PERIOD_TABS: Tab[] = ["resumen", "ventas", "turnos", "empleados"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const today = todayART();

  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [data, setData] = useState<PeriodoData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (p: Periodo, iso: string) => {
      setLoading(true);
      setData(null);
      try {
        const res = await fetch(`/api/stats/periodo?periodo=${p}&isoDate=${iso}`, {
          headers: { "x-branch-id": branchId },
        });
        const json = await res.json();
        setData(json);
      } finally {
        setLoading(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    if (PERIOD_TABS.includes(activeTab)) {
      load(periodo, currentDate);
    }
  }, [periodo, currentDate, activeTab, load]);

  const handlePeriodoChange = useCallback(
    (p: Periodo) => {
      setPeriodo(p);
      setCurrentDate(today);
    },
    [today]
  );

  const handleNav = useCallback(
    (dir: 1 | -1) => {
      setCurrentDate((prev) => offsetDate(prev, periodo, dir));
    },
    [periodo]
  );

  const { from, to } = getPeriodRange(periodo, currentDate);
  const currentIsCurrent = isCurrentPeriod(periodo, currentDate, today);

  const shortcuts = useMemo(
    () => [
      // Period navigation
      {
        key: "[",
        combo: "[",
        label: "Periodo anterior",
        description: "Retrocede en el periodo que estás viendo.",
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
          if (!currentIsCurrent) handleNav(1);
        },
      },
      {
        key: "d",
        combo: "D",
        label: "Ver día",
        description: "Cambia la vista al día actual.",
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
      // Tab switching
      ...TABS.map((tab, index) => ({
        key: `${index + 1}`,
        combo: `${index + 1}`,
        label: `Ir a ${tab.label}`,
        description: `Cambia a la pestaña ${tab.label.toLowerCase()}.`,
        group: "Estadisticas",
        action: () => setActiveTab(tab.id as Tab),
      })),
    ],
    [handleNav, handlePeriodoChange, currentIsCurrent]
  );

  useRegisterShortcuts(shortcuts);

  return (
    <>
      <div
        className="screen-only"
        style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 100 }}
      >
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

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 2,
            scrollbarWidth: "none",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: "var(--radius)",
                border: activeTab === tab.id ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: activeTab === tab.id ? "var(--primary)" : "var(--surface)",
                color: activeTab === tab.id ? "#000" : "var(--text-2)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Period selector — only shown for period-dependent tabs */}
        {PERIOD_TABS.includes(activeTab) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--surface)",
                padding: "8px",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <button
                className="btn btn-ghost"
                style={{ padding: "8px 16px", borderRadius: "8px" }}
                onClick={() => handleNav(-1)}
              >
                ‹ Ant
              </button>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "14px",
                  color: "var(--text)",
                  textTransform: "capitalize",
                }}
              >
                {getNavLabel(periodo, currentDate)}
              </span>
              <button
                className="btn btn-ghost"
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  opacity: currentIsCurrent ? 0.3 : 1,
                }}
                onClick={() => handleNav(1)}
                disabled={currentIsCurrent}
              >
                Sig ›
              </button>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {activeTab === "resumen" && (
            <TabResumen
              branchId={branchId}
              periodo={periodo}
              currentDate={currentDate}
              today={today}
              data={data}
              loading={loading}
              from={from}
              to={to}
            />
          )}
          {activeTab === "ventas" && (
            <TabVentas periodo={periodo} currentDate={currentDate} />
          )}
          {activeTab === "turnos" && (
            <TabTurnos periodo={periodo} currentDate={currentDate} />
          )}
          {activeTab === "empleados" && (
            <TabEmpleados periodo={periodo} currentDate={currentDate} />
          )}
          {activeTab === "stock" && <TabStock periodo={periodo} currentDate={currentDate} />}
          {activeTab === "fiados" && (
            <TabFiados periodo={periodo} currentDate={currentDate} />
          )}
        </div>
      </div>

      {/* Printable — only on resumen */}
      {activeTab === "resumen" && !loading && data && (
        <PrintablePage
          title="Estadisticas"
          subtitle={`${PERIODO_LABEL[periodo]} · ${getNavLabel(periodo, currentDate)}`}
          meta={[
            { label: "Ventas", value: `${data.totalVentas}` },
            {
              label: "Ganancia neta",
              value:
                data.hasCosts && data.gananciasNetas !== null
                  ? `${data.gananciasNetas}`
                  : "Sin costos",
            },
          ]}
        >
          <section className="print-section">
            <div className="print-section__title">Indicadores clave</div>
            <div className="print-kpis">
              <div className="print-kpi">
                <div className="print-kpi__label">Total ventas</div>
                <div className="print-kpi__value">${data.totalVentas}</div>
                <div className="print-kpi__sub">
                  Promedio diario: ${data.promedioVentasDia}
                </div>
              </div>
              <div className="print-kpi">
                <div className="print-kpi__label">Ganancia neta</div>
                <div className="print-kpi__value">
                  {data.hasCosts && data.gananciasNetas !== null
                    ? `$${data.gananciasNetas}`
                    : "Sin costos"}
                </div>
                <div className="print-kpi__sub">
                  {data.margenPorcentaje !== null
                    ? `Margen: ${data.margenPorcentaje}%`
                    : "Margen no disponible"}
                </div>
              </div>
              <div className="print-kpi">
                <div className="print-kpi__label">Gastos</div>
                <div className="print-kpi__value">${data.totalGastos}</div>
                <div className="print-kpi__sub">Retiros: ${data.totalRetiros}</div>
              </div>
              <div className="print-kpi">
                <div className="print-kpi__label">Comparativo</div>
                <div className="print-kpi__value">
                  {data.prev ? `$${data.prev.totalVentas}` : "Sin base"}
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
                {(() => {
                  const chartData =
                    periodo === "mes" && data.ventasPorSemana
                      ? data.ventasPorSemana.map((w) => ({
                          label: `S${w.semana}`,
                          ventas: w.ventas,
                          ganancia: w.ganancia ?? 0,
                        }))
                      : data.ventasPorDia.map((d) => {
                          const dt = new Date(`${d.fecha}T12:00:00-03:00`);
                          const dow = dt.getDay();
                          const labelIdx = dow === 0 ? 6 : dow - 1;
                          const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
                          return {
                            label: periodo === "semana" ? DAY_LABELS[labelIdx] : String(dt.getDate()),
                            ventas: d.ventas,
                            ganancia: d.ganancia ?? 0,
                          };
                        });
                  return chartData.map((item) => (
                    <tr key={item.label}>
                      <td>{item.label}</td>
                      <td>${item.ventas}</td>
                      <td>{data.hasCosts ? `$${item.ganancia}` : "Sin costos"}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <div className="print-section__title">Métodos y productos</div>
            <div className="print-grid-two">
              <div>
                <div style={{ fontWeight: 700, marginBottom: "8px" }}>Métodos de cobro</div>
                {Object.keys(data.ventasPorMetodo).length === 0 ? (
                  <div className="print-note">Sin ventas registradas.</div>
                ) : (
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th>Método</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.ventasPorMetodo)
                        .sort((a, b) => b[1] - a[1])
                        .map(([method, amount]) => (
                          <tr key={method}>
                            <td>{method}</td>
                            <td>${amount}</td>
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
                          <td>${product.total}</td>
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
              <div className="print-section__title">Gastos por categoría</div>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.gastosPorCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <tr key={category}>
                        <td>{category}</td>
                        <td>${amount}</td>
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
