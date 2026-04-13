"use client";

import { useState, useMemo } from "react";
import {
  LIST_PRICE,
  MP_NETO,
  COMM_FIRST_AMT,
  COMM_RECUR_AMT,
  formatArs,
} from "@/lib/pricing-constants";

const MP_FEE = LIST_PRICE - MP_NETO;
const NET1 = MP_NETO - COMM_FIRST_AMT;
const NET2 = MP_NETO - COMM_RECUR_AMT;

interface MonthData {
  bruto: number;
  mpFeeTotal: number;
  mpNeto: number;
  commVend: number;
  ganancia: number;
  recurrentClients: number;
  newClients: number;
  totalClients: number;
}

interface ProjectionRow {
  month: number;
  clients: number;
  actualNew: number;
  bruto: number;
  mpFeeTotal: number;
  mpNeto: number;
  commVend: number;
  ganancia: number;
}

function computeMonth(totalClients: number, newClients: number): MonthData {
  const recurrentClients = totalClients - newClients;
  const bruto = totalClients * LIST_PRICE;
  const mpFeeTotal = totalClients * MP_FEE;
  const mpNeto = totalClients * MP_NETO;
  const commVend = newClients * COMM_FIRST_AMT + recurrentClients * COMM_RECUR_AMT;
  const ganancia = mpNeto - commVend;
  return { bruto, mpFeeTotal, mpNeto, commVend, ganancia, recurrentClients, newClients, totalClients };
}

function computeProjection(startClients: number, newPerMonth: number, months: number): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let clients = startClients;
  for (let m = 1; m <= months; m++) {
    const newC = m === 1 ? newPerMonth : newPerMonth;
    if (m > 1) clients += newPerMonth;
    const rec = clients - newC;
    const bruto = clients * LIST_PRICE;
    const mpFeeTotal = clients * MP_FEE;
    const mpNeto = clients * MP_NETO;
    const commVend = newC * COMM_FIRST_AMT + rec * COMM_RECUR_AMT;
    const ganancia = mpNeto - commVend;
    rows.push({ month: m, clients, actualNew: newC, bruto, mpFeeTotal, mpNeto, commVend, ganancia });
  }
  return rows;
}

