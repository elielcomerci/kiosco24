"use client";

import ModalPortal from "@/components/ui/ModalPortal";
import { formatSubscriptionPrice } from "@/lib/subscription-plan";

type Props = {
  priceArs: number;
  freezeEndsAt: string | null;
  loading: boolean;
  error: string;
  onActivate: () => void;
  onSkip: () => void;
};

function formatFreezeDate(value: string | null) {
  if (!value) {
    return "los proximos 2 años";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "los proximos 2 años";
  }

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export default function WelcomeSubscriptionOfferModal({
  priceArs,
  freezeEndsAt,
  loading,
  error,
  onActivate,
  onSkip,
}: Props) {
  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in">
        <div
          className="modal animate-slide-up"
          style={{ maxWidth: "540px", width: "min(540px, calc(100vw - 24px))", padding: "28px" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(34,197,94,.12)",
                  border: "1px solid rgba(34,197,94,.22)",
                  color: "#bbf7d0",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                Oferta de bienvenida
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "28px", lineHeight: 1.08, fontWeight: 900 }}>
                  Activá tu suscripción con precio congelado.
                </h2>
                <p style={{ margin: "10px 0 0", color: "var(--text-2)", lineHeight: 1.6, fontSize: "15px" }}>
                  Ya podés dejar tu negocio activo desde ahora o seguir preparando stock y catálogo antes de empezar a operar.
                </p>
              </div>
            </div>

            <div
              style={{
                padding: "18px",
                borderRadius: "18px",
                background: "linear-gradient(160deg, rgba(21,128,61,.18) 0%, rgba(15,23,42,.8) 100%)",
                border: "1px solid rgba(34,197,94,.22)",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: ".08em", color: "#bbf7d0", fontWeight: 800 }}>
                Clikit para nuevos negocios
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "34px", fontWeight: 900, color: "#f8fafc" }}>
                  {formatSubscriptionPrice(priceArs)}
                </span>
                <span style={{ color: "#cbd5e1", fontSize: "14px" }}>por mes</span>
              </div>
              <div style={{ color: "#dcfce7", fontSize: "14px", lineHeight: 1.6 }}>
                Conservás este valor hasta {formatFreezeDate(freezeEndsAt)} si activás tu cuenta con esta propuesta de bienvenida.
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", color: "var(--text-2)", fontSize: "14px", lineHeight: 1.5 }}>
              <div>Vas a poder vender, cobrar, dejar recordatorios y usar la operación completa sin interrupciones.</div>
              <div>Si preferís, podés seguir preparando productos, precios y stock antes de activarla.</div>
            </div>

            {error ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "rgba(239,68,68,.12)",
                  border: "1px solid rgba(239,68,68,.24)",
                  color: "#fecaca",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={onActivate}
                disabled={loading}
                style={{ width: "100%" }}
              >
                {loading ? "Abriendo Mercado Pago..." : "Activar suscripción ahora"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onSkip}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Seguir preparando mi negocio
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
