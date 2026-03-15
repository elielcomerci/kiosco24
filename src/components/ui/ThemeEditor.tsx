"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Theme Presets ─────────────────────────────────────────────────────────
const PRESETS = [
  { name: "Bosque verde",   bg: "#0d1f14", accent: "#22c55e" },
  { name: "Océano azul",    bg: "#0d1b2a", accent: "#3b82f6" },
  { name: "Noche naranja",  bg: "#1a0e04", accent: "#f97316" },
  { name: "Galaxia",        bg: "#120a24", accent: "#a855f7" },
  { name: "Ámbar noche",    bg: "#1c1300", accent: "#f59e0b" },
  { name: "Clásico negro",  bg: "#0a0a0a", accent: "#f1f5f9" },
];

// Helpers
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function applyThemeToDOM(bg: string, accent: string) {
  const root = document.documentElement;
  root.style.setProperty("--bg", bg);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-rgb", hexToRgb(accent));
  root.style.setProperty("--primary-dim", accent + "CC");
}

// ─── Component ─────────────────────────────────────────────────────────────
interface ThemeEditorProps {
  branchId: string;
  initialBg: string;
  initialAccent: string;
  onSaved: () => void;
}

export default function ThemeEditor({ branchId, initialBg, initialAccent, onSaved }: ThemeEditorProps) {
  const [bg, setBg] = useState(initialBg || "#0f172a");
  const [accent, setAccent] = useState(initialAccent || "#22c55e");
  const [saving, setSaving] = useState(false);

  // Apply immediately on mount to keep in sync
  useEffect(() => {
    applyThemeToDOM(bg, accent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBgChange = useCallback((val: string) => {
    setBg(val);
    applyThemeToDOM(val, accent);
  }, [accent]);

  const handleAccentChange = useCallback((val: string) => {
    setAccent(val);
    applyThemeToDOM(bg, val);
  }, [bg]);

  const handlePreset = useCallback((preset: typeof PRESETS[0]) => {
    setBg(preset.bg);
    setAccent(preset.accent);
    applyThemeToDOM(preset.bg, preset.accent);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/branches/${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bgColor: bg, primaryColor: accent }),
    });
    setSaving(false);
    onSaved();
  };

  const BG_SWATCHES = [
    "#0a0a0a", "#0f172a", "#0d1b2a", "#0d1f14",
    "#120a24", "#1c1300", "#1a0e04", "#1a1a2e",
  ];

  const ACCENT_SWATCHES = [
    "#22c55e", "#3b82f6", "#f97316", "#a855f7",
    "#f59e0b", "#ef4444", "#ec4899", "#f1f5f9",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* FONDO */}
      <div>
        <div className="section-title">Fondo del sistema</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          {BG_SWATCHES.map((color) => (
            <button
              key={color}
              onClick={() => handleBgChange(color)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: color,
                border: bg === color ? "2px solid var(--primary)" : "2px solid var(--border-2)",
                cursor: "pointer",
                transition: "transform 0.1s",
                transform: bg === color ? "scale(1.15)" : "scale(1)",
              }}
              title={color}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="color"
            value={bg}
            onChange={(e) => handleBgChange(e.target.value)}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              border: "1px solid var(--border-2)",
              cursor: "pointer",
              background: "none",
              padding: "2px",
            }}
          />
          <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "monospace" }}>{bg}</span>
        </div>
      </div>

      {/* ACENTO */}
      <div>
        <div className="section-title">Color de acento</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          {ACCENT_SWATCHES.map((color) => (
            <button
              key={color}
              onClick={() => handleAccentChange(color)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: color,
                border: accent === color ? "2px solid white" : "2px solid var(--border-2)",
                cursor: "pointer",
                transition: "transform 0.1s",
                transform: accent === color ? "scale(1.15)" : "scale(1)",
              }}
              title={color}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="color"
            value={accent}
            onChange={(e) => handleAccentChange(e.target.value)}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              border: "1px solid var(--border-2)",
              cursor: "pointer",
              background: "none",
              padding: "2px",
            }}
          />
          <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "monospace" }}>{accent}</span>
        </div>
      </div>

      {/* PRESETS */}
      <div>
        <div className="section-title">Combinaciones</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {PRESETS.map((preset) => {
            const isActive = bg === preset.bg && accent === preset.accent;
            return (
              <button
                key={preset.name}
                onClick={() => handlePreset(preset)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  background: isActive ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)",
                  border: isActive ? "1px solid var(--primary)" : "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s",
                }}
              >
                {/* Color preview circle */}
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: preset.bg,
                  border: `3px solid ${preset.accent}`,
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)" }}>
                  {preset.name}
                </span>
                {isActive && (
                  <span style={{ marginLeft: "auto", color: "var(--primary)", fontSize: "16px" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SAVE */}
      <button
        className="btn btn-green"
        onClick={handleSave}
        disabled={saving}
        style={{ width: "100%" }}
      >
        {saving ? "Guardando..." : "Aplicar tema"}
      </button>
    </div>
  );
}
