"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

interface CameraOption {
  id: string;
  label: string;
}

interface ScannerTuningSupport {
  canPreferNearFocus: boolean;
  canZoom: boolean;
  canUseTorch: boolean;
}

type NumericRangeCapability = {
  min?: number;
  max?: number;
  step?: number;
};

function pickPreferredCamera(cameras: CameraOption[]) {
  return (
    cameras.find((camera) => /(back|rear|environment|trasera|externa)/i.test(camera.label)) ||
    cameras[cameras.length - 1] ||
    null
  );
}

function getFocusModes(capabilities: MediaTrackCapabilities) {
  const focusMode = (capabilities as any).focusMode;
  return Array.isArray(focusMode) ? (focusMode as string[]) : [];
}

function getNumericRange(capabilities: MediaTrackCapabilities, key: "zoom" | "focusDistance") {
  const value = (capabilities as any)[key];
  if (!value || typeof value !== "object") return null;

  const range = value as NumericRangeCapability;
  if (typeof range.min !== "number" || typeof range.max !== "number") {
    return null;
  }

  return range;
}

function roundZoom(value: number, step?: number) {
  if (!step || step <= 0) {
    return Number(value.toFixed(2));
  }

  return Number((Math.round(value / step) * step).toFixed(2));
}

async function applyConstraintSafely(scanner: Html5Qrcode, constraints: MediaTrackConstraints) {
  try {
    await scanner.applyVideoConstraints(constraints);
    return true;
  } catch {
    return false;
  }
}

function advancedConstraints(values: Record<string, unknown>): MediaTrackConstraints {
  return { advanced: [values as any] };
}

