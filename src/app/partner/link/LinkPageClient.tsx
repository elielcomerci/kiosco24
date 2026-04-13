"use client";

import { useState } from "react";
import Link from "next/link";

export default function LinkPageClient({
  referralCode,
  referralUrl,
}: {
  referralCode: string;
  referralUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select the text
    }
  };

  return (
    <div className="link-page">
      <div className="link-page__header">
        <Link href="/partner" className="link-page__back">← Volver</Link>
        <h1 className="link-page__title">Tu link de referido</h1>
        <p className="link-page__subtitle">
          Compartí este link con tus contactos. Cuando se registren a través de él,
          quedarán vinculados a tu cuenta como tus clientes.
        </p>
      </div>

      <div className="link-page__card">
        <label className="link-page__label">Tu código</label>
        <div className="link-page__code">{referralCode}</div>

        <label className="link-page__label">URL para compartir</label>
        <div className="link-page__url-row">
          <input
            type="text"
            className="link-page__input"
            value={referralUrl}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            className={`link-page__copy ${copied ? "link-page__copy--done" : ""}`}
            onClick={handleCopy}
          >
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>

        <div className="link-page__hint">
          Cuando alguien visite esa página, verá tu perfil y podrá registrarse
          directamente vinculado a tu cuenta.
        </div>
      </div>

      <style jsx>{`
        .link-page { max-width: 560px; }
        .link-page__header { margin-bottom: 32px; }
        .link-page__back { font-size: 13px; color: var(--text-3, #888); text-decoration: none; display: inline-block; margin-bottom: 12px; }
        .link-page__back:hover { color: var(--text, #eef2f7); }
        .link-page__title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px; }
        .link-page__subtitle { font-size: 14px; color: var(--text-3, #888); line-height: 1.6; max-width: 480px; }

        .link-page__card {
          background: var(--surface, #161616); border: 1px solid var(--border, #2a2a2a);
          border-radius: var(--radius-lg, 16px); padding: 28px; display: grid; gap: 16px;
        }
        .link-page__label { font-size: 11px; color: var(--text-3, #888); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
        .link-page__code {
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 24px; font-weight: 500;
          color: var(--primary, #f5a623); padding: 12px 16px; background: var(--surface-2, #1e1e1e);
          border: 1px solid var(--border, #2a2a2a); border-radius: 10px; text-align: center;
        }
        .link-page__url-row { display: flex; gap: 8px; }
        .link-page__input {
          flex: 1; padding: 10px 14px; font-size: 13px; font-family: 'DM Mono', ui-monospace, monospace;
          background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #2a2a2a);
          border-radius: 8px; color: var(--text, #eef2f7); outline: none;
        }
        .link-page__input:focus { border-color: var(--primary, #f5a623); }
        .link-page__copy {
          padding: 10px 20px; font-size: 13px; font-weight: 700; border: none; border-radius: 8px;
          background: var(--primary, #f5a623); color: #1a0f00; cursor: pointer; white-space: nowrap;
          transition: all .15s;
        }
        .link-page__copy:hover { opacity: .85; }
        .link-page__copy--done { background: #22d98a !important; }
        .link-page__hint { font-size: 12px; color: var(--text-3, #555); line-height: 1.6; }
      `}</style>
    </div>
  );
}
