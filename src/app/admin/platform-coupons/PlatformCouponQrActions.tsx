"use client";

import { useState } from "react";

import {
  downloadPlatformCouponQr,
  downloadPlatformCouponsPdf,
  getPlatformCouponAbsoluteRegisterUrl,
  getPlatformCouponQrPreviewDataUrl,
  type PlatformCouponAssetItem,
} from "./platform-coupon-downloads";

type PlatformCouponQrActionsProps = {
  code: string;
  expiresAt: string;
  benefitLabel?: string | null;
  note?: string | null;
  registerPath?: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PlatformCouponQrActions({
  code,
  expiresAt,
  benefitLabel,
  note,
  registerPath,
}: PlatformCouponQrActionsProps) {
  const coupon: PlatformCouponAssetItem = { code, expiresAt, note, registerPath };
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const ensureQr = async () => {
    if (qrDataUrl) {
      return qrDataUrl;
    }

    setStatus("loading");
    setFeedback(null);

    try {
      const nextQrDataUrl = await getPlatformCouponQrPreviewDataUrl(coupon);
      setQrDataUrl(nextQrDataUrl);
      return nextQrDataUrl;
    } finally {
      setStatus("idle");
    }
  };

  const handleOpen = async () => {
    setIsOpen(true);
    await ensureQr();
  };

  const handleDownloadQr = async () => {
    setStatus("loading");
    setFeedback(null);

    try {
      const nextQrDataUrl = await downloadPlatformCouponQr(coupon);
      setQrDataUrl(nextQrDataUrl);
      setFeedback("QR descargado.");
    } catch {
      setFeedback("No pudimos descargar el QR.");
    } finally {
      setStatus("idle");
    }
  };

  const handleDownloadPdf = async () => {
    setStatus("loading");
    setFeedback(null);

    try {
      await downloadPlatformCouponsPdf({
        coupons: [coupon],
        benefitLabel,
        note,
        filename: `platform-coupon-${code}.pdf`,
      });
      setFeedback("PDF descargado.");
    } catch {
      setFeedback("No pudimos descargar el PDF.");
    } finally {
      setStatus("idle");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getPlatformCouponAbsoluteRegisterUrl(coupon));
      setFeedback("Link copiado.");
    } catch {
      setFeedback("No pudimos copiar el link.");
    }
  };

  const isBusy = status === "loading";

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={handleOpen} disabled={isBusy}>
        Ver QR
      </button>
      <button type="button" className="btn btn-ghost" onClick={handleDownloadQr} disabled={isBusy}>
        Descargar QR
      </button>
      <button type="button" className="btn btn-ghost" onClick={handleDownloadPdf} disabled={isBusy}>
        PDF
      </button>

      {isOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,.74)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            zIndex: 80,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: "min(100%, 420px)",
              borderRadius: "24px",
              background: "#fff",
              color: "#0f172a",
              padding: "24px",
              display: "grid",
              gap: "18px",
              boxShadow: "0 24px 80px rgba(15,23,42,.35)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "flex-start",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <strong style={{ fontSize: "22px" }}>{code}</strong>
                <span style={{ color: "#475569", lineHeight: 1.5 }}>
                  {benefitLabel || "Cupon de plataforma"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: "24px",
                  lineHeight: 1,
                }}
                aria-label="Cerrar"
              >
                x
              </button>
            </div>

            <div
              style={{
                display: "grid",
                placeItems: "center",
                borderRadius: "20px",
                background: "#f8fafc",
                padding: "20px",
                minHeight: "260px",
              }}
            >
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`QR del cupon ${code}`}
                  style={{ width: "100%", maxWidth: "260px", height: "auto" }}
                />
              ) : (
                <span style={{ color: "#64748b" }}>
                  {isBusy ? "Generando QR..." : "QR no disponible."}
                </span>
              )}
            </div>

            <div style={{ display: "grid", gap: "4px", color: "#475569", fontSize: "14px" }}>
              <span>Escanea para abrir el registro con el cupon aplicado.</span>
              <span>Expira: {formatDate(expiresAt)}</span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadQr} disabled={isBusy}>
                Descargar QR
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownloadPdf} disabled={isBusy}>
                Descargar PDF
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleCopyLink}>
                Copiar link
              </button>
              <a
                href={getPlatformCouponAbsoluteRegisterUrl(coupon)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ textDecoration: "none" }}
              >
                Abrir registro
              </a>
            </div>

            {feedback ? (
              <div
                style={{
                  borderRadius: "14px",
                  background: "rgba(22,163,74,.12)",
                  color: "#166534",
                  padding: "10px 12px",
                  fontSize: "13px",
                }}
              >
                {feedback}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
