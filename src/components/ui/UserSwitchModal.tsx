"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { playAudio } from "@/lib/audio";
import { useKeypadLock } from "@/lib/keypad-lock";
import ModalPortal from "@/components/ui/ModalPortal";

interface Employee {
  id: string;
  name: string;
  hasPin: boolean;
}

interface UserSwitchModalProps {
  branchId: string;
  currentEmployeeId?: string;
  onCancel: () => void;
}

type Step = "loading" | "select" | "pin" | "error";

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function PinStepLock() {
  useKeypadLock();
  return null;
}

export default function UserSwitchModal({
  branchId,
  currentEmployeeId,
  onCancel,
}: UserSwitchModalProps) {
  const [step, setStep] = useState<Step>("loading");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accessKey, setAccessKey] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signing, setSigning] = useState(false);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/branches/${branchId}/switch-employees`);
        const data = await res.json();
        if (!res.ok) {
          setFetchError(data.error || "No se pudo cargar el listado.");
          setStep("error");
          return;
        }
        setAccessKey(data.accessKey);
        setEmployees(data.employees);
        setStep("select");
      } catch {
        setFetchError("Error de conexión.");
        setStep("error");
      }
    };
    void load();
  }, [branchId]);

  const handleSelect = (emp: Employee) => {
    void playAudio("/tap.wav", 0.4);
    setSelected(emp);
    setPin("");
    setLoginError("");
    setStep("pin");
  };

  const handleDigit = (d: string) => {
    void playAudio("/tap.wav", 0.4);
    if (pin.length < 6) setPin((p) => p + d);
  };

  const handleBackspace = () => {
    void playAudio("/tap.wav", 0.4);
    setPin((p) => p.slice(0, -1));
  };

  const handleConfirm = async () => {
    if (!selected || pin.length === 0 || signing) return;
    setSigning(true);
    setLoginError("");

    const result = await signIn("employee-login", {
      accessKey,
      employeeId: selected.id,
      pin,
      redirect: false,
    });

    if (result?.error) {
      void playAudio("/tap.wav", 0.4);
      setLoginError("PIN incorrecto. Intentá de nuevo.");
      setPin(""); // auto-borrar para reingreso inmediato
      setSigning(false);
    } else {
      // Forzar reload completo para que el layout del servidor refleje la nueva sesión
      window.location.assign(`/${branchId}/caja`);
    }
  };

  // Teclado físico — activo solo durante el ingreso de PIN
  useEffect(() => {
    if (step !== "pin") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (signing || e.ctrlKey || e.metaKey || e.altKey) return;

      const isDigit = /^[0-9]$/.test(e.key);
      const isNumpadDigit = e.code && e.code.startsWith("Numpad") && e.code.length === 7 && /^[0-9]$/.test(e.code[6]);

      if (isDigit || isNumpadDigit) {
        e.preventDefault();
        e.stopPropagation();
        handleDigit(isDigit ? e.key : e.code[6]);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        handleBackspace();
      } else if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setStep("select");
        setPin("");
        setLoginError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, signing]);

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);

  return (
    <ModalPortal>
      <div
        className="modal-overlay animate-fade-in"
        onClick={onCancel}
        style={{
          zIndex: 9999,
          alignItems: "flex-end",
          padding: "16px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="modal animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "6px" }}>🔄</div>
            <h2 style={{ fontSize: "18px", fontWeight: 800 }}>Cambiar usuario</h2>
            {step === "select" && (
              <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
                Seleccioná quién vas a usar el sistema
              </p>
            )}
            {step === "pin" && selected && (
              <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
                Ingresá el PIN de {selected.name}
              </p>
            )}
          </div>

          {/* Loading */}
          {step === "loading" && (
            <div style={{ textAlign: "center", color: "var(--text-3)", padding: "20px 0" }}>
              Cargando...
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ color: "var(--red)", fontSize: "14px" }}>{fetchError}</div>
              <button
                className="btn"
                style={{ marginTop: "16px" }}
                onClick={onCancel}
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Select employee */}
          {step === "select" && (
            <div style={{ display: "grid", gap: "8px" }}>
              {employees.map((emp) => {
                const isCurrent = emp.id === currentEmployeeId;
                return (
                  <button
                    key={emp.id}
                    onClick={() => !isCurrent && handleSelect(emp)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "16px",
                      border: isCurrent
                        ? "1px solid rgba(var(--primary-rgb), 0.4)"
                        : "1px solid var(--border)",
                      background: isCurrent
                        ? "rgba(var(--primary-rgb), 0.1)"
                        : "var(--surface-2)",
                      cursor: isCurrent ? "default" : "pointer",
                      color: "var(--text)",
                      textAlign: "left",
                      opacity: isCurrent ? 0.7 : 1,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "999px",
                        background: "linear-gradient(135deg, rgba(var(--primary-rgb), 0.22), rgba(var(--primary-rgb), 0.42))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: "13px",
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(emp.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "14px" }}>{emp.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        {isCurrent ? "Sesión activa" : emp.hasPin ? "Requiere PIN" : "Sin PIN"}
                      </div>
                    </div>
                    {!isCurrent && (
                      <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "18px" }}>›</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* PIN entry */}
          {step === "pin" && selected && (
            <>
              <PinStepLock />
              {/* Dots */}
              <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
                {dots.map((filled, i) => (
                  <div
                    key={i}
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: filled ? "var(--primary)" : "var(--border)",
                      transition: "background 0.15s",
                    }}
                  />
                ))}
              </div>

              {loginError && (
                <div style={{ color: "var(--red)", fontSize: "13px", textAlign: "center", fontWeight: 600 }}>
                  {loginError}
                </div>
              )}

              {/* Keypad */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDigit(d)}
                    style={{
                      padding: "16px",
                      fontSize: "22px",
                      fontWeight: 700,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      color: "var(--text)",
                    }}
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => { setStep("select"); setPin(""); setLoginError(""); }}
                  style={{ padding: "16px", fontSize: "13px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontWeight: 600 }}
                >
                  Volver
                </button>
                <button
                  onClick={() => handleDigit("0")}
                  style={{
                    padding: "16px",
                    fontSize: "22px",
                    fontWeight: 700,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    color: "var(--text)",
                  }}
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  style={{ padding: "16px", fontSize: "20px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}
                >
                  ⌫
                </button>
              </div>

              <button
                className="btn btn-green"
                style={{ width: "100%" }}
                onClick={handleConfirm}
                disabled={pin.length === 0 || signing}
              >
                {signing ? "Verificando..." : "Entrar"}
              </button>
            </>
          )}

          {/* Cancel — solo en select */}
          {step === "select" && (
            <button
              onClick={onCancel}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-3)",
                fontSize: "13px",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
