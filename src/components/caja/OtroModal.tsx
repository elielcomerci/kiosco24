"use client";

import { useState } from "react";
import NumPad from "@/components/ui/NumPad";
import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";

interface TicketItem {
  name: string;
  price: number;
  quantity: number;
}

interface OtroModalProps {
  onClose: () => void;
  onAdd: (item: TicketItem) => void;
}

export default function OtroModal({ onClose, onAdd }: OtroModalProps) {
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");

  const handleAdd = () => {
    if (!amount) return;
    onAdd({
      name: name.trim() || "Otro",
      price: parseFloat(amount),
      quantity: 1,
    });
  };

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>➕ OTRO producto</h2>

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
            <span style={{ color: "var(--purple)" }}>{formatARS(parseFloat(amount))}</span>
          ) : (
            <span style={{ color: "var(--text-3)" }}>$0</span>
          )}
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <input
          className="input"
          placeholder="Descripción (opcional): caramelos, café..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={handleAdd}
            disabled={!amount}
          >
            Agregar al ticket
          </button>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}
