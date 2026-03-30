"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TicketPreview from "@/components/ticket/TicketPreview";
import ModalPortal from "@/components/ui/ModalPortal";
import { generateWhatsAppTicketText, type TicketPreviewData } from "@/lib/ticket-format";

export default function TicketModal({
  branchId,
  saleId,
  initialTicket,
  emitOnOpen = false,
  onResolved,
  onClose,
}: {
  branchId: string;
  saleId?: string | null;
  initialTicket?: TicketPreviewData | null;
  emitOnOpen?: boolean;
  onResolved?: (ticket: TicketPreviewData) => void;
  onClose: () => void;
}) {
  const [ticket, setTicket] = useState<TicketPreviewData | null>(initialTicket ?? null);
  const [loading, setLoading] = useState(Boolean(saleId && !initialTicket));
  const [error, setError] = useState<string | null>(null);
  const [shouldEmitOnOpen] = useState(emitOnOpen);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (!saleId || initialTicket) return;

    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tickets/${saleId}`, {
          method: shouldEmitOnOpen ? "POST" : "GET",
          headers: {
            "x-branch-id": branchId,
          },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo cargar el ticket.");
        }
        if (active) {
          setTicket(data);
          onResolvedRef.current?.(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el ticket.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [branchId, initialTicket, saleId, shouldEmitOnOpen]);

  const whatsappUrl = useMemo(() => {
    if (!ticket) return null;
    return `https://wa.me/?text=${encodeURIComponent(generateWhatsAppTicketText(ticket))}`;
  }, [ticket]);

  const handlePrint = () => {
    document.body.classList.add("print-ticket-mode");

    const cleanup = () => {
      document.body.classList.remove("print-ticket-mode");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => {
      window.print();
    }, 0);
  };

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
        <div
          className="modal animate-slide-up ticket-modal-shell"
          onClick={(e) => e.stopPropagation()}
          style={{ width: "min(96vw, 480px)", maxHeight: "90dvh", overflowY: "auto", padding: 0 }}
        >
          <div className="no-print" style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>Ticket no fiscal</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
              {shouldEmitOnOpen
                ? "Emitilo, compartilo o imprimilo despues de la venta."
                : "Comparti o imprimi el comprobante de la venta."}
            </div>
          </div>

          <div style={{ padding: "18px" }}>
            {loading ? (
              <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-3)" }}>Cargando ticket...</div>
            ) : error ? (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  background: "rgba(239,68,68,0.08)",
                  color: "var(--red)",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            ) : ticket ? (
              <div className="ticket-print-area">
                <TicketPreview ticket={ticket} />
              </div>
            ) : null}
          </div>

          <div
            className="no-print"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "10px",
              padding: "0 18px 18px",
            }}
          >
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (whatsappUrl) {
                  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                }
              }}
              disabled={!whatsappUrl}
            >
              WhatsApp
            </button>
            <button className="btn btn-ghost" onClick={handlePrint} disabled={!ticket}>
              Imprimir
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
