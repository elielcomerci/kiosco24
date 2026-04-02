"use client";

import { useEffect, useState } from "react";
import { formatTrialTime, getTrialMessage } from "@/lib/trial-manager";

interface TrialWelcomeModalProps {
  remainingHours: number;
  onExplore: () => void;
  onActivate: () => void;
}

export default function TrialWelcomeModal({
  remainingHours,
  onExplore,
  onActivate,
}: TrialWelcomeModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const { title, description } = getTrialMessage(remainingHours);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 9999,
      }}
      onClick={onExplore}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "24px",
          padding: "32px",
          width: "100%",
          maxWidth: "480px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          boxShadow: "0 24px 50px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icono */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, var(--primary) 0%, rgba(34,197,94,0.5) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            margin: "0 auto",
          }}
        >
          🎉
        </div>

        {/* Título */}
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 800,
              margin: "0 0 8px",
              color: "var(--text)",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-2)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {description}
          </p>
        </div>

        {/* Tiempo restante */}
        <div
          style={{
            padding: "16px",
            background: "var(--surface-2)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            Tiempo restante
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "var(--primary)",
            }}
          >
            {formatTrialTime(remainingHours)}
          </div>
        </div>

        {/* Beneficios */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "16px",
            background: "rgba(34,197,94,0.05)",
            borderRadius: "12px",
            border: "1px solid rgba(34,197,94,0.1)",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>✅</span> Ventas ilimitadas
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>✅</span> Control de stock
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>✅</span> Reportes y estadísticas
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>✅</span> Múltiples sucursales
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            className="btn btn-primary btn-full"
            onClick={onActivate}
            style={{ padding: "14px", fontSize: "15px" }}
          >
            Activar suscripción ahora
          </button>
          <button
            className="btn btn-ghost btn-full"
            onClick={onExplore}
            style={{ padding: "14px", fontSize: "15px", border: "1px solid var(--border)" }}
          >
            Explorar el sistema
          </button>
        </div>

        {/* Nota */}
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-3)",
            textAlign: "center",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Podés usar todas las funciones durante tu período de prueba. 
          Cuando estés listo, activás tu suscripción y listo.
        </p>
      </div>
    </div>
  );
}
