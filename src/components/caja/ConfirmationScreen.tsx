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
    id: string;
    ticketNumber?: number | null;
    total: number;
    paymentMethod: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT";
    items: TicketItem[];
    receivedAmount?: number;
    creditCustomerName?: string;
  };
  onChange: number | null;
  onCorregir: () => void;
  onListo: () => void;
  onEmitTicket: () => void;
  onEmitInvoice: () => void;
  pauseAutoClose?: boolean;
}

export default function ConfirmationScreen({
  sale,
  onChange,
  onCorregir,
  onListo,
  onEmitTicket,
  onEmitInvoice,
  pauseAutoClose = false,
}: ConfirmationScreenProps) {
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (pauseAutoClose) return;

    const interval = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          clearInterval(interval);
          onListo();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onListo, pauseAutoClose]);

  const payLabel = {
    CASH: "Efectivo",
    MERCADOPAGO: "MercadoPago",
    TRANSFER: "Transferencia",
    DEBIT: "Debito",
    CREDIT_CARD: "Tarjeta de credito",
    CREDIT: sale.creditCustomerName ? `Fiado - ${sale.creditCustomerName}` : "Fiado",
  }[sale.paymentMethod];

  return (
    <div
      className="animate-slide-up"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "24px",
      }}
    >
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
        {sale.ticketNumber ? (
          <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "6px" }}>
            Ticket N° {String(sale.ticketNumber).padStart(6, "0")}
          </p>
        ) : null}
      </div>

      <div className="card" style={{ width: "100%", maxWidth: "400px", padding: "20px" }}>
        {sale.items.map((item, index) => (
          <div key={index} className="ticket-item">
            <span style={{ fontSize: "14px" }}>
              {item.quantity > 1 ? `${item.quantity}x ` : ""}
              {item.name}
            </span>
            <span style={{ fontWeight: 600 }}>{formatARS(item.price * item.quantity)}</span>
          </div>
        ))}

        <div className="separator" style={{ margin: "12px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "18px" }}>
          <span>TOTAL</span>
          <span style={{ color: "var(--primary)" }}>{formatARS(sale.total)}</span>
        </div>

        {sale.receivedAmount ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--text-2)",
                marginTop: "8px",
                fontSize: "14px",
              }}
            >
              <span>Recibido</span>
              <span>{formatARS(sale.receivedAmount)}</span>
            </div>
            {onChange !== null && onChange >= 0 ? (
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
                <span>{formatARS(onChange)}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "10px",
          width: "100%",
          maxWidth: "520px",
        }}
      >
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onCorregir}>
          CORREGIR
        </button>
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onEmitTicket} disabled={!sale.id}>
          EMITIR TICKET
        </button>
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onEmitInvoice} disabled={!sale.id}>
          FACTURA
        </button>
        <button className="btn btn-green" style={{ width: "100%", gridColumn: "1 / -1" }} onClick={onListo}>
          NUEVA VENTA
        </button>
      </div>

      <p style={{ color: "var(--text-3)", fontSize: "12px" }}>
        {pauseAutoClose
          ? "El cierre automatico se pausa mientras revisas el ticket."
          : `Se cierra automaticamente en ${seconds} seg...`}
      </p>
    </div>
  );
}
