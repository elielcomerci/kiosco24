"use client";

import { useState, useEffect } from "react";
import type { PartnerStatsResult } from "@/lib/partner-stats";
import { requestPayout } from "@/app/actions/partner-payout";

const MIN_WITHDRAW = 10000;

export default function PartnerWallet({ stats }: { stats: PartnerStatsResult }) {
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [optimisticBalance, setOptimisticBalance] = useState(stats.availableBalance);
  const [optimisticReserved, setOptimisticReserved] = useState(stats.reservedBalance);
  const [optimisticHistory, setOptimisticHistory] = useState<(typeof stats.payoutHistory[0] & { confirmed?: boolean })[]>(stats.payoutHistory);

  // Sync only when no pending operation in flight
  // Avoids optimistic state being overwritten before server confirms
  useEffect(() => {
    if (isPending) return;
    setOptimisticBalance(stats.availableBalance);
    setOptimisticReserved(stats.reservedBalance);
    setOptimisticHistory(stats.payoutHistory);
  }, [stats.availableBalance, stats.reservedBalance, stats.payoutHistory, isPending]);

  // Auto-prefill to max available
  useEffect(() => {
    if (!amount && optimisticBalance > 0) {
      setAmount(Math.floor(optimisticBalance).toString());
    }
  }, [optimisticBalance]);

  const normalizeAmount = (input: string) => {
    if (!input) return 0;
    const normalized = input.replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized) || 0;
  };

  // Live Validation
  useEffect(() => {
    if (!amount) {
      setError(null);
      return;
    }

    const val = normalizeAmount(amount);

    if (isNaN(val) || val <= 0) {
      setError("Monto inválido");
    } else if (val < MIN_WITHDRAW) {
      setError(`Mínimo $${MIN_WITHDRAW.toLocaleString("es-AR")}`);
    } else if (val > optimisticBalance) {
      setError("Supera tu saldo");
    } else {
      setError(null);
    }
  }, [amount, optimisticBalance]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    
    // Always floor to integer — consistent with backend Math.floor
    const val = Math.floor(normalizeAmount(amount));
    const isInvalid = !amount || isNaN(val) || val <= 0 || val < MIN_WITHDRAW || val > optimisticBalance;

    if (isInvalid || isPending) return;

    setIsPending(true);
    setError(null);
    
    // Optimistic Update
    const key = crypto.randomUUID();
    const optimisticEntry = {
      id: key,
      amount: val,
      status: "PENDING",
      createdAt: new Date(),
      confirmed: false
    };

    setOptimisticBalance((prev) => prev - val);
    setOptimisticReserved((prev) => prev + val);
    setOptimisticHistory((prev) => [optimisticEntry, ...prev]);

    try {
      await requestPayout(stats.partnerId, val, key);

      // Mark as server-confirmed (not just local optimistic)
      setOptimisticHistory((prev) =>
        prev.map((h) => h.id === key ? { ...h, confirmed: true } : h)
      );
      setIsPending(false);
      setSuccess(true);
      setAmount("");
    } catch (err: any) {
      // Rollback
      setOptimisticBalance((prev) => prev + val);
      setOptimisticReserved((prev) => prev - val);
      setOptimisticHistory((prev) => prev.filter((h) => h.id !== key));
      setSuccess(false);
      setIsPending(false);
      
      // Human-readable, context-aware error messages
      const msg = err?.message ?? "";
      if (msg.includes("disponible")) {
        setError("Tu saldo cambió. Actualizá e intentá de nuevo.");
      } else if (msg.includes("m\u00ednimo") || msg.includes("minimo")) {
        setError("El monto mínimo es $10.000");
      } else if (msg.includes("autorizado")) {
        setError("Sesión expirada. Recargá la página.");
      } else {
        setError("No pudimos procesar el retiro. Intentá nuevamente.");
      }
    }
  };

  const setMaxAmount = () => {
    setError(null);
    setAmount(Math.floor(optimisticBalance).toString());
  };

  return (
    <div className="bento-card wallet-card">
      <div className="wallet-header">
        <h3 className="wallet-title">Tu Billetera</h3>
        <span className="wallet-badge">Retirable</span>
      </div>
      
      <div className="wallet-balance">
        <span className="currency">$</span>
        <span className="amount">{Math.floor(optimisticBalance).toLocaleString("es-AR")}</span>
      </div>
      
      {optimisticReserved > 0 && (
        <div className="pending-box">
          <span className="dot" />
          Ya solicitaste ${Math.round(optimisticReserved).toLocaleString("es-AR")} · En camino
        </div>
      )}

      {optimisticBalance <= 0 && !optimisticReserved && (
        <div className="no-balance">
          Aún no tenés saldo disponible para retirar. ¡Compartí tu link de registro!
        </div>
      )}

      <form className="withdraw-form" onSubmit={handleWithdraw}>
        <div className="input-group">
          <label>Monto a retirar</label>
          <div className="input-wrapper">
            <span className="input-currency">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSuccess(false);
                setError(null);
              }}
              disabled={optimisticBalance < MIN_WITHDRAW || isPending}
              placeholder={`Min $${MIN_WITHDRAW.toLocaleString("es-AR")}`}
            />
            {optimisticBalance > 0 && (
              <button 
                type="button" 
                className="withdraw-all" 
                onClick={setMaxAmount}
                disabled={isPending}
              >
                Retirar todo
              </button>
            )}
          </div>
          {error && <span className="error-text">{error}</span>}
          {optimisticBalance >= MIN_WITHDRAW && (
            <div className="max-hint">
              Máximo disponible: ${Math.floor(optimisticBalance).toLocaleString("es-AR")}
            </div>
          )}
          {optimisticBalance > 0 && optimisticBalance < MIN_WITHDRAW && (
            <div className="max-hint" style={{ color: '#ff5e3a' }}>
              Necesitás al menos ${MIN_WITHDRAW.toLocaleString("es-AR")} para retirar.
            </div>
          )}
        </div>

        {isPending && !success ? (
          <div className="pending-banner">
            <span className="dot" /> Retiro en proceso...
          </div>
        ) : success ? (
          <div className="success-banner">
            Solicitud enviada correctamente 🚀
          </div>
        ) : (
          <button 
            type="submit" 
            className="withdraw-btn"
            disabled={!!error || isPending || !amount}
          >
            {amount && !isNaN(normalizeAmount(amount)) && optimisticBalance >= MIN_WITHDRAW ? `Retirar $${normalizeAmount(amount).toLocaleString("es-AR")}` : "Solicitar Retiro"}
          </button>
        )}
      </form>
      
      <div className="lifetime">
        Total generado histórico: <strong>${Math.round(stats.totalEarnedForever).toLocaleString("es-AR")}</strong>
      </div>

      {optimisticHistory.length > 0 && (
        <div className="history-section">
          <h4 className="history-title">Historial de retiros</h4>
          <ul className="history-list">
            {optimisticHistory.map((item) => (
              <li key={item.id} className="history-item">
                <div className="history-amount">${Math.round(item.amount).toLocaleString("es-AR")}</div>
                {item.status === "PAID" ? (
                  <span className="badge-paid">Pagado</span>
                ) : item.status === "APPROVED" ? (
                  <span className="badge-pending">Aprobado</span>
                ) : !item.confirmed ? (
                  <span className="badge-syncing">Sincronizando...</span>
                ) : (
                  <span className="badge-pending">En proceso</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        .wallet-card {
          background: linear-gradient(180deg, var(--surface) 0%, rgba(0,0,0,0.4) 100%);
          border-color: rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
        }

        .wallet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .wallet-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .wallet-badge {
          background: rgba(34, 217, 138, 0.15);
          color: #22d98a;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .wallet-balance {
          display: flex;
          align-items: flex-start;
          margin-bottom: 24px;
          color: var(--text);
        }

        .currency {
          font-size: 20px;
          font-weight: 700;
          margin-top: 6px;
          margin-right: 4px;
          color: var(--text-2);
        }

        .amount {
          font-size: 42px;
          font-weight: 800;
          letter-spacing: -0.03em;
          font-family: 'Bricolage Grotesque', sans-serif;
        }

        .pending-box {
          background: rgba(245, 166, 35, 0.1);
          border: 1px solid rgba(245, 166, 35, 0.2);
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          color: #f5a623;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 24px;
        }
        
        .no-balance {
          background: rgba(255, 255, 255, 0.05);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 12px;
          color: var(--text-3);
          margin-bottom: 24px;
        }

        .dot {
          width: 6px;
          height: 6px;
          background: #f5a623;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(245, 166, 35, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 166, 35, 0); }
        }

        .withdraw-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: auto;
        }

        .input-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-3);
          margin-bottom: 8px;
          display: block;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-currency {
          position: absolute;
          left: 14px;
          font-weight: 700;
          color: var(--text-2);
          pointer-events: none;
        }

        input {
          width: 100%;
          background: rgba(0,0,0,0.2);
          border: 1px solid var(--border);
          color: var(--text);
          font-size: 16px;
          font-weight: 600;
          padding: 12px 90px 12px 30px;
          border-radius: 8px;
          transition: border-color 0.2s;
        }

        input:focus {
          outline: none;
          border-color: #22d98a;
          box-shadow: 0 0 0 3px rgba(34, 217, 138, 0.1);
        }

        input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .withdraw-all {
          position: absolute;
          right: 8px;
          background: rgba(255,255,255,0.1);
          border: none;
          color: var(--text);
          font-size: 11px;
          font-weight: 700;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .withdraw-all:hover:not(:disabled) {
          background: rgba(255,255,255,0.2);
        }

        .error-text {
          color: #ff5e3a;
          font-size: 12px;
          margin-top: 6px;
          display: block;
          font-weight: 600;
        }

        .max-hint {
          color: var(--text-3);
          font-size: 11px;
          margin-top: 6px;
          display: block;
          font-weight: 600;
        }

        .withdraw-btn {
          width: 100%;
          background: #22c55e;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          border: none;
          padding: 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, opacity 0.2s;
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
        }

        .withdraw-btn:hover:not(:disabled) {
          transform: scale(1.02);
          background: #16a34a;
          box-shadow: 0 6px 16px rgba(34, 197, 94, 0.3);
        }

        .withdraw-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .withdraw-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: var(--border);
          box-shadow: none;
        }
        
        .success-banner {
          width: 100%;
          background: rgba(34, 217, 138, 0.15);
          color: #22d98a;
          font-size: 13px;
          font-weight: 700;
          padding: 14px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid rgba(34, 217, 138, 0.3);
          animation: slide-up 0.3s ease;
        }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .pending-banner {
          width: 100%;
          background: rgba(245, 166, 35, 0.15);
          color: #f5a623;
          font-size: 13px;
          font-weight: 700;
          padding: 14px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid rgba(245, 166, 35, 0.3);
          animation: pulse-banner 1.5s infinite ease-in-out;
        }

        @keyframes pulse-banner {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }
        
        .lifetime {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px dashed rgba(255,255,255,0.1);
          text-align: center;
          font-size: 11px;
          color: var(--text-3);
        }

        .lifetime strong {
          color: var(--text);
          font-weight: 700;
          font-size: 12px;
        }

        .history-section {
          margin-top: 24px;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding-top: 20px;
        }

        .history-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-3);
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .history-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 200px;
          overflow-y: auto;
        }

        .history-list::-webkit-scrollbar {
          width: 4px;
        }

        .history-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }

        .history-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: rgba(0,0,0,0.15);
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.03);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-2);
        }

        .badge-paid {
          background: rgba(34, 217, 138, 0.1);
          color: #22d98a;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }

        .badge-pending {
          background: rgba(245, 166, 35, 0.1);
          color: #f5a623;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }

        .badge-syncing {
          background: rgba(148, 163, 184, 0.1);
          color: #94a3b8;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          animation: pulse-banner 1.2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
