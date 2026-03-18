"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let active = true;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode("reader", {
          verbose: false,
          formatsToSupport: [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
          ],
        });

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 300, height: 100 },
            aspectRatio: 1,
            disableFlip: false,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
          } as any,
          (decodedText) => {
            if (!active) return;
            onScanRef.current(decodedText);
            active = false;
            html5QrCode?.stop().catch(console.error);
          },
          () => {
            // html5-qrcode reports a miss on almost every frame; keep logs clean.
          },
        );
      } catch (err: any) {
        if (!active) return;
        setError("Error al iniciar camara: " + (err?.message || err));
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (html5QrCode?.isScanning) {
        html5QrCode
          .stop()
          .catch(console.error)
          .finally(() => {
            void html5QrCode?.clear();
          });
      }
    };
  }, []);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "16px", background: "#000", maxWidth: "400px", width: "100%" }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#fff",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          Escaneando codigo...
        </h2>

        {error ? (
          <div
            style={{
              color: "var(--red)",
              textAlign: "center",
              padding: "20px",
            }}
          >
            {error}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              width: "100%",
              borderRadius: "8px",
              overflow: "hidden",
              minHeight: "250px",
              background: "#111",
            }}
          >
            <div id="reader" style={{ width: "100%" }} />
          </div>
        )}

        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: "16px", color: "var(--text-3)" }}
          onClick={onClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
