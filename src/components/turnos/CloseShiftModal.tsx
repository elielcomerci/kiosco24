"use client";

import { useState } from "react";
import NumPad from "@/components/ui/NumPad";
import { formatARS } from "@/lib/utils";

interface ShiftSummary {
  openingAmount: number;
  ventasEfectivo: number;
  gastos: number;
  retiros: number;
  expectedAmount: number;
}

interface CloseShiftModalProps {
  onConfirm: (amount: number, note: string) => void;
  onCancel: () => void;
  summary?: ShiftSummary;
}

export default function CloseShiftModal({ onConfirm, onCancel, summary }: CloseShiftModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    await onConfirm(parseFloat(amount), note);
    setLoading(false);
  };

  // Real-time difference
  const parsed = parseFloat(amount);
  const expected = summary?.expectedAmount ?? null;
  const difference = expected !== null && !isNaN(parsed) ? parsed - expected : null;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onCancel}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--red)" }}>Cerrar Turno</h2>
          <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
            Contá el efectivo del cajón e ingresá el monto.
          </p>
        </div>

        {/* Shift summary panel */}
        {summary && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "12px 14px",
              marginBottom: "14px",
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 2 }}>
              Resumen del turno
            </div>
            <Row label="Apertura" value={formatARS(summary.openingAmount)} />
            {summary.ventasEfectivo > 0 && (
              <Row label="+ Ventas efectivo" value={formatARS(summary.ventasEfectivo)} color="var(--green)" />
            )}
            {summary.gastos > 0 && (
              <Row label="− Gastos" value={formatARS(summary.gastos)} color="var(--red)" />
            )}
            {summary.retiros > 0 && (
              <Row label="− Retiros" value={formatARS(summary.retiros)} color="var(--red)" />
            )}
            <div
              style={{
                borderTop: "1px dashed var(--border)",
                paddingTop: 6,
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
              }}
            >
              <span>Esperado en caja</span>
              <span style={{ color: "var(--primary)", fontSize: 15 }}>
                {formatARS(summary.expectedAmount)}
              </span>
            </div>
          </div>
        )}

        {/* Amount input */}
        <div
          style={{
            background: "var(--surface-2)",
            border: `1px solid ${
              difference !== null
                ? difference < 0
                  ? "rgba(239,68,68,0.4)"
                  : difference > 0
                  ? "rgba(34,197,94,0.4)"
                  : "rgba(34,197,94,0.4)"
                : "var(--border-2)"
            }`,
            borderRadius: "var(--radius)",
            padding: "16px",
            textAlign: "center",
            fontSize: "32px",
            fontWeight: 800,
            color: amount ? "var(--text)" : "var(--text-3)",
            minHeight: "56px",
            marginBottom: "12px",
            transition: "border-color 0.2s",
          }}
        >
          {amount ? `$ ${amount}` : "Efectivo en caja"}
        </div>

        {/* Real-time difference indicator */}
        {difference !== null && (
          <div
            style={{
              textAlign: "center",
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 8,
              color:
                difference === 0
                  ? "var(--green)"
                  : difference < 0
                  ? "var(--red)"
                  : "var(--green)",
            }}
          >
            {difference === 0
              ? "✓ Caja exacta"
              : difference < 0
              ? `⚠️ Faltante: ${formatARS(Math.abs(difference))}`
              : `✓ Sobrante: +${formatARS(difference)}`}
          </div>
        )}

        <NumPad value={amount} onChange={setAmount} />

        <input
          className="input"
          placeholder="Nota opcional (ej. Faltan $500 de cambio)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: "12px" }}
        />

        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn btn-red"
            style={{ flex: 2 }}
            onClick={handleConfirm}
            disabled={!amount || loading}
          >
            {loading ? "Cerrando..." : "Confirmar Cierre"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || "var(--text)" }}>{value}</span>
    </div>
  );
}
