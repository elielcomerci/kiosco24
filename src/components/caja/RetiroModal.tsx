"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import NumPad from "@/components/ui/NumPad";
import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";

interface RetiroModalProps {
  onClose: () => void;
  onSuccess: () => void;
  employeeId?: string;
  onSubscriptionRequired?: (message: string) => void;
}

export default function RetiroModal({
  onClose,
  onSuccess,
  employeeId,
  onSubscriptionRequired,
}: RetiroModalProps) {
  const params = useParams();
  const branchId = params.branchId as string;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/retiros", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-branch-id": branchId
        },
        body: JSON.stringify({ amount: parseFloat(amount), note, createdByEmployeeId: employeeId }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 402) {
          onSubscriptionRequired?.(
            data?.error || "Necesitas una suscripcion activa para registrar retiros.",
          );
          return;
        }

        setError(data?.error || "No se pudo registrar el retiro.");
        return;
      }

      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
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

        {error ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "14px",
              background: "rgba(239,68,68,.12)",
              border: "1px solid rgba(239,68,68,.22)",
              color: "#fecaca",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        ) : null}

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
    </ModalPortal>
  );
}
