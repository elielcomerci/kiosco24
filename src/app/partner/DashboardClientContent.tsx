"use client";

import Link from "next/link";
import PartnerCalculator from "@/components/partner/PartnerCalculator";

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
}: DashboardClientContentProps) {
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

          {/* CALCULADORA DE INGRESOS */}
          <PartnerCalculator />

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
        }
      `}</style>
    </div>
  );
}
