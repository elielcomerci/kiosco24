"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import NumPad from "@/components/ui/NumPad";
import { formatARS } from "@/lib/utils";

const REASONS = [
  { key: "ICE",         label: "Hielo",      emoji: "🧊" },
  { key: "MERCHANDISE", label: "Mercadería", emoji: "📦" },
  { key: "DELIVERY",    label: "Delivery",   emoji: "🛵" },
  { key: "OTHER",       label: "Otros",      emoji: "📝" },
];

interface GastoModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function GastoModal({ onClose, onSuccess }: GastoModalProps) {
  const params = useParams();
  const branchId = params.branchId as string;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!amount || !reason) return;
    setLoading(true);
    try {
      await fetch("/api/gastos", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-branch-id": branchId
        },
        body: JSON.stringify({ amount: parseFloat(amount), reason }),
      });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>💸 Registrar Gasto</h2>

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
            <span style={{ color: "var(--red)" }}>{formatARS(parseFloat(amount))}</span>
          ) : (
            <span style={{ color: "var(--text-3)" }}>$0</span>
          )}
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {REASONS.map((r) => (
            <button
              key={r.key}
              className="btn btn-ghost"
              style={
                reason === r.key
                  ? { borderColor: "var(--red)", color: "var(--red)", background: "rgba(239,68,68,0.08)" }
                  : undefined
              }
              onClick={() => setReason(r.key)}
            >
              {r.emoji} {r.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-red"
            style={{ flex: 2 }}
            onClick={handleConfirm}
            disabled={!amount || !reason || loading}
          >
            {loading ? "..." : "Confirmar gasto"}
          </button>
        </div>
      </div>
    </div>
  );
}
