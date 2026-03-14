"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    let active = true;
    readerRef.current = new BrowserMultiFormatReader();

    const startScanner = async () => {
      if (!videoRef.current) return;
      try {
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        
        // Prefer back camera
        const selectedDev = videoInputDevices.find(dev => dev.label.toLowerCase().includes("back") || dev.label.toLowerCase().includes("trasera")) || videoInputDevices[0];

        if (!selectedDev) {
          setError("No se enocontró cámara.");
          return;
        }

        await readerRef.current?.decodeFromVideoDevice(
          selectedDev.deviceId,
          videoRef.current,
          (result, err) => {
            if (result && active) {
              onScan(result.getText());
              active = false; // Stop scanning after first hit
            }
            if (err && (err as any).name !== 'NotFoundException') {
              console.error(err);
            }
          }
        );
      } catch (err: any) {
        setError("Error al iniciar cámara: " + err.message);
      }
    };

    startScanner();

    return () => {
      active = false;
      const stream = videoRef.current?.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      readerRef.current = null;
    };
  }, [onScan]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ padding: "16px", background: "#000" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "16px", textAlign: "center" }}>
          Escaneando código...
        </h2>
        {error ? (
          <div style={{ color: "var(--red)", textAlign: "center", padding: "20px" }}>{error}</div>
        ) : (
          <div style={{ position: "relative", width: "100%", borderRadius: "8px", overflow: "hidden" }}>
             <video ref={videoRef} style={{ width: "100%", height: "auto", display: "block" }} playsInline muted />
             <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "70%", height: "20%", border: "2px solid var(--green)", borderRadius: "4px", boxShadow: "0 0 0 4000px rgba(0,0,0,0.6)" }}/>
          </div>
        )}
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: "16px", color: "var(--text-3)" }} onClick={onClose}>
          Cerrar Escáner
        </button>
      </div>
    </div>
  );
}
