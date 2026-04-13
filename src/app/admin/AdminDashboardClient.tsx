"use client";

import AdminRentabilityCalculator from "@/components/admin/AdminRentabilityCalculator";

interface AdminDashboardClientProps {
  totalSubscriptions: number;
  activeClients: number;
  newThisMonth: number;
}

export default function AdminDashboardClient({
  totalSubscriptions,
  activeClients,
  newThisMonth,
}: AdminDashboardClientProps) {
  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">Dashboard</h1>
        <p className="admin-dashboard__subtitle">
          {activeClients} kioscos activos · {newThisMonth} nuevos este mes
        </p>
      </div>

      {/* QUICK STATS */}
      <div className="admin-dashboard__stats">
        <div className="admin-dashboard__stat">
          <span className="admin-dashboard__stat-label">Suscripciones activas</span>
          <span className="admin-dashboard__stat-value">{totalSubscriptions}</span>
        </div>
        <div className="admin-dashboard__stat">
          <span className="admin-dashboard__stat-label">Kioscos activos</span>
          <span className="admin-dashboard__stat-value">{activeClients}</span>
        </div>
        <div className="admin-dashboard__stat">
          <span className="admin-dashboard__stat-label">Nuevos (30 días)</span>
          <span className="admin-dashboard__stat-value">{newThisMonth}</span>
        </div>
      </div>

      {/* RENTABILITY CALCULATOR */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__section-title">Calculadora de rentabilidad</h2>
        <AdminRentabilityCalculator />
      </section>

      <style jsx>{`
        .admin-dashboard__header { margin-bottom: 24px; }
        .admin-dashboard__title { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 4px; }
        .admin-dashboard__subtitle { font-size: 13px; color: var(--text-3, #888); }

        .admin-dashboard__stats {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 32px;
        }
        .admin-dashboard__stat {
          background: var(--surface, #161616); border: 1px solid var(--border, #2a2a2a);
          border-radius: var(--radius-md, 12px); padding: 16px 18px;
        }
        .admin-dashboard__stat-label { font-size: 11px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .05em; display: block; margin-bottom: 6px; }
        .admin-dashboard__stat-value { font-size: 28px; font-weight: 800; color: var(--text, #f0ede8); }

        .admin-dashboard__section { margin-bottom: 32px; }
        .admin-dashboard__section-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .06em; }
      `}</style>
    </div>
  );
}
