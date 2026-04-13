"use client";

import { useState } from "react";
import { saveBankingInfo } from "@/app/actions/partner-banking";

interface BankingInfo {
  bankAlias: string | null;
  bankCbu: string | null;
  bankAccountHolder: string | null;
}

export default function PartnerBankingForm({ current }: { current: BankingInfo }) {
  const [alias, setAlias] = useState(current.bankAlias ?? "");
  const [cbu, setCbu] = useState(current.bankCbu ?? "");
  const [holder, setHolder] = useState(current.bankAccountHolder ?? "");
  const [isPending, setIsPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInfo = !!(current.bankAlias || current.bankCbu);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsPending(true);

    try {
      await saveBankingInfo({ bankAlias: alias, bankCbu: cbu, bankAccountHolder: holder });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message ?? "Error al guardar. Intentá de nuevo.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="banking-card">
      <div className="banking-header">
        <div>
          <h3 className="banking-title">Datos bancarios</h3>
          <p className="banking-subtitle">
            Necesitamos estos datos para procesar tus retiros.
          </p>
        </div>
        {hasInfo && (
          <span className="banking-badge">✓ Configurado</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="banking-form">
        <div className="banking-field">
          <label className="banking-label">Titular de la cuenta *</label>
          <input
            className="banking-input"
            type="text"
            value={holder}
            onChange={(e) => { setHolder(e.target.value); setSuccess(false); }}
            placeholder="Nombre y apellido o razón social"
            disabled={isPending}
          />
        </div>

        <div className="banking-row">
          <div className="banking-field">
            <label className="banking-label">Alias</label>
            <input
              className="banking-input"
              type="text"
              value={alias}
              onChange={(e) => { setAlias(e.target.value.toLowerCase()); setSuccess(false); }}
              placeholder="mi.alias.mp"
              disabled={isPending}
            />
          </div>
          <div className="banking-field">
            <label className="banking-label">CBU / CVU</label>
            <input
              className="banking-input"
              type="text"
              inputMode="numeric"
              value={cbu}
              onChange={(e) => { setCbu(e.target.value.replace(/\D/g, "")); setSuccess(false); }}
              placeholder="22 dígitos"
              maxLength={22}
              disabled={isPending}
            />
          </div>
        </div>

        <p className="banking-hint">
          Con alias o CBU es suficiente. El CBU tiene 22 dígitos exactos.
        </p>

        {error && <div className="banking-error">{error}</div>}

        {success ? (
          <div className="banking-success">✓ Datos guardados correctamente</div>
        ) : (
          <button type="submit" className="banking-btn" disabled={isPending || !holder.trim()}>
            {isPending ? "Guardando..." : "Guardar datos bancarios"}
          </button>
        )}
      </form>

      <style jsx>{`
        .banking-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 24px;
        }

        .banking-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .banking-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 4px;
        }

        .banking-subtitle {
          font-size: 12px;
          color: var(--text-3);
        }

        .banking-badge {
          background: rgba(34, 217, 138, 0.12);
          color: #22d98a;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(34, 217, 138, 0.25);
          white-space: nowrap;
        }

        .banking-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .banking-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 500px) {
          .banking-row { grid-template-columns: 1fr; }
        }

        .banking-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .banking-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .banking-input {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 14px;
          padding: 10px 14px;
          width: 100%;
          transition: border-color 0.15s;
          font-family: inherit;
        }

        .banking-input:focus {
          outline: none;
          border-color: rgba(255,255,255,0.25);
        }

        .banking-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .banking-hint {
          font-size: 11px;
          color: var(--text-3);
          margin: -4px 0;
        }

        .banking-error {
          background: rgba(248, 113, 113, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.25);
          color: #f87171;
          font-size: 12px;
          font-weight: 600;
          padding: 10px 14px;
          border-radius: 8px;
        }

        .banking-success {
          background: rgba(34, 217, 138, 0.1);
          border: 1px solid rgba(34, 217, 138, 0.25);
          color: #22d98a;
          font-size: 13px;
          font-weight: 700;
          padding: 12px 14px;
          border-radius: 8px;
          text-align: center;
        }

        .banking-btn {
          background: var(--primary);
          color: #000;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          padding: 12px 20px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }

        .banking-btn:hover:not(:disabled) { opacity: 0.85; }
        .banking-btn:active:not(:disabled) { transform: scale(0.98); }
        .banking-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
