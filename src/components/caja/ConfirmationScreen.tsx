"use client";

import { useEffect, useState } from "react";
import { formatARS } from "@/lib/utils";

interface TicketItem {
  name: string;
  price: number;
  quantity: number;
}

interface ConfirmationScreenProps {
  sale: {
    total: number;
    paymentMethod: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT";
    items: TicketItem[];
    receivedAmount?: number;
    creditCustomerName?: string;
  };
  onChange: number | null;
  onCorregir: () => void;
  onListo: () => void;
}

export default function ConfirmationScreen({
  sale,
  onChange,
  onCorregir,
  onListo,
}: ConfirmationScreenProps) {
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onListo();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onListo]);

  const payLabel = {
    CASH: "Efectivo",
    MERCADOPAGO: "MercadoPago",
    TRANSFER: "Transferencia",
    DEBIT: "Débito",
    CREDIT_CARD: "Tarjeta de Crédito",
    CREDIT: `Fiado — ${sale.creditCustomerName ?? ""}`,
  }[sale.paymentMethod];

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "24px",
      }}
      className="animate-slide-up"
    >
      {/* Check icon */}
      <div
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "50%",
          background: "rgba(var(--primary-rgb, 34, 197, 94), 0.15)",
          border: "2px solid var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "32px",
          animation: "pulse-green 1.5s ease infinite",
        }}
      >
        ✓
      </div>

      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--primary)", marginBottom: "4px" }}>
          VENTA REGISTRADA
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "14px" }}>{payLabel}</p>
      </div>

      {/* Items */}
      <div
        className="card"
        style={{ width: "100%", maxWidth: "400px", padding: "20px" }}
      >
        {sale.items.map((item, i) => (
          <div key={i} className="ticket-item">
            <span style={{ fontSize: "14px" }}>
              {item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}
            </span>
            <span style={{ fontWeight: 600 }}>{formatARS(item.price * item.quantity)}</span>
          </div>
        ))}

        <div className="separator" style={{ margin: "12px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "18px" }}>
          <span>TOTAL</span>
          <span style={{ color: "var(--primary)" }}>{formatARS(sale.total)}</span>
        </div>

        {sale.receivedAmount && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-2)", marginTop: "8px", fontSize: "14px" }}>
              <span>Recibido</span>
              <span>{formatARS(sale.receivedAmount)}</span>
            </div>
            {onChange !== null && onChange >= 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "8px",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "var(--primary)",
                }}
              >
                <span>CAMBIO</span>
                <span>← {formatARS(onChange)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "400px" }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1 }}
          onClick={onCorregir}
        >
          CORREGIR
        </button>
        <button
          className="btn btn-green"
          style={{ flex: 2 }}
          onClick={onListo}
        >
          LISTO
        </button>
      </div>

      <p style={{ color: "var(--text-3)", fontSize: "12px" }}>
        Se cierra automáticamente en {seconds} seg...
      </p>
    </div>
  );
}
