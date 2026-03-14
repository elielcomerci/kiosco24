"use client";

import { useState } from "react";
import NumPad from "@/components/ui/NumPad";

interface OpenShiftModalProps {
  onConfirm: (amount: number, employeeName: string) => void;
}

export default function OpenShiftModal({ onConfirm }: OpenShiftModalProps) {
  const [employee, setEmployee] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    await onConfirm(parseFloat(amount), employee || "Dueño");
    setLoading(false);
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal animate-slide-up">
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Abrir Turno</h2>
          <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
            Ingresá el dinero con el que abrís la caja y quién atiende.
          </p>
        </div>

        <input
          className="input"
          placeholder="Nombre (ej. Juan)"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          style={{ marginBottom: "12px", textAlign: "center" }}
        />

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
          }}
        >
          {amount ? `$ ${amount}` : "Monto inicial"}
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <button
          className="btn btn-green"
          style={{ marginTop: "10px" }}
          onClick={handleConfirm}
          disabled={!amount || loading}
        >
          {loading ? "Abriendo..." : "Abrir Caja"}
        </button>
      </div>
    </div>
  );
}
