"use client";

import { useState, useMemo } from "react";
import {
  LIST_PRICE,
  COMM_FIRST_PCT,
  COMM_RECUR_PCT,
  COMM_FIRST_AMT,
  COMM_RECUR_AMT,
  formatArs,
} from "@/lib/pricing-constants";

interface Milestone {
  label: string;
  amount: number;
}

interface ProjectionRow {
  month: number;
  newClients: number;
  totalClients: number;
  commissionNew: number;
  commissionRecur: number;
  total: number;
}

const MILESTONES: Milestone[] = [
  { label: "Primer sueldo real", amount: 200_000 },
  { label: "Sueldo medio profesional", amount: 500_000 },
  { label: "Libertad financiera", amount: 1_000_000 },
  { label: "Dos millones", amount: 2_000_000 },
];

const GOAL = 1_000_000;

function computeProjection(pace: number, months: number): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let cartera = 0;
  for (let m = 1; m <= months; m++) {
    const nuevos = pace;
    cartera += nuevos;
    const comNuevos = nuevos * COMM_FIRST_AMT;
    const comCartera = (cartera - nuevos) * COMM_RECUR_AMT;
    const total = comNuevos + comCartera;
    rows.push({
      month: m,
      newClients: nuevos,
      totalClients: cartera,
      commissionNew: comNuevos,
      commissionRecur: comCartera,
      total,
    });
  }
  return rows;
}

function computeMilestones(pace: number): (Milestone & { months: number; clients: number })[] {
  return MILESTONES.map((target) => {
    let cartera = 0;
    let m = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      m++;
      cartera += pace;
      const comNuevos = pace * COMM_FIRST_AMT;
      const comCartera = (cartera - pace) * COMM_RECUR_AMT;
      const total = comNuevos + comCartera;
      if (total >= target.amount || m > 240) break;
    }
    return { ...target, months: m, clients: cartera };
  });
}

