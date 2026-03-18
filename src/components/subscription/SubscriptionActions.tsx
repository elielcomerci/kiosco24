"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  canCreateSubscription: boolean;
  managementUrl: string | null;
};

export default function SubscriptionActions({
  canCreateSubscription,
  managementUrl,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStartSubscription = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/subscription/create", { method: "POST" });
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
      {canCreateSubscription && (
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={handleStartSubscription}
          disabled={loading}
          style={{ width: "100%" }}
        >
          {loading ? "Generando link..." : "Activar suscripcion"}
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
