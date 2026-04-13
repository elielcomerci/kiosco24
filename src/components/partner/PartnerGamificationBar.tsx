"use client";

import { useEffect, useState } from "react";
import type { PartnerStatsResult } from "@/lib/partner-stats";

export default function PartnerGamificationBar({ stats }: { stats: PartnerStatsResult }) {
  const [justUpgraded, setJustUpgraded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storageKey = `clikit_last_tier_${stats.partnerId}`;
    const lastTier = localStorage.getItem(storageKey);
    const parsedLastTier = lastTier ? parseInt(lastTier, 10) : null;
    
    if (parsedLastTier !== null && parsedLastTier < stats.tierPct) {
      setJustUpgraded(true);
      setTimeout(() => setJustUpgraded(false), 2000);
    }
    localStorage.setItem(storageKey, stats.tierPct.toString());
  }, [stats.tierPct, stats.partnerId]);

  const isMaxTier = stats.tierPct >= 50;
  // Progress dynamically scales based on next milestone for maximum satisfaction scaling
  const maxSales = stats.currentMonthSales >= 50 ? 100 : 50;
  const progressPct = Math.min(100, (stats.currentMonthSales / maxSales) * 100);

  const megaImpact = stats.projectedIncome > 0 && stats.lastSaleImpact > (stats.projectedIncome * 0.15) && stats.lastSaleImpact > 3000;
  const bonusImpact = stats.projectedIncome - stats.incomeIfNoTierBonus;

  const isSilver = stats.currentMonthSales >= 50;
  const isGold = stats.currentMonthSales >= 100;
  
  const nearSilver = stats.currentMonthSales >= 45 && stats.currentMonthSales < 50;
  const nearGold = stats.currentMonthSales >= 90 && stats.currentMonthSales < 100;
  
  const nextMilestone = stats.currentMonthSales >= 50 ? 100 : 50;
  const energyLevel = progressPct / 100;

  const tierLabel = stats.tierPct === 30 ? "Bronce" : stats.tierPct === 40 ? "Plata" : "Oro";

  return (
    <div className={`gamification-card ${mounted ? 'enter' : ''} ${justUpgraded ? 'tier-up-glow' : ''}`}>
      <div className="gamification-header">
        <div className={`tier-badge tier-${stats.tierPct}`}>Nivel {tierLabel} — {stats.tierPct}%</div>
        <div className="flex-right-group">
          {stats.lastSaleImpact > 0 && (
            <div className={`last-sale-impact ${megaImpact ? 'mega-impact' : ''}`}>
              Tu última venta sumó +${Math.round(stats.lastSaleImpact).toLocaleString("es-AR")}/mes
            </div>
          )}
          {bonusImpact > 0 && (
            <div className="bonus-impact">
              ✨ Estás ganando +${Math.round(bonusImpact).toLocaleString("es-AR")}/mes extra por tu nivel
            </div>
          )}
        </div>
      </div>

      <div className="progress-container">
        <div className="progress-info">
          <span className="sales-count">🔥 {stats.currentMonthSales} ventas este mes</span>
          {isMaxTier ? (
            <span className="max-tier">Nivel Oro desbloqueado 🚀</span>
          ) : (
            stats.totalProjectedGain !== null && (
              nearSilver || nearGold ? (
                <span className="sales-needed hot">
                  Estás a <strong>{stats.salesToNextTier}</strong> ventas de subir de nivel 🚀
                </span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                  <span className="sales-needed">
                    Te faltan <strong>{stats.salesToNextTier}</strong> ventas para destrabar <strong>+${Math.round(stats.totalProjectedGain).toLocaleString("es-AR")}/mes</strong>
                  </span>
                  {stats.passiveUpgradeGain !== null && stats.passiveUpgradeGain > 0 && (
                    <span className="sales-needed" style={{ fontSize: '11px', opacity: 0.8 }}>
                      ✨ De eso, <strong>+${Math.round(stats.passiveUpgradeGain).toLocaleString("es-AR")}</strong> vienen solo por subir de nivel
                    </span>
                  )}
                </div>
              )
            )
          )}
        </div>
        
        <div className="progress-track">
          <div className={`progress-mark mark-50 ${isSilver ? 'reached' : ''} ${nearSilver ? 'mark-near' : ''}`}>
            <span className={`mark-label ${isSilver ? 'label-reached' : ''} ${nearSilver ? 'label-near' : ''}`}>Plata (40%)</span>
          </div>
          <div className={`progress-mark mark-100 ${isGold ? 'reached' : ''} ${nearGold ? 'mark-near' : ''}`}>
            <span className={`mark-label ${isGold ? 'label-reached' : ''} ${nearGold ? 'label-near' : ''}`}>Oro (50%)</span>
          </div>

          <div 
            className={`progress-fill ${energyLevel > 0.7 ? 'ultra-energy' : energyLevel > 0.4 ? 'high-energy' : ''}`} 
            style={{ width: `${progressPct}%` }}
          />
        </div>
        
        {(nearSilver || nearGold) && stats.totalProjectedGain !== null && (
          <div className="near-reward">
            Al llegar a {nextMilestone} ventas: tu comisión pasiva asume un turbo de +${Math.round(stats.totalProjectedGain).toLocaleString("es-AR")}/mes
          </div>
        )}
      </div>

      <div className="tier-explanation">
        <div className="explanation-item">
          <strong>Nuevas ventas</strong>
          <span>Siempre ganás el 50%</span>
        </div>
        <div className="explanation-item">
          <strong>Tu cartera</strong>
          <span>Ahora está pagando {stats.tierPct}%</span>
        </div>
      </div>

      <style jsx>{`
        .gamification-card {
          background: linear-gradient(145deg, rgba(34, 217, 138, 0.03), rgba(245, 166, 35, 0.05));
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: grid;
          gap: 24px;
          opacity: 0;
          transform: scale(0.98);
        }

        .gamification-card.enter {
          opacity: 1;
          transform: scale(1);
          transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;
        }

        .tier-up-glow {
          box-shadow: 0 0 50px rgba(34, 217, 138, 0.15) !important;
          border-color: rgba(34, 217, 138, 0.5) !important;
          animation: mega-pulse 0.6s ease 3;
        }

        @keyframes mega-pulse {
          0% { box-shadow: 0 0 10px rgba(34, 217, 138, 0.05); }
          50% { box-shadow: 0 0 60px rgba(34, 217, 138, 0.35); }
          100% { box-shadow: 0 0 10px rgba(34, 217, 138, 0.05); }
        }

        .gamification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .tier-badge {
          display: inline-flex;
          padding: 6px 14px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }

        .tier-30 {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-2);
        }
        .tier-40 {
          background: rgba(245, 166, 35, 0.15);
          border: 1px solid rgba(245, 166, 35, 0.4);
          color: #f5a623;
          box-shadow: 0 0 10px rgba(245, 166, 35, 0.2);
        }
        .tier-50 {
          background: rgba(34, 217, 138, 0.15);
          border: 1px solid rgba(34, 217, 138, 0.4);
          color: #22d98a;
          box-shadow: 0 0 15px rgba(34, 217, 138, 0.3);
        }

        .flex-right-group {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .bonus-impact {
          font-size: 13px;
          font-weight: 700;
          color: #22d98a;
          background: rgba(34, 217, 138, 0.1);
          padding: 6px 12px;
          border-radius: 8px;
        }

        .last-sale-impact {
          font-size: 13px;
          font-weight: 700;
          color: #f5a623;
          background: rgba(245, 166, 35, 0.1);
          padding: 6px 12px;
          border-radius: 8px;
          transition: all 0.5s ease;
        }

        .mega-impact {
          color: #fff;
          background: linear-gradient(135deg, #f5a623, #ff5e3a);
          box-shadow: 0 0 15px rgba(245, 166, 35, 0.4);
          transform: scale(1.05);
          animation: pulse-mega 2s infinite alternate;
        }

        @keyframes pulse-mega {
          0% { box-shadow: 0 0 10px rgba(245, 166, 35, 0.4); }
          100% { box-shadow: 0 0 25px rgba(255, 94, 58, 0.6); }
        }

        .progress-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .sales-count { font-weight: 700; color: var(--text); }
        .sales-needed { color: var(--text-3); }
        .sales-needed strong { color: #f5a623; font-weight: 800; }

        .sales-needed.hot {
          color: #ff5e3a;
          text-shadow: 0 0 10px rgba(255, 94, 58, 0.3);
          animation: pulse-op 1s infinite alternate;
        }
        @keyframes pulse-op {
          from { opacity: 0.8; }
          to { opacity: 1; }
        }
        
        .max-tier { 
          color: #22d98a; 
          font-weight: 800; 
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-shadow: 0 0 15px rgba(34, 217, 138, 0.4);
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
          100% { transform: translateY(0px); }
        }

        .near-reward {
          margin-top: 4px;
          padding: 8px 14px;
          background: linear-gradient(90deg, rgba(245, 166, 35, 0.1), transparent);
          border-left: 3px solid #f5a623;
          border-radius: 0 8px 8px 0;
          font-size: 12px;
          font-weight: 700;
          color: #f5a623;
        }

        .progress-track {
          height: 16px;
          background: rgba(255,255,255,0.05);
          border-radius: 999px;
          position: relative;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        .progress-mark {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(255,255,255,0.2);
          z-index: 10;
          transition: all 0.3s;
        }

        .mark-near {
          background: #f5a623;
          box-shadow: 0 0 8px rgba(245, 166, 35, 0.6);
          animation: pulse-near 1s infinite alternate;
        }
        
        @keyframes pulse-near {
          from { opacity: 0.6; box-shadow: 0 0 4px rgba(245, 166, 35, 0.4); }
          to { opacity: 1; box-shadow: 0 0 12px rgba(245, 166, 35, 0.8); }
        }

        .progress-mark.reached {
          background: #22d98a;
          box-shadow: 0 0 10px rgba(34, 217, 138, 0.8);
          width: 3px;
          animation: none;
        }

        .mark-50 { left: 50%; transform: translateX(-50%); }
        .mark-100 { left: 100%; transform: translateX(-100%); }

        .mark-label {
          position: absolute;
          top: -22px;
          transform: translateX(-50%);
          font-size: 10px;
          font-weight: 700;
          color: var(--text-3);
          text-transform: uppercase;
          white-space: nowrap;
          transition: color 0.3s;
        }

        .label-near {
          color: #f5a623;
          text-shadow: 0 0 8px rgba(245, 166, 35, 0.4);
        }

        .label-reached {
          color: #22d98a;
          text-shadow: 0 0 8px rgba(34, 217, 138, 0.4);
        }

        .progress-fill {
          height: 100%;
          transform-origin: left;
          background: linear-gradient(90deg, #f5a623, #22d98a);
          background-size: 200% 100%;
          border-radius: 999px;
          transition: width 1.2s cubic-bezier(0.16, 1.3, 0.3, 1), opacity 0.5s;
          box-shadow: 0 0 6px rgba(34, 217, 138, 0.2);
          animation: flow-gradient 3s infinite linear;
          opacity: 0.8;
        }

        .progress-fill.high-energy {
          opacity: 1;
          box-shadow: 0 0 16px rgba(34, 217, 138, 0.5);
        }

        .progress-fill.ultra-energy {
          opacity: 1;
          background: linear-gradient(90deg, #ff5e3a, #f5a623, #22d98a);
          background-size: 200% 100%;
          box-shadow: 0 0 24px rgba(34, 217, 138, 0.8);
          animation: flow-gradient 1.5s infinite linear;
        }

        @keyframes flow-gradient {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        .tier-explanation {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .explanation-item {
          background: rgba(0,0,0,0.2);
          padding: 14px 18px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.04);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .explanation-item strong {
          font-size: 12px;
          color: var(--text-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .explanation-item span {
          font-size: 16px;
          font-weight: 800;
          color: var(--text);
          font-family: 'Bricolage Grotesque', sans-serif;
        }
        
        @media (max-width: 600px) {
           .mark-label { display: none; }
        }
      `}</style>
    </div>
  );
}
