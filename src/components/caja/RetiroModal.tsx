"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import NumPad from "@/components/ui/NumPad";
import { formatARS } from "@/lib/utils";

interface RetiroModalProps {
  onClose: () => void;
  onSuccess: () => void;
  employeeId?: string;
}

export default function RetiroModal({ onClose, onSuccess, employeeId }: RetiroModalProps) {
  const params = useParams();
  const branchId = params.branchId as string;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    try {
      await fetch("/api/retiros", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-branch-id": branchId
        },
        body: JSON.stringify({ amount: parseFloat(amount), note, createdByEmployeeId: employeeId }),
      });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>💰 Retiro de caja</h2>
        <p style={{ color: "var(--text-2)", fontSize: "13px" }}>
          Plata tuya. No se descuenta de la ganancia estimada.
        </p>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius)",
            padding: "16px",
            textAlign: "center",
            fontSize: "32px",
            fontWeight: 800,
            minHeight: "56px",
          }}
        >
          {amount ? (
            <span style={{ color: "var(--amber)" }}>{formatARS(parseFloat(amount))}</span>
          ) : (
            <span style={{ color: "var(--text-3)" }}>$0</span>
          )}
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <input
          className="input"
          placeholder="Motivo (opcional): proveedor, casa..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn"
            style={{ flex: 2, background: "var(--amber)", color: "#000" }}
            onClick={handleConfirm}
            disabled={!amount || loading}
          >
            {loading ? "..." : "Confirmar retiro"}
          </button>
        </div>
      </div>
    </div>
  );
}
