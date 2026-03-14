"use client";

import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let html5QrCode: Html5Qrcode;
    let active = true;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode("reader", {
          verbose: false,
          formatsToSupport: [
            0, // QR_CODE
            1, // AZTEC
            2, // CODABAR
            3, // CODE_39
            4, // CODE_93
            5, // CODE_128
            6, // DATA_MATRIX
            7, // MAXICODE
            8, // ITF
            9, // EAN_13 (Most common product barcode)
            10, // EAN_8
            11, // PDF_417
            12, // RSS_14
            13, // RSS_EXPANDED
            14, // UPC_A
            15, // UPC_E
            16, // UPC_EAN_EXTENSION
          ]
        });

        // Prefer back camera if available (facing mode environment)
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 300, height: 100 }, // Rectángulo ancho y corto para códigos de barras
            aspectRatio: 1.0, 
            disableFlip: false, // Muchas webcams lo invierten
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true // Usa la API nativa de Chrome si está disponible (MUCHO más rápido)
            }
          } as any,
          (decodedText) => {
            if (active) {
              onScan(decodedText);
              active = false;
              // Attempt to stop automatically when found
              html5QrCode.stop().catch(console.error);
            }
          },
          (errorMessage) => {
            // html5-qrcode throws frequent ignoreable errors on every frame it doesn't find a barcode
            // We just ignore them for clean logs.
          }
        );
      } catch (err: any) {
        setError("Error al iniciar cámara: " + (err?.message || err));
      }
    };

    // Small delay to ensure the DOM element #reader is fully mounted
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error).finally(() => {
          html5QrCode.clear();
        });
      }
    };
  }, [onScan]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ padding: "16px", background: "#000", maxWidth: "400px", width: "100%" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "16px", textAlign: "center" }}>
          Escaneando código...
        </h2>
        
        {error ? (
          <div style={{ color: "var(--red)", textAlign: "center", padding: "20px" }}>{error}</div>
        ) : (
          <div style={{ position: "relative", width: "100%", borderRadius: "8px", overflow: "hidden", minHeight: "250px", background: "#111" }}>
             {/* html5-qrcode requires a div with an id to attach the video stream */}
             <div id="reader" style={{ width: "100%" }}></div>
          </div>
        )}

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: "16px", color: "var(--text-3)" }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