function buildSupport(capabilities: MediaTrackCapabilities): ScannerTuningSupport {
  const focusModes = getFocusModes(capabilities);
  const zoomRange = getNumericRange(capabilities, "zoom");
  const torch = Boolean((capabilities as any).torch);

  return {
    canPreferNearFocus:
      focusModes.includes("manual") ||
      focusModes.includes("single-shot") ||
      focusModes.includes("continuous") ||
      zoomRange !== null,
    canZoom: zoomRange !== null && zoomRange.max! > Math.max(1, zoomRange.min ?? 1),
    canUseTorch: torch,
  };
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Preparando camara...");
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [preferNearFocus, setPreferNearFocus] = useState(true);
  const [tuningSupport, setTuningSupport] = useState<ScannerTuningSupport>({
    canPreferNearFocus: false,
    canZoom: false,
    canUseTorch: false,
  });

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const hasMultipleCameras = cameras.length > 1;
  const selectedCameraLabel = useMemo(
    () => cameras.find((camera) => camera.id === selectedCameraId)?.label ?? null,
    [cameras, selectedCameraId],
  );

  const applyPreferredTuning = useCallback(
    async (scanner: Html5Qrcode) => {
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        const focusModes = getFocusModes(capabilities);
        const focusDistanceRange = getNumericRange(capabilities, "focusDistance");
        const zoomRange = getNumericRange(capabilities, "zoom");
        const isDesktopLike =
          typeof navigator !== "undefined" &&
          !/android|iphone|ipad|ipod/i.test(navigator.userAgent || "");

        setTuningSupport(buildSupport(capabilities));

        const messages: string[] = [];

        if (preferNearFocus) {
          let focusApplied = false;

          if (focusModes.includes("manual") && focusDistanceRange) {
            focusApplied = await applyConstraintSafely(
              scanner,
              advancedConstraints({
                focusMode: "manual",
                focusDistance: focusDistanceRange.min,
              }),
            );

            if (focusApplied) {
              messages.push("Modo cerca activo");
            }
          }

          if (!focusApplied && focusModes.includes("single-shot")) {
            focusApplied = await applyConstraintSafely(
              scanner,
              advancedConstraints({ focusMode: "single-shot" }),
            );

            if (focusApplied) {
              messages.push("Enfoque cercano puntual activo");
            }
          }

          if (!focusApplied && focusModes.includes("continuous")) {
            const continuousApplied = await applyConstraintSafely(
              scanner,
              advancedConstraints({ focusMode: "continuous" }),
            );

            if (continuousApplied) {
              messages.push("Autofoco continuo activo");
            }
          }

          if (
            zoomRange &&
            typeof zoomRange.max === "number" &&
            zoomRange.max > Math.max(1, zoomRange.min ?? 1)
          ) {
            const baseZoom = isDesktopLike ? 1.8 : 1.35;
            const targetZoom = roundZoom(
              Math.min(zoomRange.max, Math.max(zoomRange.min ?? 1, baseZoom)),
              zoomRange.step,
            );

            const zoomApplied = await applyConstraintSafely(
              scanner,
              advancedConstraints({ zoom: targetZoom }),
            );

            if (zoomApplied) {
              messages.push(`Zoom ${targetZoom}x`);
            }
          }

          if (messages.length === 0) {
            setStatus("La camara no permite modo cerca. Uso normal con la mejor calidad disponible.");
            return;
          }

          setStatus(messages.join(" · "));
          return;
        }

        const relaxedMessages: string[] = [];
        if (focusModes.includes("continuous")) {
          const continuousApplied = await applyConstraintSafely(
            scanner,
            advancedConstraints({ focusMode: "continuous" }),
          );

          if (continuousApplied) {
            relaxedMessages.push("Autofoco continuo");
          }
        }

        if (zoomRange && typeof zoomRange.min === "number") {
          const neutralZoom = roundZoom(Math.max(1, zoomRange.min), zoomRange.step);
          const zoomApplied = await applyConstraintSafely(
            scanner,
            advancedConstraints({ zoom: neutralZoom }),
          );

          if (zoomApplied) {
            relaxedMessages.push("Zoom normal");
          }
        }

        setStatus(
          relaxedMessages.length > 0
            ? relaxedMessages.join(" · ")
            : "Lectura normal activa",
        );
      } catch {
        setStatus("Lectura normal activa");
      }
    },
    [preferNearFocus],
  );

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

          if (!selectedCameraId) {
            const preferredCamera = pickPreferredCamera(normalizedCameras);
            if (preferredCamera) {
              setSelectedCameraId(preferredCamera.id);
              return;
            }
          }
        }

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

        const cameraConfig = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: "environment" };

        await html5QrCode.start(
          cameraConfig as any,
          {
            fps: 18,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const width = Math.min(viewfinderWidth - 24, 420);
              const height = Math.min(viewfinderHeight - 24, Math.max(110, Math.round(width * 0.35)));
              return { width, height };
            },
            aspectRatio: 1.777,
            disableFlip: false,
            rememberLastUsedCamera: true,
            videoConstraints: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
          } as any,
          (decodedText) => {
            if (!active) return;
            onScan(decodedText);
            active = false;
            html5QrCode?.stop().catch(console.error);
          },
          () => {
            // html5-qrcode reports a miss on almost every frame; keep logs clean.
          },
        );

        if (!active) return;
        await applyPreferredTuning(html5QrCode);
      } catch (err: any) {
        if (!active) return;
        setError("No se pudo iniciar la camara. Probá cambiar de camara o dar permiso de acceso.");
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
  }, [applyPreferredTuning, onScan, selectedCameraId]);

  useEffect(() => {
    const scanner = html5QrCodeRef.current;
    if (!scanner) return;

    void applyPreferredTuning(scanner);
  }, [applyPreferredTuning, preferNearFocus]);

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
          Acercá el codigo, buscá buena luz y evitá reflejos. En PC suele rendir mucho mejor con webcam HD o una lectora USB.
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

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              minWidth: "140px",
              background: preferNearFocus ? "var(--primary)" : "rgba(255,255,255,0.08)",
              color: preferNearFocus ? "#04110a" : "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onClick={() => setPreferNearFocus(true)}
          >
            Modo cerca
          </button>
          <button
            className="btn btn-sm"
            style={{
              flex: 1,
              minWidth: "140px",
              background: !preferNearFocus ? "var(--primary)" : "rgba(255,255,255,0.08)",
              color: !preferNearFocus ? "#04110a" : "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onClick={() => setPreferNearFocus(false)}
          >
            Modo normal
          </button>
        </div>

        {!tuningSupport.canPreferNearFocus && (
          <div
            style={{
              marginBottom: "12px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.62)",
              textAlign: "center",
            }}
          >
            Esta cámara no expone controles avanzados de foco. Igual usamos el mejor fallback disponible.
          </div>
        )}

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
              value={selectedCameraId ?? ""}
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

        <div
          style={{
            marginTop: "12px",
            fontSize: "11px",
            color: "rgba(255,255,255,0.56)",
            textAlign: "center",
          }}
        >
          {tuningSupport.canZoom ? "La camara permite zoom." : "Sin zoom controlado."}{" "}
          {tuningSupport.canUseTorch ? "Tambien soporta linterna." : ""}
        </div>

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
