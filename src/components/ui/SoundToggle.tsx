"use client";

import { useEffect, useState } from "react";

import { isSoundEnabled, toggleSound } from "@/lib/audio";
import { LEGACY_SOUND_TOGGLE_EVENT, SOUND_TOGGLE_EVENT } from "@/lib/brand";

export default function SoundToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());

    const handleToggle = (event: CustomEvent<boolean>) => {
      setEnabled(Boolean(event.detail));
    };

    window.addEventListener(
      SOUND_TOGGLE_EVENT,
      handleToggle as EventListener,
    );
    window.addEventListener(
      LEGACY_SOUND_TOGGLE_EVENT,
      handleToggle as EventListener,
    );

    return () => {
      window.removeEventListener(
        SOUND_TOGGLE_EVENT,
        handleToggle as EventListener,
      );
      window.removeEventListener(
        LEGACY_SOUND_TOGGLE_EVENT,
        handleToggle as EventListener,
      );
    };
  }, []);

  const handleClick = () => {
    const nextValue = toggleSound();
    setEnabled(nextValue);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="app-header-icon-link app-header-icon-button"
      title={enabled ? "Desactivar sonido" : "Activar sonido"}
      aria-label={enabled ? "Desactivar sonido" : "Activar sonido"}
      style={{
        opacity: enabled ? 1 : 0.5,
        transition: "opacity 0.2s",
      }}
    >
      {enabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
    </button>
  );
}
