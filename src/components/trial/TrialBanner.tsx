"use client";

import { formatTrialTime, getTrialMessage } from "@/lib/trial-manager";

interface TrialBannerProps {
  remainingHours: number;
  onActivate: () => void;
  onDismiss: () => void;
}

export default function TrialBanner({
  remainingHours,
  onActivate,
  onDismiss,
}: TrialBannerProps) {
  const { urgency } = getTrialMessage(remainingHours);
  
  const bgColor = urgency === "high" 
    ? "rgba(239, 68, 68, 0.1)" 
    : urgency === "medium"
    ? "rgba(245, 158, 11, 0.1)"
    : "rgba(34, 197, 94, 0.1)";
  
  const borderColor = urgency === "high"
    ? "rgba(239, 68, 68, 0.3)"
    : urgency === "medium"
    ? "rgba(245, 158, 11, 0.3)"
    : "rgba(34, 197, 94, 0.3)";
  
  const textColor = urgency === "high"
    ? "#fca5a5"
    : urgency === "medium"
    ? "#fcd34d"
    : "#86efac";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderBottomLeftRadius: "12px",
        borderBottomRightRadius: "12px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
        <span style={{ fontSize: "18px" }}>⏰</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: textColor,
              marginBottom: "2px",
            }}
          >
            Período de prueba: {formatTrialTime(remainingHours)} restantes
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-3)",
            }}
          >
            Activá tu suscripción para no perder tus datos
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          className="btn btn-sm btn-primary"
          onClick={onActivate}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          Activar
        </button>
        {urgency !== "high" && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={onDismiss}
            style={{
              padding: "8px",
              color: "var(--text-3)",
              fontSize: "18px",
            }}
            title="Ocultar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
