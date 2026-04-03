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
  onClose,
}: {
  branchId: string;
  promotion: Promotion;
  products: ProductCatalogItem[];
  onClose: () => void;
}) {
  // Try to find a default image from the combos
  let defaultImage = "";
  if (promotion.combos && promotion.combos.length > 0) {
    const defaultComboObj = promotion.combos.find(c => {
      const p = products.find(prod => prod.productId === c.productId);
      return p?.product.image;
    });
    if (defaultComboObj) {
      const p = products.find(prod => prod.productId === defaultComboObj.productId);
      defaultImage = p?.product.image || "";
    }
  }

  const [count, setCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [imageUrl, setImageUrl] = useState(defaultImage);
  const [brandColor, setBrandColor] = useState("#da251d"); // Mostaza Default
  
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("generating");
    setErrorMessage("");

    try {
      // 1. Llamar a nuestra API batch
      const res = await fetch(`/api/cupones/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promotionId: promotion.id,
          count: parseInt(count, 10),
          expiresAt: new Date(expiresAt).toISOString(),
        })
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

      // 2. Generar QR Data URLs localmente para incrustar en el PDF (sincrono para 500 puede tardar un pelín, pero está bien)
      const pdfItems: PDFCouponItem[] = await Promise.all(
        rawCoupons.map(async (c) => ({
          code: c.code,
          expiresAt: c.expiresAt,
          qrDataUrl: await QRCode.toDataURL(c.code, { margin: 1, width: 400 }),
        }))
      );

      // 3. Crear el PDF Blob en memoria usando @react-pdf/renderer
      const blob = await pdf(
        <MostazaCouponPDF 
          coupons={pdfItems} 
          brandColor={brandColor} 
          imageUrl={imageUrl} 
          promoTitle={promotion.name} 
        />
      ).toBlob();

      // 4. Trigger Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cupones-${promotion.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus("success");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Error al generar el PDF.");
    }
  };

  return (
    <div className="promo-modal-backdrop">
      <div className="promo-modal">
        <div className="promo-modal-header">
          <h2>Generar Lote de Cupones (PDF)</h2>
          <button type="button" className="promo-close-btn" onClick={onClose} disabled={status === "generating"}>×</button>
        </div>
        
        <form onSubmit={handleGenerate} className="promo-modal-body">
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginBottom: "16px" }}>
            Se emitirán múltiples códigos QR únicos válidos por esta promoción.
            <strong> Promoción: {promotion.name}</strong>
          </p>

          <div className="promo-row">
            <div className="promo-form-group">
              <label>Cantidad (Ej: 100)</label>
              <input 
                type="number" 
                className="promo-input" 
                min="1" 
                max="500" 
                value={count} 
                onChange={e => setCount(e.target.value)} 
                required 
                disabled={status === "generating"}
              />
            </div>
            <div className="promo-form-group">
              <label>Fecha de Vencimiento</label>
              <input 
                type="date" 
                className="promo-input" 
                value={expiresAt} 
                onChange={e => setExpiresAt(e.target.value)} 
                required 
                disabled={status === "generating"}
              />
            </div>
          </div>

          <div className="promo-row">
            <div className="promo-form-group" style={{ flex: 1 }}>
              <label>URL Imagen Promocional (Opcional)</label>
              <input 
                type="url" 
                className="promo-input" 
                placeholder="https://..." 
                value={imageUrl} 
                 onChange={e => setImageUrl(e.target.value)} 
                 disabled={status === "generating"}
              />
            </div>
            <div className="promo-form-group">
              <label>Color Barra</label>
              <input 
                type="color" 
                className="promo-input" 
                style={{ padding: 0, height: "42px", width: "100%", cursor: "pointer" }}
                value={brandColor} 
                onChange={e => setBrandColor(e.target.value)} 
                disabled={status === "generating"}
              />
            </div>
          </div>

          {status === "error" && (
            <div className="promo-alert error">{errorMessage}</div>
          )}
          
          {status === "success" && (
            <div className="promo-alert success">¡PDF generado y descargado con éxito!</div>
          )}

          <div className="promo-modal-footer" style={{ marginTop: "24px" }}>
            <button type="button" className="promo-btn-ghost" onClick={onClose} disabled={status === "generating"}>
              Cerrar
            </button>
            <button type="submit" className="promo-btn-primary" disabled={status === "generating"}>
              {status === "generating" ? "Generando & Exportando..." : "Generar PDF"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
