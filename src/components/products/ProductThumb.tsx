"use client";

import { useState } from "react";

import ModalPortal from "@/components/ui/ModalPortal";

export default function ProductThumb({
  image,
  emoji,
  name,
  size = 44,
  radius = 12,
  fontSize,
  previewable = false,
}: {
  image?: string | null;
  emoji?: string | null;
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  previewable?: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);

  if (image) {
    const thumb = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${radius}px`,
          objectFit: "cover",
          flexShrink: 0,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      />
    );

    if (!previewable) {
      return thumb;
    }

    return (
      <>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowPreview(true);
          }}
          title={`Ver foto de ${name}`}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            display: "flex",
            borderRadius: `${radius}px`,
            cursor: "zoom-in",
            flexShrink: 0,
          }}
        >
          {thumb}
        </button>

        {showPreview && (
          <ModalPortal>
            <div className="modal-overlay animate-fade-in" onClick={() => setShowPreview(false)}>
              <div
                className="modal animate-slide-up"
                onClick={(event) => event.stopPropagation()}
                style={{ maxWidth: "min(92vw, 560px)", padding: "18px" }}
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--primary)",
                        }}
                      >
                        Foto del producto
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>{name}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPreview(false)}>
                      Cerrar
                    </button>
                  </div>

                  <div
                    style={{
                      borderRadius: "20px",
                      overflow: "hidden",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "12px",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={name}
                      style={{
                        width: "100%",
                        maxHeight: "70vh",
                        objectFit: "contain",
                        borderRadius: "16px",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}
      </>
    );
  }

  if (emoji) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${radius}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          fontSize: `${fontSize ?? Math.max(18, Math.round(size * 0.52))}px`,
          lineHeight: 1,
        }}
      >
        {emoji}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${radius}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
        fontSize: `${fontSize ?? Math.max(14, Math.round(size * 0.34))}px`,
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}
