"use client";

import { useEffect, useState } from "react";
import { isSoundEnabled, toggleSound } from "@/lib/audio";

export default function SoundToggle() {
  const [enabled, setEnabled] = useState(true);

  // Sync state on mount and via custom events
  useEffect(() => {
    setEnabled(isSoundEnabled());

    const handleToggle = (e: any) => {
      setEnabled(e.detail);
    };

    window.addEventListener("kiosco24_sound_toggle", handleToggle);
    return () => window.removeEventListener("kiosco24_sound_toggle", handleToggle);
  }, []);

  const handleToggle = () => {
    const nextValue = toggleSound();
    setEnabled(nextValue);
  };

  return (
    <button
      onClick={handleToggle}
      className="app-header-icon-link" // Reuse same style as other header icons
      title={enabled ? "Desactivar sonido" : "Activar sonido"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "16px",
        padding: "0 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: enabled ? 1 : 0.5,
        transition: "opacity 0.2s"
      }}
    >
      {enabled ? "🔊" : "🔇"}
    </button>
  );
}
