"use client";

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type Html5QrcodeCameraScanConfig,
} from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

type BarcodeScannerError = {
  message?: string;
};

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
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.AZTEC,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.MAXICODE,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.PDF_417,
            Html5QrcodeSupportedFormats.RSS_14,
            Html5QrcodeSupportedFormats.RSS_EXPANDED,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
          ],
        });

        const scanConfig: Html5QrcodeCameraScanConfig & {
          disableFlip: boolean;
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: boolean;
          };
        } = {
          fps: 15,
          qrbox: { width: 300, height: 100 },
          aspectRatio: 1,
          disableFlip: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          scanConfig,
          (decodedText) => {
            if (!active) return;
            onScanRef.current(decodedText);
            active = false;
            void html5QrCode?.stop().catch(console.error);
          },
          () => {
            // html5-qrcode informa misses en casi todos los frames.
          },
        );
      } catch (err: unknown) {
        if (!active) return;
        const scannerError = err as BarcodeScannerError;
        setError(`Error al iniciar camara: ${scannerError.message ?? String(err)}`);
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (html5QrCode?.isScanning) {
        void html5QrCode
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
