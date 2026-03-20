"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatARS } from "@/lib/utils";

type IncomingNotice = {
  id: string;
  mpPaymentId: string;
  channel: "MERCADOPAGO" | "TRANSFER";
  amount: number;
  payerLabel: string;
  referenceLabel?: string | null;
  approvedObservedAt?: string | null;
};

type MpIncomingPaymentToastsProps = {
  branchId: string;
  enabled?: boolean;
};

export default function MpIncomingPaymentToasts({
  branchId,
  enabled = true,
}: MpIncomingPaymentToastsProps) {
  const [toasts, setToasts] = useState<IncomingNotice[]>([]);
  const cursorRef = useRef(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }

    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const enqueueToast = useCallback(
    (notice: IncomingNotice) => {
      if (seenIdsRef.current.has(notice.id)) {
        return;
      }

      seenIdsRef.current.add(notice.id);
      setToasts((prev) => [...prev, notice].slice(-3));

      const timerId = window.setTimeout(() => {
        dismissToast(notice.id);
      }, 8000);

      timersRef.current.set(notice.id, timerId);
    },
    [dismissToast],
  );

  const pollIncomingPayments = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const res = await fetch(`/api/mp/notices?after=${encodeURIComponent(cursorRef.current)}`, {
        headers: {
          "x-branch-id": branchId,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const items: IncomingNotice[] = Array.isArray(data?.items) ? data.items : [];

      for (const item of items) {
        const nextCursor = item.approvedObservedAt;
        if (nextCursor && nextCursor > cursorRef.current) {
          cursorRef.current = nextCursor;
        }
        enqueueToast(item);
      }
    } catch {
      // El polling es silencioso a propósito.
    }
  }, [branchId, enabled, enqueueToast]);

  useEffect(() => {
    cursorRef.current = new Date().toISOString();
    seenIdsRef.current = new Set();
    const resetId = window.setTimeout(() => {
      setToasts([]);
    }, 0);
    const activeTimers = timersRef.current;

    return () => {
      window.clearTimeout(resetId);
      activeTimers.forEach((timerId) => window.clearTimeout(timerId));
      activeTimers.clear();
    };
  }, [branchId]);

  useEffect(() => {
    if (!enabled) {
      const resetId = window.setTimeout(() => {
        setToasts([]);
      }, 0);

      return () => {
        window.clearTimeout(resetId);
      };
    }

    const pollNowId = window.setTimeout(() => {
      void pollIncomingPayments();
    }, 0);

    const intervalId = window.setInterval(() => {
      void pollIncomingPayments();
    }, 12000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollIncomingPayments();
      }
    };

    window.addEventListener("focus", pollIncomingPayments);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(pollNowId);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", pollIncomingPayments);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, pollIncomingPayments]);

  if (!enabled || toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: "16px",
        left: "16px",
        bottom: "90px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
        zIndex: 12000,
        marginLeft: "auto",
        maxWidth: "360px",
      }}
    >
      {toasts.map((toast) => {
        const title =
          toast.channel === "TRANSFER"
            ? "Transferencia recibida"
            : "Cobro recibido en Mercado Pago";

        const secondaryText =
          toast.referenceLabel && toast.referenceLabel !== toast.payerLabel
            ? toast.referenceLabel
            : null;

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              background: "rgba(15, 23, 42, 0.96)",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              borderRadius: "18px",
              padding: "14px 16px",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.35)",
              color: "white",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "10px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>
                  {title}
                </div>
                <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.05, marginTop: "4px" }}>
                  {formatARS(toast.amount)}
                </div>
                <div style={{ fontSize: "13px", marginTop: "8px", color: "rgba(255,255,255,0.92)" }}>
                  {toast.payerLabel}
                </div>
                {secondaryText && (
                  <div style={{ fontSize: "12px", marginTop: "2px", color: "rgba(255,255,255,0.68)" }}>
                    {secondaryText}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: "16px",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Cerrar aviso"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
