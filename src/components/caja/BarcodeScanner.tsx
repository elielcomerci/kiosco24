"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

interface CameraOption {
  id: string;
  label: string;
}

function pickPreferredCamera(cameras: CameraOption[]) {
  return (
    cameras.find((camera) => /(back|rear|environment|trasera|externa)/i.test(camera.label)) ||
    cameras[cameras.length - 1] ||
    null
  );
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Preparando camara...");
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const hasMultipleCameras = cameras.length > 1;
  const displayedCameraId = selectedCameraId ?? activeCameraId;
  const selectedCameraLabel = useMemo(
    () => cameras.find((camera) => camera.id === displayedCameraId)?.label ?? null,
    [cameras, displayedCameraId],
  );

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let active = true;

    const startScanner = async () => {
      try {
        setError(null);
        setStatus("Preparando camara...");

        const availableCameras = await Html5Qrcode.getCameras().catch(() => []);
        if (!active) return;

        const normalizedCameras = availableCameras.map((camera, index) => ({
          id: camera.id,
          label: camera.label || `Camara ${index + 1}`,
        }));

        if (normalizedCameras.length > 0) {
          setCameras(normalizedCameras);
        }

        const preferredCamera = pickPreferredCamera(normalizedCameras);
        const resolvedCameraId = selectedCameraId ?? preferredCamera?.id ?? null;

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
        html5QrCodeRef.current = html5QrCode;

        const cameraConfig = resolvedCameraId
          ? { deviceId: { exact: resolvedCameraId } }
          : { facingMode: { ideal: "environment" } };

        await html5QrCode.start(
          cameraConfig as any,
          {
            fps: 15,
            qrbox: { width: 300, height: 100 },
            aspectRatio: 1,
            disableFlip: false,
            videoConstraints: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
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

        if (!active) return;
        const runningSettings = (html5QrCode as any).getRunningTrackSettings?.();
        const runningCameraId =
          typeof runningSettings?.deviceId === "string" ? runningSettings.deviceId : resolvedCameraId;
        setActiveCameraId(runningCameraId ?? null);
        setStatus("Apunta al codigo y evita reflejos.");
      } catch (err: any) {
        if (!active) return;
        setError("No se pudo iniciar la camara. Proba cambiar de camara o dar permiso de acceso.");
        setStatus("Scanner no disponible");
        console.error("Barcode scanner error:", err);
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
      setActiveCameraId(null);
      html5QrCodeRef.current = null;
      if (html5QrCode?.isScanning) {
        html5QrCode
          .stop()
          .catch(console.error)
          .finally(() => {
            void html5QrCode?.clear();
          });
      }
    };
  }, [selectedCameraId]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "16px", background: "#000", maxWidth: "440px", width: "100%" }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#fff",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Escanear codigo de barras
        </h2>
        <p
          style={{
            margin: "0 0 10px",
            fontSize: "12px",
            color: "rgba(255,255,255,0.7)",
            textAlign: "center",
          }}
        >
          Acerca el codigo, busca buena luz y evita reflejos. En PC suele rendir mejor con webcam HD o lectora USB.
        </p>

        <div
          style={{
            marginBottom: "12px",
            padding: "8px 10px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.78)",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          {status}
        </div>

        {hasMultipleCameras && (
          <label
            style={{
              display: "block",
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Camara
            </span>
            <select
              value={displayedCameraId ?? ""}
              onChange={(e) => {
                setError(null);
                setStatus("Cambiando camara...");
                setSelectedCameraId(e.target.value || null);
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: "14px",
                outline: "none",
              }}
            >
              {!displayedCameraId && (
                <option value="" style={{ color: "#111" }}>
                  Elegir camara...
                </option>
              )}
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id} style={{ color: "#111" }}>
                  {camera.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {selectedCameraLabel && !hasMultipleCameras && (
          <div
            style={{
              marginBottom: "12px",
              padding: "8px 10px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.72)",
              fontSize: "12px",
              textAlign: "center",
            }}
          >
            Usando: {selectedCameraLabel}
          </div>
        )}

        {error ? (
          <div
            style={{
              color: "var(--red)",
              textAlign: "center",
              padding: "20px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            {error}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              width: "100%",
              borderRadius: "12px",
              overflow: "hidden",
              minHeight: "280px",
              background: "#111",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "12% 7%",
                border: "2px solid rgba(34,197,94,0.7)",
                borderRadius: "16px",
                pointerEvents: "none",
                boxShadow: "0 0 0 999px rgba(0,0,0,0.28)",
              }}
            />
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
