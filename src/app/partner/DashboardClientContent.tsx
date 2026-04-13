"use client";

import { useState } from "react";
import Link from "next/link";

interface RecentItem {
  id: string;
  createdAt: Date;
  referredKiosco: { name: string };
  recurring: { recurringAmount: number | null; clientActive: boolean } | null;
}

interface DashboardClientContentProps {
  monthlyIncome: number;
  activeClients: number;
  pendingAmount: number;
  recent: RecentItem[];
  recurringAmount: number;
}

export default function DashboardClientContent({
  monthlyIncome,
  activeClients,
  pendingAmount,
  recent,
  recurringAmount,
}: DashboardClientContentProps) {
  const [targetSales, setTargetSales] = useState(10);
  const [targetMonths, setTargetMonths] = useState(12);

  const projectedMonthly = monthlyIncome + targetSales * targetMonths * recurringAmount;

  const milestones = [
    { value: 150000, label: "🚀 Primer Objetivo" },
    { value: 400000, label: "💼 Sueldo Full" },
    { value: 1000000, label: "🏆 Escala VIP" },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Tu negocio</h1>
        <p className="dashboard__subtitle">Construyendo ingresos recurrentes con CLIKIT.</p>
      </header>

      {/* MÉTRICAS REALES */}
      <div className="stats-grid">
        <div className="stat-card stat-card--highlight">
          <span className="stat-card__label">Generando por mes</span>
          <div className="stat-card__value">${monthlyIncome.toLocaleString("es-AR")}</div>
          <span className="stat-card__subtext">ingreso mensual fijo</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Clientes activos</span>
          <div className="stat-card__value">{activeClients}</div>
          <Link href="/partner/cartera" className="stat-card__link">Ver lista →</Link>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Pendiente cobro</span>
          <div className="stat-card__value">${pendingAmount.toLocaleString("es-AR")}</div>
          <span className="stat-card__subtext">próxima liquidación</span>
        </div>
      </div>

      <div className="dashboard__layout">
        <div className="dashboard__main">

          {/* CALCULADORA DE PROYECCIÓN */}
          <section className="calculator">
            <div className="calculator__header">
              <h3>Simulador de Crecimiento</h3>
              <p>Proyectá tus ganancias según tu ritmo de ventas.</p>
            </div>

            <div className="calculator__body">
              <div className="calculator__inputs">
                <div className="input-field">
                  <label>Ventas nuevas por mes</label>
                  <input
                    type="range" min="1" max="50" value={targetSales}
                    onChange={(e) => setTargetSales(parseInt(e.target.value))}
                  />
                  <span className="input-display">{targetSales} clientes/mes</span>
                </div>
                <div className="input-field">
                  <label>Meses de proyección</label>
                  <input
                    type="range" min="1" max="24" value={targetMonths}
                    onChange={(e) => setTargetMonths(parseInt(e.target.value))}
                  />
                  <span className="input-display">{targetMonths} meses</span>
                </div>
              </div>

              <div className="calculator__result">
                <span className="result-label">Ingreso mensual proyectado:</span>
                <div className="result-value">
                  ${projectedMonthly.toLocaleString("es-AR")}
                  <small>/mes</small>
                </div>

                <div className="milestones-track">
                  {milestones.map((m) => (
                    <div
                      key={m.value}
                      className={`milestone ${projectedMonthly >= m.value ? 'active' : ''}`}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* RECIENTES */}
          <section className="dashboard__section">
            <div className="section-header">
              <h3 className="section-header__title">Últimos clientes</h3>
              <Link href="/partner/cartera" className="section-header__link">Ver todos</Link>
            </div>
            <div className="recent-list">
              {recent.map((item) => (
                <div key={item.id} className="item">
                  <div className="item__info">
                    <span className="item__name">{item.referredKiosco.name}</span>
                    <span className="item__date">{new Date(item.createdAt).toLocaleDateString("es-AR")}</span>
                  </div>
                  <div className="item__meta">
                    {item.recurring ? (
                      <span className="item__status item__status--active">Activo</span>
                    ) : (
                      <span className="item__status item__status--pending">Pendiente</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="dashboard__aside">
          <div className="promo-card">
            <h4>Expandí tu red</h4>
            <p>Usá tu link personal para registrar nuevos clientes y asegurar tu comisión.</p>
            <Link href="/partner/link" className="btn-action">Compartir mi link</Link>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .dashboard__header { margin-bottom: 32px; }
        .dashboard__title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
        .dashboard__subtitle { color: var(--text-3); font-size: 14px; }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .stat-card { background: var(--surface); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius-md); }
        .stat-card--highlight { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 3%, var(--surface)); }
        .stat-card__label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-3); }
        .stat-card__value { font-size: 28px; font-weight: 800; margin: 4px 0; }
        .stat-card__subtext { font-size: 11px; color: var(--text-3); }
        .stat-card__link { font-size: 11px; font-weight: 700; color: var(--primary); text-decoration: none; }

        .dashboard__layout { display: grid; grid-template-columns: 1fr 320px; gap: 32px; }

        /* CALCULADORA */
        .calculator {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
          margin-bottom: 32px; overflow: hidden;
        }
        .calculator__header { padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
        .calculator__header h3 { font-size: 14px; font-weight: 700; }
        .calculator__header p { font-size: 12px; color: var(--text-3); }

        .calculator__body { display: grid; grid-template-columns: 1fr 1fr; }
        .calculator__inputs { padding: 24px; border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 20px; }
        .input-field label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-3); margin-bottom: 8px; }
        .input-field input { width: 100%; accent-color: var(--primary); }
        .input-display { font-size: 12px; font-weight: 700; color: var(--primary); margin-top: 4px; display: block; }

        .calculator__result { padding: 24px; display: flex; flex-direction: column; justify-content: center; background: color-mix(in srgb, var(--primary) 2%, transparent); }
        .result-label { font-size: 12px; color: var(--text-3); }
        .result-value { font-size: 32px; font-weight: 900; color: var(--text); }
        .result-value small { font-size: 14px; color: var(--text-3); margin-left: 4px; }

        .milestones-track { display: flex; gap: 6px; margin-top: 16px; }
        .milestone {
          font-size: 9px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);
          color: var(--text-3); font-weight: 700; opacity: 0.5; transition: 0.3s;
        }
        .milestone.active { opacity: 1; border-color: var(--primary); background: var(--primary); color: white; }

        /* LISTA RECIENTES */
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .section-header__title { font-size: 14px; font-weight: 700; }
        .section-header__link { font-size: 12px; color: var(--primary); }
        .recent-list { display: flex; flex-direction: column; gap: 8px; }
        .item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
        .item__name { font-weight: 600; font-size: 14px; }
        .item__date { font-size: 11px; color: var(--text-3); display: block; }
        .item__status { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
        .item__status--active { background: #dcfce7; color: #166534; }
        .item__status--pending { background: #f1f5f9; color: #475569; }

        /* ASIDE */
        .promo-card { background: var(--text); color: var(--surface); padding: 24px; border-radius: var(--radius-md); position: sticky; top: 24px; }
        .promo-card h4 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .promo-card p { font-size: 13px; opacity: 0.8; line-height: 1.5; }
        .btn-action { display: block; margin-top: 20px; padding: 12px; background: var(--primary); color: white; text-align: center; border-radius: var(--radius-sm); font-weight: 700; text-decoration: none; }

        @media (max-width: 900px) {
          .dashboard__layout { grid-template-columns: 1fr; }
          .calculator__body { grid-template-columns: 1fr; }
          .calculator__inputs { border-right: none; border-bottom: 1px solid var(--border); }
        }
      `}</style>
    </div>
  );
}
