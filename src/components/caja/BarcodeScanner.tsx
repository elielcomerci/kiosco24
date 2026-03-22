"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserCodeReader,
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODABAR,
  BarcodeFormat.ITF,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
];

const SCAN_HINTS = new Map<DecodeHintType, BarcodeFormat[] | boolean>([
  [DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS],
  [DecodeHintType.TRY_HARDER, true],
]);

type BarcodeScannerError = {
  message?: string;
};

function formatScannerError(err: unknown) {
  const scannerError = err as BarcodeScannerError | undefined;
  return scannerError?.message ?? String(err);
}

function pickPreferredDeviceId(devices: MediaDeviceInfo[]) {
  if (devices.length === 0) return undefined;

  const preferred = devices.find((device) =>
    /back|rear|environment|trase|extern/i.test(device.label),
  );

  return preferred?.deviceId ?? devices[0]?.deviceId;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let active = true;
    const codeReader = new BrowserMultiFormatReader(SCAN_HINTS, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 500,
      tryPlayVideoTimeout: 7000,
    });

    const rememberControls = (controls: IScannerControls) => {
      if (!active) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    };

    const stopScanner = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };

    const handleDecode: Parameters<BrowserMultiFormatReader["decodeFromVideoDevice"]>[2] = (
      result,
      _error,
      controls,
    ) => {
      if (!active || !result) return;

      const decodedText = result.getText().trim();
      if (!decodedText) return;

      active = false;
      controls.stop();
      controlsRef.current = null;
      onScanRef.current(decodedText);
    };

    const startScanner = async () => {
      if (!videoRef.current) {
        setError("No se pudo inicializar la vista de la camara.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no soporta acceso a camara.");
        return;
      }

      try {
        const controls = await codeReader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          handleDecode,
        );
        rememberControls(controls);
      } catch (constraintsError) {
        try {
          const devices = await BrowserCodeReader.listVideoInputDevices();
          const preferredDeviceId = pickPreferredDeviceId(devices);

          const controls = await codeReader.decodeFromVideoDevice(
            preferredDeviceId,
            videoRef.current,
            handleDecode,
          );
          rememberControls(controls);
        } catch (deviceError) {
          if (!active) return;

          const rootError = formatScannerError(deviceError) || formatScannerError(constraintsError);
          setError(`Error al iniciar camara: ${rootError}`);
        }
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
      stopScanner();
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
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Escaneando codigo...
        </h2>
        <p
          style={{
            fontSize: "12px",
            color: "rgba(255,255,255,0.7)",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          Acerca el codigo y mantenelo dentro de la guia.
        </p>

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
              aspectRatio: "4 / 3",
            }}
          >
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                background: "#111",
                objectFit: "cover",
                objectPosition: "center center",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "50% 12% auto",
                height: "34%",
                transform: "translateY(-50%)",
                border: "2px solid rgba(255,255,255,0.85)",
                borderRadius: "12px",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.22)",
                pointerEvents: "none",
              }}
            />
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
