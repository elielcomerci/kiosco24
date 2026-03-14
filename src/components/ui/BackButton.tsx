"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ fallback }: { fallback?: string }) {
  const router = useRouter();

  const handleBack = () => {
    // Si hay historial, volver atrás. Si no, ir a la ruta fallback o caja
    if (window.history.length > 1) {
      router.back();
    } else if (fallback) {
      router.push(fallback);
    }
  };

  return (
    <button
      onClick={handleBack}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text-2)",
        fontSize: "16px",
        padding: "4px 8px",
        borderRadius: "8px",
        fontWeight: 600,
        lineHeight: 1,
      }}
      title="Volver"
    >
      ‹ Volver
    </button>
  );
}
