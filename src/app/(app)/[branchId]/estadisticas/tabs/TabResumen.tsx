"use client";

import { formatARS } from "@/lib/utils";
import TurnosHistorial from "@/components/turnos/TurnosHistorial";
import InventoryValuationPanel from "@/components/stats/InventoryValuationPanel";
import { KpiCard, BarChart, MetodoBar, EmptyState } from "@/components/stats";
import {
  type Periodo,
  PERIODO_LABEL,
  METODO_LABEL,
  GASTO_LABEL,
  getNavLabel,
  buildChartData,
  getTrend,
} from "@/lib/stats-helpers";
import type { PeriodoData } from "@/lib/stats-types";

interface TabResumenProps {
  branchId: string;
  periodo: Periodo;
  currentDate: string;
  today: string;
  data: PeriodoData | null;
  loading: boolean;
  from: string;
  to: string;
}

export default function TabResumen({
  branchId,
  periodo,
  currentDate,
  today,
  data,
  loading,
  from,
  to,
}: TabResumenProps) {
  const chartData = buildChartData(data, periodo);
  const trend = getTrend;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Calculando...
      </div>
    );
  }

  if (!data) return null;

  const resultadoNeto =
    data.gananciasNetas !== null
      ? data.gananciasNetas
      : data.totalVentas - data.totalGastos - data.totalRetiros;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Valorización de stock */}
      <InventoryValuationPanel branchId={branchId} />

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Total ventas"
          value={data.totalVentas}
          sub={`Prom: ${formatARS(data.promedioVentasDia)}/día`}
          trend={trend(data.totalVentas, data.prev?.totalVentas ?? null)}
        />
        {data.hasCosts && data.gananciasNetas !== null ? (
          <KpiCard
            label="Ganancia neta"
            value={data.gananciasNetas}
            sub={data.margenPorcentaje !== null ? `Margen: ${data.margenPorcentaje}%` : undefined}
            highlight
            trend={trend(data.gananciasNetas, data.prev?.gananciasNetas ?? null)}
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
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
              }}
            >
              Ganancia neta
            </span>
            <span style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
              Cargá costos en productos
            </span>
          </div>
        )}
        <KpiCard
          label="Gastos"
          value={data.totalGastos}
          warning={data.totalGastos > 0}
          trend={trend(data.totalGastos, data.prev?.totalGastos ?? null)}
        />
        <KpiCard
          label="Margen %"
          value={data.margenPorcentaje !== null ? `${data.margenPorcentaje}%` : "—"}
          sub={data.hasCosts ? undefined : "Requiere costos"}
        />
      </div>

      {/* KPIs secundarios */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Cantidad de ventas"
          value={String(data.cantidadVentas ?? "—")}
          sub={
            data.ticketPromedio
              ? `Ticket prom: ${formatARS(data.ticketPromedio)}`
              : undefined
          }
        />
        <KpiCard
          label="Resultado neto"
          value={resultadoNeto}
          sub="Ventas − gastos − retiros"
          highlight={resultadoNeto > 0}
          warning={resultadoNeto < 0}
        />
        <KpiCard
          label="Retiros de caja"
          value={data.totalRetiros}
          warning={data.totalRetiros > 0}
        />
        {data.ventasAnuladas && data.ventasAnuladas.cantidad > 0 ? (
          <KpiCard
            label="Ventas anuladas"
            value={String(data.ventasAnuladas.cantidad)}
            sub={formatARS(data.ventasAnuladas.total)}
            warning
          />
        ) : (
          <KpiCard
            label="Ventas anuladas"
            value="—"
            sub="Sin anulaciones"
          />
        )}
      </div>

      {/* Gráfico */}
      {chartData.length > 1 && (
        <div className="card" style={{ padding: "16px" }}>
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
          <BarChart data={chartData} valueKey="ventas" labelKey="label" />
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
                Ganancia por {periodo === "mes" ? "semana" : "día"}
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

      {/* Métodos de cobro */}
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
                  borderBottom:
                    idx < data.topProductos.length - 1 ? "1px solid var(--border)" : "none",
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
                <div key={cat} style={{ display: "flex", justifyContent: "space-between" }}>
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
        <EmptyState
          emoji="📭"
          title="Sin ventas en este período"
        />
      )}
    </div>
  );
}
