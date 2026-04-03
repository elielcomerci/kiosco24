"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { pdf } from "@react-pdf/renderer";
import { MostazaCouponPDF, PDFCouponItem } from "@/components/cupones/MostazaCouponPDF";
import type { Promotion, ProductCatalogItem } from "./PromocionesClient";

export default function CouponGeneratorModal({
  branchId,
  promotion,
  products,
  branchName,
  branchLogoUrl,
  branchPrimaryColor,
  onClose,
}: {
  branchId: string;
  promotion: Promotion;
  products: ProductCatalogItem[];
  branchName: string;
  branchLogoUrl: string | null;
  branchPrimaryColor: string;
  onClose: () => void;
}) {
  // Build default combo detail string
  const defaultDetail =
    promotion.combos && promotion.combos.length > 0
      ? promotion.combos
          .map((c) => {
            const p = products.find((prod) => prod.productId === c.productId);
            const name = p?.product.name ?? "Producto";
            const variant = c.variantId
              ? p?.product.variants?.find((v) => v.id === c.variantId)?.name
              : null;
            return `${c.quantity}x ${name}${variant ? ` (${variant})` : ""}`;
          })
          .join(" + ")
      : "";

  const [count, setCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });

  // Three free-text fields
  const [line1, setLine1] = useState(branchName); // header / brand name
  const [line2, setLine2] = useState(promotion.name); // promo title / offer
  const [line3, setLine3] = useState(defaultDetail); // detail / what's included

  const [brandColor, setBrandColor] = useState(branchPrimaryColor);

  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("generating");
    setErrorMessage("");

    try {
      const res = await fetch(`/api/cupones/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promotionId: promotion.id,
          count: parseInt(count, 10),
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Error al solicitar lote.");
      }

      const data = await res.json();
      const rawCoupons: { code: string; expiresAt: string }[] = data.coupons;

      if (!rawCoupons || rawCoupons.length === 0) {
        throw new Error("No se devolvieron cupones.");
      }

      const pdfItems: PDFCouponItem[] = await Promise.all(
        rawCoupons.map(async (c) => ({
          code: c.code,
          expiresAt: c.expiresAt,
          qrDataUrl: await QRCode.toDataURL(c.code, { margin: 1, width: 400 }),
        }))
      );

      const blob = await pdf(
        <MostazaCouponPDF
          coupons={pdfItems}
          brandColor={brandColor}
          logoUrl={branchLogoUrl ?? undefined}
          line1={line1}
          line2={line2}
          line3={line3}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cupones-${promotion.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al generar el PDF.";
      console.error(err);
      setStatus("error");
      setErrorMessage(msg);
    }
  };

  return (
    <div className="promo-modal-backdrop">
      <div className="promo-modal" style={{ maxWidth: "560px" }}>
        <div className="promo-modal-header">
          <h2>Generar Cupones PDF</h2>
          <button
            type="button"
            className="promo-close-btn"
            onClick={onClose}
            disabled={status === "generating"}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleGenerate} className="promo-modal-body">
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginBottom: "20px" }}>
            Cada cupón incluirá un QR único. Personalizá los textos que aparecerán impresos.
          </p>

          {/* ── Cantidad + Vencimiento ── */}
          <div className="promo-row">
            <div className="promo-form-group">
              <label>Cantidad de cupones</label>
              <input
                type="number"
                className="promo-input"
                min="1"
                max="500"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
                disabled={status === "generating"}
              />
            </div>
            <div className="promo-form-group">
              <label>Vence el</label>
              <input
                type="date"
                className="promo-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
                disabled={status === "generating"}
              />
            </div>
          </div>

          {/* ── Textos libres ── */}
          <div
            style={{
              background: "var(--surface-2, #f8fafc)",
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-2)",
                marginBottom: "12px",
              }}
            >
              ✏️ Texto del cupón (campos libres)
            </p>

            <div className="promo-form-group" style={{ marginBottom: "10px" }}>
              <label>Línea 1 · Encabezado / Nombre del local</label>
              <input
                type="text"
                className="promo-input"
                placeholder="Ej: Kiosco El Sol"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                maxLength={60}
                disabled={status === "generating"}
              />
            </div>

            <div className="promo-form-group" style={{ marginBottom: "10px" }}>
              <label>Línea 2 · Título de la promoción</label>
              <input
                type="text"
                className="promo-input"
                placeholder="Ej: 2x1 en gaseosas o 15% OFF"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                maxLength={80}
                disabled={status === "generating"}
              />
            </div>

            <div className="promo-form-group">
              <label>Línea 3 · Detalle / Condiciones</label>
              <input
                type="text"
                className="promo-input"
                placeholder="Ej: Incluye 1x Coca-Cola 500ml + 1x Doritos 100g"
                value={line3}
                onChange={(e) => setLine3(e.target.value)}
                maxLength={120}
                disabled={status === "generating"}
              />
            </div>
          </div>

          {/* ── Color de marca ── */}
          <div className="promo-row" style={{ alignItems: "center" }}>
            <div className="promo-form-group" style={{ flex: "0 0 auto" }}>
              <label>Color de marca</label>
              <input
                type="color"
                className="promo-input"
                style={{ padding: 0, height: "42px", width: "90px", cursor: "pointer" }}
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={status === "generating"}
              />
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-2)", flex: 1, marginTop: "18px" }}>
              Se usa en el encabezado y pie del cupón. Podés usar el color de tu marca.
            </p>
          </div>

          {status === "error" && (
            <div className="promo-alert error">{errorMessage}</div>
          )}

          {status === "success" && (
            <div className="promo-alert success">¡PDF generado y descargado!</div>
          )}

          <div className="promo-modal-footer" style={{ marginTop: "24px" }}>
            <button
              type="button"
              className="promo-btn-ghost"
              onClick={onClose}
              disabled={status === "generating"}
            >
              Cerrar
            </button>
            <button type="submit" className="promo-btn-primary" disabled={status === "generating"}>
              {status === "generating" ? "Generando PDF…" : `Generar ${count} cupones`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