export default function PartnerCalculator() {
  const [pace, setPace] = useState(5);
  const [months, setMonths] = useState(12);

  const rows = useMemo(() => computeProjection(pace, months), [pace, months]);
  const milestones = useMemo(() => computeMilestones(pace), [pace]);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="partner-calc">
      {/* HEADER */}
      <div className="partner-calc__header">
        <h3 className="partner-calc__title">Calculadora de ingresos</h3>
        <p className="partner-calc__subtitle">
          El {Math.round(COMM_FIRST_PCT * 100)}% de la primera factura es tuyo ({formatArs(COMM_FIRST_AMT)}).
          El {Math.round(COMM_RECUR_PCT * 100)}% de cada mes siguiente, para siempre ({formatArs(COMM_RECUR_AMT)}/mes).
        </p>
        <div className="partner-calc__badges">
          <span className="badge badge--green">
            {Math.round(COMM_FIRST_PCT * 100)}% primera factura · {formatArs(COMM_FIRST_AMT)}
          </span>
          <span className="badge badge--teal">
            {Math.round(COMM_RECUR_PCT * 100)}% recurrente · {formatArs(COMM_RECUR_AMT)}/mes
          </span>
          <span className="badge badge--amber">
            Ticket {formatArs(LIST_PRICE)}/mes
          </span>
        </div>
      </div>

      {/* SLIDERS */}
      <div className="partner-calc__sliders">
        <div className="slider-group">
          <label className="slider-group__label">
            Ventas nuevas por mes
            <span className="slider-group__value">{pace} {pace === 1 ? "cliente" : "clientes"}</span>
          </label>
          <input
            type="range"
            className="slider-group__input"
            min={1}
            max={100}
            value={pace}
            onChange={(e) => setPace(Number(e.target.value))}
          />
        </div>
        <div className="slider-group">
          <label className="slider-group__label">
            Meses de proyección
            <span className="slider-group__value">{months} meses</span>
          </label>
          <input
            type="range"
            className="slider-group__input"
            min={3}
            max={24}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="partner-calc__metrics">
        <div className="metric-card">
          <div className="metric-card__label">Comisión primera venta</div>
          <div className="metric-card__value">{formatArs(COMM_FIRST_AMT)}</div>
          <div className="metric-card__sub">{Math.round(COMM_FIRST_PCT * 100)}% del primer mes</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__label">Comisión mensual por cliente</div>
          <div className="metric-card__value">{formatArs(COMM_RECUR_AMT)}</div>
          <div className="metric-card__sub">{Math.round(COMM_RECUR_PCT * 100)}% recurrente</div>
        </div>
        <div className="metric-card metric-card--highlight">
          <div className="metric-card__label">Ingreso mes actual</div>
          <div className="metric-card__value">{first ? formatArs(first.total) : "—"}</div>
          <div className="metric-card__sub">mes 1 · {pace} clientes nuevos</div>
        </div>
        <div className="metric-card metric-card--highlight2">
          <div className="metric-card__label">Ingreso al final del período</div>
          <div className="metric-card__value">{last ? formatArs(last.total) : "—"}</div>
          <div className="metric-card__sub">mes {months} · {last?.totalClients ?? 0} clientes activos</div>
        </div>
      </div>

      {/* BAR CHART (CSS-only stacked bars) */}
      <div className="partner-calc__chart">
        <div className="partner-calc__chart-title">Evolución del ingreso mensual</div>
        <div className="chart-legend">
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--green" />
            Comisión nuevos clientes
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--teal" />
            Comisión cartera activa
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__line chart-legend__line--amber" />
            Meta {formatArs(GOAL)}
          </span>
        </div>
        <div className="chart-bars">
          {/* Goal line label */}
          <div
            className="chart-bars__goal-line"
            style={{ bottom: `${(GOAL / maxTotal) * 100}%` }}
          >
            <span className="chart-bars__goal-label">{formatArs(GOAL)}</span>
          </div>
          {rows.map((r) => {
            const pctNew = (r.commissionNew / maxTotal) * 100;
            const pctRecur = (r.commissionRecur / maxTotal) * 100;
            const reachedGoal = r.total >= GOAL;
            return (
              <div key={r.month} className="chart-bars__col" title={`Mes ${r.month}: ${formatArs(r.total)}`}>
                <div className="chart-bars__stack">
                  <div
                    className="chart-bars__bar chart-bars__bar--teal"
                    style={{ height: `${pctRecur}%` }}
                  />
                  <div
                    className="chart-bars__bar chart-bars__bar--green"
                    style={{ height: `${pctNew}%` }}
                  />
                </div>
                {reachedGoal && <div className="chart-bars__star">★</div>}
                <span className="chart-bars__label">M{r.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABLE */}
      <div className="partner-calc__table-wrap">
        <div className="partner-calc__table-header">Desglose mensual</div>
        <table className="partner-calc__table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Clientes nuevos</th>
              <th>Cartera total</th>
              <th>Comisión nuevos</th>
              <th>Comisión cartera</th>
              <th>Total del mes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMilestone = r.total >= GOAL && (r.month === 1 || rows[r.month - 2].total < GOAL);
              return (
                <tr key={r.month} className={isMilestone ? "partner-calc__table-row--milestone" : ""}>
                  <td>Mes {r.month}{isMilestone ? " ★" : ""}</td>
                  <td>{r.newClients}</td>
                  <td>{r.totalClients}</td>
                  <td className="pos">{formatArs(r.commissionNew)}</td>
                  <td className="pos">{formatArs(r.commissionRecur)}</td>
                  <td className="total">{formatArs(r.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MILESTONES */}
      <div className="partner-calc__milestones">
        <div className="partner-calc__milestones-title">
          Hitos con este ritmo de ventas
        </div>
        <div className="partner-calc__milestones-grid">
          {milestones.map((h) => (
            <div key={h.label} className="milestone-card">
              <div className="milestone-card__label">{h.label}</div>
              <div className="milestone-card__amount">{formatArs(h.amount)}/mes</div>
              <div className="milestone-card__detail">
                Mes {h.months} · {h.clients} clientes activos
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .partner-calc {
          background: var(--surface, #161616);
          border: 1px solid var(--border, #2a2a2a);
          border-radius: var(--radius-lg, 16px);
          padding: 24px;
        }

        .partner-calc__header { margin-bottom: 24px; }
        .partner-calc__title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
        .partner-calc__subtitle { font-size: 13px; color: var(--text-3, #888); line-height: 1.6; margin-bottom: 12px; }
        .partner-calc__badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .badge {
          font-family: 'DM Mono', ui-monospace, monospace;
          font-size: 11px;
          padding: 4px 12px;
          border-radius: 100px;
          border: 1px solid;
        }
        .badge--green { color: #c8f060; border-color: rgba(200,240,96,.3); background: rgba(200,240,96,.06); }
        .badge--teal { color: #60d4a0; border-color: rgba(96,212,160,.3); background: rgba(96,212,160,.06); }
        .badge--amber { color: #f0b860; border-color: rgba(240,184,96,.3); background: rgba(240,184,96,.06); }

        .partner-calc__sliders { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .slider-group { display: grid; gap: 8px; }
        .slider-group__label {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 13px; color: var(--text-3, #888);
        }
        .slider-group__value {
          font-family: 'DM Mono', ui-monospace, monospace;
          font-size: 16px; color: var(--text, #f0ede8);
        }
        .slider-group__input {
          -webkit-appearance: none; appearance: none; width: 100%; height: 2px;
          background: var(--border2, #333); border-radius: 2px; outline: none; cursor: pointer;
        }
        .slider-group__input::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: #c8f060; border: 3px solid var(--bg, #0d0d0d);
          box-shadow: 0 0 0 1px #c8f060; cursor: pointer;
        }
        .slider-group__input::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #c8f060; border: 3px solid var(--bg, #0d0d0d); cursor: pointer;
        }

        .partner-calc__metrics {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px; margin-bottom: 24px;
        }
        .metric-card {
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 12px; padding: 14px 16px;
        }
        .metric-card--highlight { border-color: rgba(200,240,96,.3); background: rgba(200,240,96,.04); }
        .metric-card--highlight2 { border-color: rgba(96,212,160,.25); background: rgba(96,212,160,.04); }
        .metric-card__label { font-size: 10px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
        .metric-card__value { font-family: 'DM Mono', ui-monospace, monospace; font-size: 20px; font-weight: 500; line-height: 1; }
        .metric-card--highlight .metric-card__value { color: #c8f060; }
        .metric-card--highlight2 .metric-card__value { color: #60d4a0; }
        .metric-card__sub { font-size: 10px; color: var(--text-3, #555); margin-top: 4px; }

        /* CHART */
        .partner-calc__chart { margin-bottom: 24px; }
        .partner-calc__chart-title { font-size: 12px; color: var(--text-3, #888); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 12px; }
        .chart-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
        .chart-legend__item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-3, #888); }
        .chart-legend__dot { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
        .chart-legend__dot--green { background: #c8f060; }
        .chart-legend__dot--teal { background: #60d4a0; }
        .chart-legend__line { width: 14px; height: 1.5px; flex-shrink: 0; }
        .chart-legend__line--amber { background: #f0b860; border-radius: 999px; }

        .chart-bars {
          position: relative;
          display: flex; align-items: flex-end; gap: 3px;
          height: 180px; padding: 0 4px;
          border-bottom: 1px solid var(--border, #2a2a2a);
        }
        .chart-bars__goal-line {
          position: absolute; left: 0; right: 0;
          border-top: 1.5px dashed rgba(240,184,96,.5);
          pointer-events: none;
        }
        .chart-bars__goal-label {
          position: absolute; right: 0; top: -16px;
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 9px; color: #f0b860;
        }
        .chart-bars__col {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          position: relative; min-width: 0;
        }
        .chart-bars__stack { width: 100%; display: flex; flex-direction: column; }
        .chart-bars__bar { border-radius: 2px 2px 0 0; min-height: 0; transition: height .2s; }
        .chart-bars__bar--teal { background: rgba(96,212,160,.7); }
        .chart-bars__bar--green { background: rgba(200,240,96,.7); }
        .chart-bars__star {
          position: absolute; top: -14px; font-size: 10px; color: #c8f060;
        }
        .chart-bars__label {
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 9px;
          color: var(--text-3, #555); margin-top: 6px;
        }

        /* TABLE */
        .partner-calc__table-wrap {
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 12px; overflow: hidden; margin-bottom: 24px;
        }
        .partner-calc__table-header {
          padding: 10px 14px; border-bottom: 1px solid var(--border, #2a2a2a);
          font-size: 11px; color: var(--text-3, #888); letter-spacing: .06em; text-transform: uppercase;
        }
        .partner-calc__table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .partner-calc__table thead th {
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px;
          color: var(--text-3, #555); text-align: right; padding: 8px 12px;
          border-bottom: 1px solid var(--border, #2a2a2a); font-weight: 400;
        }
        .partner-calc__table thead th:first-child { text-align: left; }
        .partner-calc__table tbody td {
          padding: 8px 12px; text-align: right;
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 11px;
          color: var(--text-3, #888);
        }
        .partner-calc__table tbody td:first-child {
          text-align: left; color: var(--text, #f0ede8);
          font-family: 'Instrument Sans', sans-serif; font-size: 12px;
        }
        .partner-calc__table tbody td.pos { color: #60d4a0; }
        .partner-calc__table tbody td.total { color: var(--text, #f0ede8); font-weight: 500; }
        .partner-calc__table tbody tr { border-bottom: 1px solid var(--border, #2a2a2a); }
        .partner-calc__table tbody tr:last-child { border-bottom: none; }
        .partner-calc__table tbody tr:hover { background: rgba(255,255,255,.03); }
        .partner-calc__table-row--milestone { background: rgba(200,240,96,.04) !important; }
        .partner-calc__table-row--milestone td:first-child { color: #c8f060; }

        /* MILESTONES */
        .partner-calc__milestones { margin-bottom: 0; }
        .partner-calc__milestones-title {
          font-size: 11px; color: var(--text-3, #888); letter-spacing: .06em;
          text-transform: uppercase; margin-bottom: 10px;
        }
        .partner-calc__milestones-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
        .milestone-card { background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a); border-radius: 10px; padding: 12px 14px; }
        .milestone-card__label { font-size: 10px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
        .milestone-card__amount { font-family: 'DM Mono', ui-monospace, monospace; font-size: 15px; color: var(--text, #f0ede8); margin-bottom: 2px; }
        .milestone-card__detail { font-size: 11px; color: var(--text-3, #555); }

        @media (max-width: 640px) {
          .partner-calc { padding: 16px; }
          .partner-calc__metrics { grid-template-columns: 1fr 1fr; }
          .partner-calc__table { font-size: 10px; }
          .partner-calc__table thead th, .partner-calc__table tbody td { padding: 6px 8px; }
        }
      `}</style>
    </div>
  );
}
