"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PRICE_ARS,
  formatSubscriptionPrice,
  getSubscriptionPromoLabel,
} from "@/lib/subscription-plan";

type Props = {
  canCreateSubscription: boolean;
  managementUrl: string | null;
  priceArs?: number;
  compareAtPriceArs?: number | null;
  origin?: string;
};

export default function SubscriptionActions({
  canCreateSubscription,
  managementUrl,
  priceArs = SUBSCRIPTION_PRICE_ARS,
  compareAtPriceArs = null,
  origin = "SUBSCRIPTION_PAGE",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasSpecialPrice =
    typeof compareAtPriceArs === "number" &&
    Number.isFinite(compareAtPriceArs) &&
    compareAtPriceArs > priceArs;
  const effectivePriceLabel = formatSubscriptionPrice(priceArs);

  const handleStartSubscription = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
      });
      const data = await response.json();

      if (!response.ok || !data?.init_point) {
        setError(data?.error || "No se pudo generar el link de activacion.");
        setLoading(false);
        return;
      }

      window.location.href = data.init_point;
    } catch {
      setError("No se pudo conectar con el sistema de suscripciones.");
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/subscription/status", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "No se pudo actualizar el estado de la suscripcion.");
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError("No se pudo verificar el estado de la suscripcion.");
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: "12px",
          background: "rgba(34,197,94,.1)",
          border: "1px solid rgba(34,197,94,.18)",
          color: "var(--text-2)",
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        {hasSpecialPrice ? (
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ color: "var(--green)" }}>Precio disponible para esta cuenta</strong>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ textDecoration: "line-through", opacity: 0.7 }}>
                {formatSubscriptionPrice(compareAtPriceArs)}
              </span>
              <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--green)" }}>
                {formatSubscriptionPrice(priceArs)}
              </span>
            </div>
            <span>{SUBSCRIPTION_CANCEL_LABEL}</span>
          </div>
        ) : (
          `${getSubscriptionPromoLabel(priceArs)} ${SUBSCRIPTION_CANCEL_LABEL}`
        )}
      </div>

      {canCreateSubscription && (
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={handleStartSubscription}
          disabled={loading}
          style={{ width: "100%" }}
        >
          {loading ? "Generando link..." : `Continuar por ${effectivePriceLabel} en Mercado Pago`}
        </button>
      )}

      {managementUrl && (
        <a
          href={managementUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-lg"
          style={{ width: "100%", textDecoration: "none", textAlign: "center" }}
        >
          Gestionar suscripcion
        </a>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: "100%" }}
        onClick={handleRefreshStatus}
        disabled={loading}
      >
        {loading ? "Actualizando..." : "Actualizar estado"}
      </button>

      {error && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.28)",
            color: "#fecaca",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
