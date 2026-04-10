"use client";

import { useEffect, useRef, useState } from "react";
import { playAudio } from "@/lib/audio";
import { useKeypadLock } from "@/lib/keypad-lock";
import ModalPortal from "@/components/ui/ModalPortal";

interface PinModalProps {
  title?: string;
  subtitle?: string;
  onConfirm: (pin: string) => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export default function PinModal({
  title = "Ingresá tu PIN",
  subtitle,
  onConfirm,
  onCancel,
  loading = false,
  error = null,
}: PinModalProps) {
  const [pin, setPin] = useState("");
  const prevErrorRef = useRef(error);
  useKeypadLock(); // Bloquea el handler global de búsqueda mientras este modal está abierto

  // Auto-borrar PIN cuando el padre señala un error nuevo
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      setPin("");
    }
    prevErrorRef.current = error;
  }, [error]);

  const handleKey = (digit: string) => {
    void playAudio("/tap.wav", 0.4);
    if (pin.length < 6) setPin((p) => p + digit);
  };

  const handleBackspace = () => {
    void playAudio("/tap.wav", 0.4);
    setPin((p) => p.slice(0, -1));
  };

  const handleConfirm = async () => {
    if (pin.length === 0 || loading) return;
    await onConfirm(pin);
  };

  // Soporte de teclado físico
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (loading || e.ctrlKey || e.metaKey || e.altKey) return;

      const isDigit = /^[0-9]$/.test(e.key);
      const isNumpadDigit = e.code && e.code.startsWith("Numpad") && e.code.length === 7 && /^[0-9]$/.test(e.code[6]);

      if (isDigit || isNumpadDigit) {
        e.preventDefault();
        e.stopPropagation();
        handleKey(isDigit ? e.key : e.code[6]);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        handleBackspace();
      } else if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, loading]);

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);


  return (
    <ModalPortal>
      <div
        className="modal-overlay animate-fade-in"
        onClick={onCancel}
        style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div
          className="modal animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "360px",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
          }}
        >
        {/* Lock icon + title */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "8px" }}>🔐</div>
          <h2 style={{ fontSize: "20px", fontWeight: 800 }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>{subtitle}</p>
          )}
        </div>

        {/* PIN dots */}
        <div style={{ display: "flex", gap: "12px" }}>
          {dots.map((filled, i) => (
            <div
              key={i}
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: filled ? "var(--primary)" : "var(--border)",
                transition: "background 0.15s",
              }}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div style={{ color: "var(--red)", fontSize: "14px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        {/* Numeric keypad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", width: "100%" }}>
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => handleKey(d)}
              style={{
                padding: "16px",
                fontSize: "22px",
                fontWeight: 700,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                color: "var(--text)",
                transition: "background 0.1s",
              }}
            >
              {d}
            </button>
          ))}
          <button
            onClick={onCancel}
            style={{
              padding: "16px",
              fontSize: "14px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-3)",
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => handleKey("0")}
            style={{
              padding: "16px",
              fontSize: "22px",
              fontWeight: 700,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              color: "var(--text)",
            }}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            style={{
              padding: "16px",
              fontSize: "20px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-3)",
            }}
          >
            ⌫
          </button>
        </div>

        {/* Confirm */}
        <button
          className="btn btn-green"
          style={{ width: "100%" }}
          onClick={handleConfirm}
          disabled={pin.length === 0 || loading}
        >
          {loading ? "Verificando..." : "Confirmar"}
        </button>
        </div>
      </div>
    </ModalPortal>
  );
}
