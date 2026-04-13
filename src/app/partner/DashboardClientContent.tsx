"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PartnerImageUploader from "@/components/partner/PartnerImageUploader";
import PartnerGamificationBar from "@/components/partner/PartnerGamificationBar";
import PartnerWallet from "@/components/partner/PartnerWallet";
import PartnerRevenueChart from "@/components/partner/PartnerRevenueChart";
import PartnerCalculator from "@/components/partner/PartnerCalculator";
import type { PartnerStatsResult } from "@/lib/partner-stats";

interface RecentItem {
  id: string;
  createdAt: Date;
  referredKiosco: { name: string };
  recurring: { recurringAmount: number | null; clientActive: boolean } | null;
}

interface DashboardClientContentProps {
  stats: PartnerStatsResult;
  activeClients: number;
  recent: RecentItem[];
  userImage?: string | null;
}

function useCountUp(end: number, duration: number = 1200) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      const ease = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);
      setCount(Math.floor(end * ease));
      if (percentage < 1) requestAnimationFrame(animate);
    };
    
    // Slight delay for impact
    const timeout = setTimeout(() => requestAnimationFrame(animate), 150);
    return () => clearTimeout(timeout);
  }, [end, duration]);
  
  return count;
}

export default function DashboardClientContent({
  stats,
  activeClients,
  recent,
  userImage,
}: DashboardClientContentProps) {
  const animatedIncome = useCountUp(stats.projectedIncome);

  const chartData = [
    { name: "Hace 5M", value: Math.max(0, stats.totalMRR * 0.3) },
    { name: "Hace 4M", value: Math.max(0, stats.totalMRR * 0.45) },
    { name: "Hace 3M", value: Math.max(0, stats.totalMRR * 0.6) },
    { name: "Hace 2M", value: Math.max(0, stats.totalMRR * 0.75) },
    { name: "Pasado", value: Math.max(0, stats.totalMRR * 0.9) },
    { name: "Est. Actual", value: stats.projectedIncome },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Centro de Control</h1>
        <p className="dashboard__subtitle">Sistema inteligente de comisiones Gamificadas Clikit</p>
      </header>

      {/* TIER Y GAMIFICACION (Top Banner) */}
      <div className="mb-6">
        <PartnerGamificationBar stats={stats} />
      </div>

      <div className="bento-grid">
        {/* COLUMNA IZQUIERDA: Finanzas y Proyecciones */}
        <div className="bento-col main-col">
          <div className="bento-row">
            
            {/* INGRESO PROYECTADO ESTE MES */}
            <div className="bento-card highlight-card wow-glow">
              <span className="bento-label">Ingreso Pasivo Proyectado</span>
              <div className="bento-value highlight-text">
                ${animatedIncome.toLocaleString("es-AR")}
              </div>
              
              <div className="bento-impact">
                +${Math.max(0, Math.round(stats.projectedIncome - stats.incomeIfNoTierBonus)).toLocaleString("es-AR")} gracias a tu nivel actual
              </div>

              <div className="bento-footer">
                <span className="bento-subtext">Mes actual</span>
                <span className="bento-badge">Tasa global {stats.tierPct.toFixed(0)}%</span>
              </div>

              {stats.nextTierPct && stats.salesToNextTier && stats.totalProjectedGain && (
                <div className="next-reward">
                  Te faltan {stats.salesToNextTier} ventas para desbloquear{" "}
                  <strong>+${Math.round(stats.totalProjectedGain).toLocaleString("es-AR")}</strong>{" "}
                  por mes
                </div>
              )}

              <div className="degradation-warning">
                Si el próximo mes no vendés, tu ingreso estimado será: <strong>${Math.round(stats.nextMonthZeroSalesIncome).toLocaleString("es-AR")}</strong>
              </div>
            </div>

            {/* TOTAL CLIENTES ACTIVOS */}
            <div className="bento-card">
              <div className="bento-header-flex">
                <span className="bento-label">Mi Cartera</span>
                <Link href="/partner/cartera" className="bento-link">Ver lista →</Link>
              </div>
              <div className="bento-value">{activeClients}</div>
              
              <div className="mrr-breakdown">
                <strong>Desglose de Base Pasiva</strong>
                <div className="breakdown-row"><span>Base retenida:</span> <span>${Math.round(stats.oldMRR).toLocaleString("es-AR")}</span></div>
                <div className="breakdown-row"><span>Logrado este mes:</span> <span>${Math.round(stats.newMRR).toLocaleString("es-AR")}</span></div>
              </div>

              <div className="bento-footer mt-auto">
                <div className="flex-col">
                  <span className="bento-subtext text-success">
                    +{stats.currentMonthSales} ventas este mes
                  </span>
                  <span className="bento-subtext mt-1">
                    Generando <strong>${Math.round(stats.totalMRR).toLocaleString("es-AR")}</strong> en MRR
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <PartnerRevenueChart data={chartData} />
          </div>
          
          {/* RECIENTES */}
          <div className="bento-card mt-4">
            <div className="bento-header-flex mb-4">
              <h3 className="section-title">Últimos referidos</h3>
              <Link href="/partner/cartera" className="bento-link">Ver todos</Link>
            </div>
            <div className="recent-list">
              {recent.map((item) => (
                <div key={item.id} className="recent-item">
                  <div className="recent-info">
                    <span className="recent-name">{item.referredKiosco.name}</span>
                    <span className="recent-date">{new Date(item.createdAt).toLocaleDateString("es-AR")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.recurring?.recurringAmount && (
                      <span className="recent-amount">
                        +${item.recurring.recurringAmount.toLocaleString("es-AR")}
                      </span>
                    )}
                    {item.recurring?.clientActive ? (
                      <span className="badge badge-success">Activo</span>
                    ) : (
                      <span className="badge badge-pending">Pendiente</span>
                    )}
                  </div>
                </div>
              ))}
              {recent.length === 0 && (
                <div className="text-center p-4 opacity-50 text-sm">
                  Sin referidos todavía. ¡Compartí tu link!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Billetera y Herramientas */}
        <div className="bento-col side-col">
          <PartnerWallet stats={stats} />

          <div className="mt-4">
            <PartnerCalculator />
          </div>

          <div className="bento-card side-tools mt-4">
            <PartnerImageUploader currentImage={userImage ?? null} />

            <div className="promo-tools mt-6">
              <h4 className="tools-title">Kit de Ventas</h4>
              <p className="tools-desc">Comparte tu enlace con potenciales clientes y mira cómo se llena tu proyección mensual.</p>
              <Link href="/partner/link" className="action-btn">
                Obtener mis enlaces
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dashboard__header { margin-bottom: 24px; }
        .dashboard__title { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; color: var(--text); font-family: 'Bricolage Grotesque', sans-serif;}
        .dashboard__subtitle { color: var(--text-3); font-size: 15px; margin-top: 4px; }

        .mb-6 { margin-bottom: 24px; }
        .mt-4 { margin-top: 16px; }
        .mt-6 { margin-top: 24px; }
        .mb-4 { margin-bottom: 16px; }
        .mt-1 { margin-top: 4px; }
        .mt-auto { margin-top: auto; }
        .flex-col { display: flex; flex-direction: column; }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-3 { gap: 12px; }

        .text-success { color: #22d98a !important; font-weight: 600 !important; }

        /* BENTO GRID */
        .bento-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
          align-items: start;
        }

        .bento-col {
          display: flex;
          flex-direction: column;
        }

        .bento-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .bento-card {
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 24px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .wow-glow {
          animation: pop-in 0.6s cubic-bezier(0.16, 1, 0.3, 1), super-glow 3s infinite alternate ease-in-out;
        }

        @keyframes pop-in {
          0% { transform: scale(0.96); opacity: 0; filter: blur(4px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }

        @keyframes super-glow {
          0% { box-shadow: 0 0 10px rgba(34, 217, 138, 0.05); }
          100% { box-shadow: 0 0 30px rgba(34, 217, 138, 0.2); }
        }

        .highlight-card {
          background: linear-gradient(145deg, rgba(34,217,138,0.08), rgba(0,0,0,0));
          border-color: rgba(34,217,138,0.25);
        }

        .bento-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-3);
          letter-spacing: 0.05em;
        }

        .bento-value {
          font-size: 38px;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-family: 'Bricolage Grotesque', sans-serif;
          color: var(--text);
          margin-top: 12px;
          margin-bottom: 4px;
        }

        .bento-impact {
          font-size: 13px;
          font-weight: 700;
          color: #22d98a;
          margin-bottom: 16px;
        }

        .next-reward {
          margin-top: 16px;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(245, 166, 35, 0.15), rgba(245, 166, 35, 0.05));
          border: 1px solid rgba(245, 166, 35, 0.3);
          border-radius: 8px;
          font-size: 12px;
          color: #f5a623;
          line-height: 1.4;
          box-shadow: 0 4px 12px rgba(245, 166, 35, 0.1);
        }
        
        .next-reward strong {
          font-size: 14px;
          font-weight: 800;
        }

        .highlight-text {
          color: #22d98a;
          text-shadow: 0 0 25px rgba(34,217,138,0.3);
        }

        .bento-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .bento-subtext {
          font-size: 12px;
          color: var(--text-3);
        }

        .bento-badge {
          background: rgba(34,217,138,0.15);
          color: #22d98a;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          transition: background 0.3s;
        }

        .bento-header-flex {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .bento-link {
          font-size: 12px;
          font-weight: 700;
          color: var(--primary);
          text-decoration: none;
        }
        
        .bento-link:hover { text-decoration: underline; }

        .degradation-warning {
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 11px;
          color: var(--text-3);
          line-height: 1.4;
        }

        .mrr-breakdown {
          margin: 16px 0;
          padding: 12px;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.03);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .mrr-breakdown strong {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-3);
          margin-bottom: 2px;
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }

        .breakdown-row span:last-child {
          font-weight: 700;
          color: var(--text);
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
        }

        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .recent-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 8px;
          transition: background 0.2s;
        }

        .recent-item:hover {
          background: rgba(255,255,255,0.04);
        }

        .recent-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .recent-name {
          font-size: 14px;
          font-weight: 600;
        }

        .recent-date {
          font-size: 11px;
          color: var(--text-3);
        }

        .recent-amount {
          font-size: 13px;
          font-weight: 700;
          color: #22d98a;
          margin-right: 4px;
        }

        .badge {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .badge-success { background: rgba(34,217,138,0.15); color: #22d98a; }
        .badge-pending { background: rgba(255,255,255,0.1); color: var(--text-2); }

        .side-tools {
          position: sticky;
          top: 24px;
        }

        .tools-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 6px;
        }

        .tools-desc {
          font-size: 13px;
          color: var(--text-2);
          line-height: 1.5;
          margin-bottom: 20px;
        }

        .action-btn {
          display: block;
          width: 100%;
          text-align: center;
          background: var(--text);
          color: var(--bg);
          padding: 12px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s;
        }

        .action-btn:hover {
          transform: scale(1.03);
          background: #eef2f7;
        }
        
        .action-btn:active {
          transform: scale(0.97);
        }

        @media (max-width: 900px) {
          .bento-grid { grid-template-columns: 1fr; }
          .bento-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
