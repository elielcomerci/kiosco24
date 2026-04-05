"use client";

import { type DiffRow } from "@/lib/platform-diff";

export default function ProductDiffTable({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ 
        padding: "12px 14px", 
        borderRadius: "14px", 
        background: "rgba(34,197,94,.08)", 
        border: "1px solid rgba(34,197,94,.18)",
        color: "#86efac",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Sin cambios respecto a la ficha base.
      </div>
    );
  }

  return (
    <div style={{ 
      display: "grid", 
      gap: "1px", 
      background: "rgba(148,163,184,.12)", 
      border: "1px solid rgba(148,163,184,.12)", 
      borderRadius: "16px",
      overflow: "hidden"
    }}>
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "120px 1fr 1fr", 
        gap: "1px",
        background: "rgba(15,23,42,.6)",
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: "#94a3b8"
      }}>
        <div style={{ padding: "10px 14px" }}>Campo</div>
        <div style={{ padding: "10px 14px" }}>Actual</div>
        <div style={{ padding: "10px 14px" }}>Nuevo</div>
      </div>
      {rows.map((row) => (
        <div key={row.field} style={{ 
          display: "grid", 
          gridTemplateColumns: "120px 1fr 1fr", 
          gap: "1px",
          background: "rgba(30,41,59,.4)",
          fontSize: "14px"
        }}>
          <div style={{ padding: "12px 14px", color: "#94a3b8", fontWeight: 500, background: "rgba(15,23,42,.2)" }}>
            {row.label}
          </div>
          <div style={{ padding: "12px 14px", color: "#cbd5e1" }}>
            {row.current}
          </div>
          <div style={{ padding: "12px 14px", color: "#f8fafc", fontWeight: 600, background: "rgba(56,189,248,.05)" }}>
            {row.next}
          </div>
        </div>
      ))}
    </div>
  );
}