export default function AdminRentabilityCalculator() {
  const [totalClients, setTotalClients] = useState(100);
  const [newClients, setNewClients] = useState(20);

  const effectiveNew = Math.min(newClients, totalClients);
  const data = useMemo(() => computeMonth(totalClients, effectiveNew), [totalClients, effectiveNew]);
  const proj = useMemo(() => computeProjection(totalClients, effectiveNew, 12), [totalClients, effectiveNew]);

  const pctGanancia = data.bruto > 0 ? Math.round((data.ganancia / data.bruto) * 100) : 0;
  const pctMP = data.bruto > 0 ? Math.round((data.mpFeeTotal / data.bruto) * 100) : 0;
  const pctVend = data.bruto > 0 ? Math.round((data.commVend / data.bruto) * 100) : 0;

  const maxProj = Math.max(...proj.map((r) => Math.max(r.ganancia, r.mpNeto)), 1);

  return (
    <div className="admin-calc">
      {/* HEADER */}
      <div className="admin-calc__header">
        <h3 className="admin-calc__title">Panel de rentabilidad</h3>
        <p className="admin-calc__subtitle">
          Desglose real por cliente: precio de lista, comisión de MercadoPago y comisiones de vendedores.
        </p>
      </div>

      {/* WATERFALL CARDS */}
      <div className="admin-calc__waterfall">
        <div className="admin-calc__waterfall-title">
          Cascada de ingresos — primera factura (por cliente)
        </div>
        <div className="wf-row">
          <span className="wf-label">Precio de lista<small>lo que paga el cliente</small></span>
          <span className="wf-val wf-val--base">{formatArs(LIST_PRICE)}</span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Comisión MercadoPago<small>~8% aprox · suscripción</small></span>
          <span className="wf-val wf-val--neg">− {formatArs(MP_FEE)}<span className="wf-pct">{Math.round((MP_FEE / LIST_PRICE) * 100)}%</span></span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Neto recibido de MP<small>acreditado en tu cuenta</small></span>
          <span className="wf-val wf-val--base">{formatArs(MP_NETO)}</span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Comisión vendedor · primera factura<small>{Math.round(COMM_FIRST_AMT / LIST_PRICE * 100)}% del precio de lista</small></span>
          <span className="wf-val wf-val--neg">− {formatArs(COMM_FIRST_AMT)}<span className="wf-pct">{Math.round(COMM_FIRST_AMT / LIST_PRICE * 100)}%</span></span>
        </div>
        <div className="wf-row wf-row--total">
          <span className="wf-label wf-label--total">Te queda · mes 1</span>
          <span className="wf-val wf-val--result">{formatArs(NET1)}</span>
        </div>
      </div>

      <div className="admin-calc__waterfall">
        <div className="admin-calc__waterfall-title">
          Cascada de ingresos — factura recurrente (mes 2+)
        </div>
        <div className="wf-row">
          <span className="wf-label">Precio de lista<small>lo que paga el cliente</small></span>
          <span className="wf-val wf-val--base">{formatArs(LIST_PRICE)}</span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Comisión MercadoPago<small>~8% aprox · suscripción</small></span>
          <span className="wf-val wf-val--neg">− {formatArs(MP_FEE)}<span className="wf-pct">{Math.round((MP_FEE / LIST_PRICE) * 100)}%</span></span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Neto recibido de MP<small>acreditado en tu cuenta</small></span>
          <span className="wf-val wf-val--base">{formatArs(MP_NETO)}</span>
        </div>
        <div className="wf-row">
          <span className="wf-label">Comisión vendedor · recurrente<small>{Math.round(COMM_RECUR_AMT / LIST_PRICE * 100)}% del precio de lista</small></span>
          <span className="wf-val wf-val--neg">− {formatArs(COMM_RECUR_AMT)}<span className="wf-pct">{Math.round(COMM_RECUR_AMT / LIST_PRICE * 100)}%</span></span>
        </div>
        <div className="wf-row wf-row--total">
          <span className="wf-label wf-label--total">Te queda · mes 2+</span>
          <span className="wf-val wf-val--result2">{formatArs(NET2)}</span>
        </div>
      </div>

      {/* SLIDERS */}
      <div className="admin-calc__sliders">
        <div className="slider-group">
          <label className="slider-group__label">
            Clientes activos totales
            <span className="slider-group__value">{totalClients} {totalClients === 1 ? "cliente" : "clientes"}</span>
          </label>
          <input
            type="range" className="slider-group__input slider-group__input--teal"
            min={1} max={500} value={totalClients}
            onChange={(e) => setTotalClients(Number(e.target.value))}
          />
        </div>
        <div className="slider-group">
          <label className="slider-group__label">
            Nuevos clientes ese mes
            <span className="slider-group__value">{effectiveNew} {effectiveNew === 1 ? "nuevo" : "nuevos"}</span>
          </label>
          <input
            type="range" className="slider-group__input slider-group__input--teal"
            min={0} max={100} value={newClients}
            onChange={(e) => setNewClients(Number(e.target.value))}
          />
        </div>
      </div>

      {/* METRICS */}
      <div className="admin-calc__metrics">
        <div className="metric-card metric-card--teal">
          <div className="metric-card__label">Tu ganancia neta</div>
          <div className="metric-card__value">{formatArs(data.ganancia)}</div>
          <div className="metric-card__sub">{pctGanancia}% del bruto · {totalClients} clientes</div>
        </div>
        <div className="metric-card metric-card--teal2">
          <div className="metric-card__label">Por cliente recurrente</div>
          <div className="metric-card__value">{formatArs(NET2)}</div>
          <div className="metric-card__sub">mes 2 en adelante</div>
        </div>
        <div className="metric-card metric-card--red">
          <div className="metric-card__label">Comisión MP total</div>
          <div className="metric-card__value">{formatArs(data.mpFeeTotal)}</div>
          <div className="metric-card__sub">{pctMP}% del bruto</div>
        </div>
        <div className="metric-card metric-card--blue">
          <div className="metric-card__label">Comisión vendedores</div>
          <div className="metric-card__value">{formatArs(data.commVend)}</div>
          <div className="metric-card__sub">{pctVend}% del bruto</div>
        </div>
      </div>

      {/* BAR CHART (CSS-only horizontal stacked) */}
      <div className="admin-calc__chart-wrap">
        <div className="admin-calc__chart-title">Distribución del ingreso bruto del mes</div>
        <div className="chart-legend">
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--teal" />Tu ganancia neta
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--green" />Comisión vendedores
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--red" />Comisión MP
          </span>
        </div>
        <div className="h-bar-wrap">
          <div className="h-bar">
            <div
              className="h-bar__seg h-bar__seg--teal"
              style={{ width: `${data.bruto > 0 ? (data.ganancia / data.bruto) * 100 : 0}%` }}
            />
            <div
              className="h-bar__seg h-bar__seg--green"
              style={{ width: `${data.bruto > 0 ? (data.commVend / data.bruto) * 100 : 0}%` }}
            />
            <div
              className="h-bar__seg h-bar__seg--red"
              style={{ width: `${data.bruto > 0 ? (data.mpFeeTotal / data.bruto) * 100 : 0}%` }}
            />
          </div>
          <div className="h-bar-labels">
            <span>Tu ganancia: {data.bruto > 0 ? Math.round((data.ganancia / data.bruto) * 100) : 0}%</span>
            <span>Vendedores: {data.bruto > 0 ? Math.round((data.commVend / data.bruto) * 100) : 0}%</span>
            <span>MP: {data.bruto > 0 ? Math.round((data.mpFeeTotal / data.bruto) * 100) : 0}%</span>
          </div>
        </div>
      </div>

      {/* LINE CHART (CSS-only vertical bars for projection) */}
      <div className="admin-calc__chart-wrap">
        <div className="admin-calc__chart-title">
          Proyección acumulada — tu ganancia mensual si crecés a este ritmo (12 meses)
        </div>
        <div className="chart-legend">
          <span className="chart-legend__item">
            <span className="chart-legend__dot chart-legend__dot--teal" />Tu ganancia neta mensual
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__line chart-legend__line--green" />Ingreso bruto MP
          </span>
        </div>
        <div className="chart-bars">
          {proj.map((r) => {
            const pctGan = (r.ganancia / maxProj) * 100;
            const pctBruto = (r.mpNeto / maxProj) * 100;
            return (
              <div key={r.month} className="chart-bars__col" title={`Mes ${r.month}: ${formatArs(r.ganancia)}`}>
                <div className="chart-bars__dual">
                  <div
                    className="chart-bars__bar chart-bars__bar--teal"
                    style={{ height: `${pctGan}%` }}
                  />
                  <div
                    className="chart-bars__bar chart-bars__bar--outline"
                    style={{ height: `${pctBruto}%` }}
                  />
                </div>
                <span className="chart-bars__label">M{r.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABLE */}
      <div className="admin-calc__table-wrap">
        <div className="admin-calc__table-header">Proyección mes a mes · 12 meses desde hoy</div>
        <table className="admin-calc__table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Clientes</th>
              <th>Nuevos</th>
              <th>Bruto MP</th>
              <th>− MP fee</th>
              <th>− Vendedores</th>
              <th>Tu ganancia</th>
            </tr>
          </thead>
          <tbody>
            {proj.map((r) => (
              <tr key={r.month}>
                <td>Mes {r.month}</td>
                <td>{r.clients}</td>
                <td>{r.actualNew}</td>
                <td>{formatArs(r.bruto)}</td>
                <td className="neg">−{formatArs(r.mpFeeTotal)}</td>
                <td className="neg">−{formatArs(r.commVend)}</td>
                <td className="total-col">{formatArs(r.ganancia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .admin-calc {
          background: var(--surface, #161616);
          border: 1px solid var(--border, #2a2a2a);
          border-radius: var(--radius-lg, 16px);
          padding: 24px;
        }

        .admin-calc__header { margin-bottom: 20px; }
        .admin-calc__title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
        .admin-calc__subtitle { font-size: 13px; color: var(--text-3, #888); line-height: 1.6; }

        /* WATERFALL */
        .admin-calc__waterfall {
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 12px; padding: 16px 18px; margin-bottom: 12px;
        }
        .admin-calc__waterfall-title {
          font-size: 10px; color: var(--text-3, #888); letter-spacing: .06em;
          text-transform: uppercase; margin-bottom: 12px;
        }
        .wf-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0; border-bottom: 1px solid var(--border, #2a2a2a); font-size: 13px;
        }
        .wf-row:last-child { border-bottom: none; }
        .wf-row--total { padding-top: 10px; margin-top: 2px; }
        .wf-label { color: var(--text-3, #888); }
        .wf-label small { display: block; font-size: 10px; color: var(--text-3, #555); margin-top: 1px; }
        .wf-label--total { color: var(--text, #f0ede8); font-weight: 500; }
        .wf-val { font-family: 'DM Mono', ui-monospace, monospace; font-size: 14px; }
        .wf-val--neg { color: #f06060; }
        .wf-val--base { color: var(--text, #f0ede8); }
        .wf-val--result { color: #c8f060; font-size: 17px; font-weight: 500; }
        .wf-val--result2 { color: #60d4a0; font-size: 17px; font-weight: 500; }
        .wf-pct { font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px; color: var(--text-3, #555); margin-left: 6px; }

        /* SLIDERS */
        .admin-calc__sliders { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
        .slider-group { display: grid; gap: 6px; }
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
        .slider-group__input--teal::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: #60d4a0; border: 3px solid var(--bg, #0d0d0d);
          box-shadow: 0 0 0 1px #60d4a0; cursor: pointer;
        }
        .slider-group__input--teal::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #60d4a0; border: 3px solid var(--bg, #0d0d0d); cursor: pointer;
        }

        /* METRICS */
        .admin-calc__metrics {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 8px; margin-bottom: 20px;
        }
        .metric-card {
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 10px; padding: 12px 14px;
        }
        .metric-card--teal { border-color: rgba(96,212,160,.3); background: rgba(96,212,160,.04); }
        .metric-card--teal2 { border-color: rgba(200,240,96,.25); background: rgba(200,240,96,.04); }
        .metric-card--red { border-color: rgba(240,96,96,.25); background: rgba(240,96,96,.04); }
        .metric-card--blue { border-color: rgba(96,168,240,.25); background: rgba(96,168,240,.04); }
        .metric-card__label { font-size: 10px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
        .metric-card__value { font-family: 'DM Mono', ui-monospace, monospace; font-size: 17px; font-weight: 500; line-height: 1; }
        .metric-card--teal .metric-card__value { color: #60d4a0; }
        .metric-card--teal2 .metric-card__value { color: #c8f060; }
        .metric-card--red .metric-card__value { color: #f06060; }
        .metric-card--blue .metric-card__value { color: #60a8f0; }
        .metric-card__sub { font-size: 10px; color: var(--text-3, #555); margin-top: 3px; }

        /* CHARTS */
        .admin-calc__chart-wrap { margin-bottom: 12px; }
        .admin-calc__chart-title { font-size: 11px; color: var(--text-3, #888); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 8px; }
        .chart-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
        .chart-legend__item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-3, #888); }
        .chart-legend__dot { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
        .chart-legend__dot--teal { background: #60d4a0; }
        .chart-legend__dot--green { background: #c8f060; }
        .chart-legend__dot--red { background: #f06060; }
        .chart-legend__line { width: 14px; height: 1.5px; flex-shrink: 0; }
        .chart-legend__line--green { background: rgba(200,240,96,.5); border-radius: 999px; }

        .h-bar-wrap { margin-bottom: 12px; }
        .h-bar { height: 28px; border-radius: 6px; overflow: hidden; display: flex; background: var(--surface-2, #1e1e1e); }
        .h-bar__seg { min-height: 0; transition: width .2s; }
        .h-bar__seg--teal { background: #60d4a0; }
        .h-bar__seg--green { background: #c8f060; }
        .h-bar__seg--red { background: #f06060; }
        .h-bar-labels { display: flex; gap: 12px; font-size: 10px; color: var(--text-3, #555); font-family: 'DM Mono', ui-monospace, monospace; margin-top: 4px; }

        .chart-bars {
          display: flex; align-items: flex-end; gap: 3px;
          height: 160px; padding: 0 4px;
          border-bottom: 1px solid var(--border, #2a2a2a);
        }
        .chart-bars__col {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          position: relative; min-width: 0;
        }
        .chart-bars__dual { width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
        .chart-bars__bar { border-radius: 2px 2px 0 0; min-height: 0; width: 45%; transition: height .2s; }
        .chart-bars__bar--teal { background: rgba(96,212,160,.7); }
        .chart-bars__bar--outline { background: transparent; border: 1px dashed rgba(200,240,96,.4); }
        .chart-bars__label {
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 9px;
          color: var(--text-3, #555); margin-top: 6px;
        }

        /* TABLE */
        .admin-calc__table-wrap {
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 12px; overflow: hidden; margin-bottom: 0;
        }
        .admin-calc__table-header {
          padding: 10px 14px; border-bottom: 1px solid var(--border, #2a2a2a);
          font-size: 11px; color: var(--text-3, #888); letter-spacing: .06em; text-transform: uppercase;
        }
        .admin-calc__table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .admin-calc__table thead th {
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 9px;
          color: var(--text-3, #555); text-align: right; padding: 7px 10px;
          border-bottom: 1px solid var(--border, #2a2a2a); font-weight: 400;
        }
        .admin-calc__table thead th:first-child { text-align: left; }
        .admin-calc__table tbody td {
          padding: 7px 10px; text-align: right;
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px;
          color: var(--text-3, #888);
        }
        .admin-calc__table tbody td:first-child {
          text-align: left; color: var(--text, #f0ede8);
          font-family: 'Instrument Sans', sans-serif; font-size: 11px;
        }
        .admin-calc__table tbody td.neg { color: #f06060; }
        .admin-calc__table tbody td.total-col { color: #c8f060; font-weight: 500; }
        .admin-calc__table tbody tr { border-bottom: 1px solid var(--border, #2a2a2a); }
        .admin-calc__table tbody tr:last-child { border-bottom: none; }
        .admin-calc__table tbody tr:hover { background: rgba(255,255,255,.03); }

        @media (max-width: 640px) {
          .admin-calc { padding: 16px; }
          .admin-calc__metrics { grid-template-columns: 1fr 1fr; }
          .admin-calc__table { font-size: 10px; }
          .admin-calc__table thead th, .admin-calc__table tbody td { padding: 5px 7px; }
        }
      `}</style>
    </div>
  );
}
