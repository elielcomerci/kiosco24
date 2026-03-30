"use client";

import { useEffect, useState } from "react";

import ModalPortal from "@/components/ui/ModalPortal";
import {
  DEVICE_TEXT_SCALE_COOKIE,
  normalizeDeviceTextScale,
  type DeviceTextScale,
} from "@/lib/device-text-scale";

const OPTIONS: Array<{
  value: DeviceTextScale;
  label: string;
  description: string;
}> = [
  {
    value: "compact",
    label: "Compacto",
    description: "Entra mas informacion en pantalla.",
  },
  {
    value: "default",
    label: "Normal",
    description: "Equilibrado para la mayoria de los dispositivos.",
  },
  {
    value: "large",
    label: "Grande",
    description: "Mejora lectura y precision al tocar.",
  },
];

function applyTextScale(scale: DeviceTextScale) {
  document
    .querySelectorAll<HTMLElement>(".branch-context")
    .forEach((element) => element.setAttribute("data-text-scale", scale));
}

function persistTextScale(scale: DeviceTextScale) {
  document.cookie = `${DEVICE_TEXT_SCALE_COOKIE}=${scale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export default function DeviceTextScaleControl({
  initialScale,
}: {
  initialScale: DeviceTextScale;
}) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState<DeviceTextScale>(normalizeDeviceTextScale(initialScale));

  useEffect(() => {
    applyTextScale(scale);
  }, [scale]);

  const handleSelect = (nextScale: DeviceTextScale) => {
    const normalized = normalizeDeviceTextScale(nextScale);
    setScale(normalized);
    applyTextScale(normalized);
    persistTextScale(normalized);
    setOpen(false);
  };

  const currentLabel = OPTIONS.find((option) => option.value === scale)?.label ?? "Normal";

  return (
    <>
      <button
        type="button"
        className="app-header-icon-link app-header-icon-button"
        title={`Tamano de texto: ${currentLabel}`}
        aria-label="Tamano de texto"
        onClick={() => setOpen(true)}
      >
        <span style={{ fontSize: "0.82em", fontWeight: 900, letterSpacing: "-0.04em" }}>Aa</span>
      </button>

      {open && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in no-print" onClick={() => setOpen(false)} style={{ zIndex: 10001 }}>
            <div
              className="modal animate-slide-up"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: "min(92vw, 420px)", width: "100%" }}
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--text-3)",
                      }}
                    >
                      Este dispositivo
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 800 }}>Tamano de texto</div>
                    <div style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
                      Cada navegador puede guardar su propia preferencia. Ideal si el duenio y los empleados usan tamanos distintos.
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                    Cerrar
                  </button>
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {OPTIONS.map((option) => {
                    const selected = option.value === scale;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(option.value)}
                        style={{
                          display: "grid",
                          gap: "6px",
                          width: "100%",
                          textAlign: "left",
                          padding: "14px 16px",
                          borderRadius: "16px",
                          border: selected
                            ? "1px solid rgba(var(--primary-rgb), 0.42)"
                            : "1px solid var(--border)",
                          background: selected
                            ? "rgba(var(--primary-rgb), 0.1)"
                            : "var(--surface-2)",
                          color: "var(--text)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                          <div style={{ fontWeight: 800, fontSize: "15px" }}>{option.label}</div>
                          {selected && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: "26px",
                                height: "26px",
                                borderRadius: "999px",
                                background: "var(--primary)",
                                color: "#04130a",
                                fontWeight: 900,
                                fontSize: "13px",
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <div style={{ color: "var(--text-2)", lineHeight: 1.45 }}>{option.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
