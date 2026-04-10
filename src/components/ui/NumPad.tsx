"use client";

import { useEffect, useCallback } from "react";
import { playAudio } from "@/lib/audio";

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
}

export default function NumPad({ value, onChange }: NumPadProps) {
  const handle = useCallback((key: string) => {
    void playAudio("/tap.wav", 0.4);
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === "000") {
      onChange(value + "000");
    } else {
      // Don't add more digits than needed
      const next = value + key;
      if (next.length <= 8) onChange(next);
    }
  }, [value, onChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA" || activeEl?.tagName === "SELECT") {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isDigit = /^[0-9]$/.test(e.key);
      const isNumpadDigit = e.code && e.code.startsWith("Numpad") && e.code.length === 7 && /^[0-9]$/.test(e.code[6]);
      
      if (isDigit || isNumpadDigit) {
        e.preventDefault();
        e.stopPropagation();
        handle(isDigit ? e.key : e.code[6]);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        handle("⌫");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handle]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"];

  return (
    <div className="numpad">
      {keys.map((key) => (
        <button
          key={key}
          className="numpad-key"
          onClick={() => handle(key)}
          style={
            key === "⌫"
              ? { color: "var(--red)", fontSize: "20px" }
              : key === "000"
              ? { color: "var(--text-2)", fontSize: "16px" }
              : undefined
          }
        >
          {key}
        </button>
      ))}
    </div>
  );
}
