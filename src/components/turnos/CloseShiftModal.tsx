"use client";

import { useState } from "react";
import NumPad from "@/components/ui/NumPad";

interface CloseShiftModalProps {
  onConfirm: (amount: number, note: string) => void;
  onCancel: () => void;
}

export default function CloseShiftModal({ onConfirm, onCancel }: CloseShiftModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    await onConfirm(parseFloat(amount), note);
    setLoading(false);
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onCancel}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--red)" }}>Cerrar Turno</h2>
          <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
            Ingresá cuánto efectivo hay en la caja ahora mismo. El sistema calculará la diferencia.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius)",
            padding: "16px",
            textAlign: "center",
            fontSize: "32px",
            fontWeight: 800,
            color: amount ? "var(--text)" : "var(--text-3)",
            minHeight: "56px",
            marginBottom: "12px",
          }}
        >
          {amount ? `$ ${amount}` : "Efectivo en caja"}
        </div>

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
