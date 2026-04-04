"use client";

import ModalPortal from "@/components/ui/ModalPortal";

type Props = {
  message: string;
  loading: boolean;
  error: string;
  onActivate: () => void;
  onClose: () => void;
};

export default function OperationalSubscriptionModal({
  message,
  loading,
  error,
  onActivate,
  onClose,
}: Props) {
  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div
          className="modal animate-slide-up"
          style={{ maxWidth: "480px", width: "min(480px, calc(100vw - 24px))", padding: "24px" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(59,130,246,.12)",
                  border: "1px solid rgba(59,130,246,.22)",
                  color: "#bfdbfe",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                Activá la operación
              </div>
              <h2 style={{ margin: 0, fontSize: "24px", lineHeight: 1.1, fontWeight: 900 }}>
                Ya tenés todo listo para empezar a trabajar.
              </h2>
              <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6, fontSize: "15px" }}>
                {message}
              </p>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: "16px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              Podés generar tu link de pago ahora mismo y terminar la activación en Mercado Pago sin perder nada de lo que ya preparaste.
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
                {loading ? "Generando link..." : "Generar link y activar suscripción"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Después lo veo
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
