"use client";

import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PROMO_LABEL,
} from "@/lib/subscription-plan";

const AUTH_TIMEOUT_MS = 15000;
const ACCESS_KEY_RE = /^KIOSCO-[A-Z0-9]{8}-[A-Z0-9]{8}$/;

export type LoginMode = "owner" | "employee";
type EmployeeStep = "key" | "employee" | "pin";

interface EmployeeOption {
  id: string;
  name: string;
  hasPin: boolean;
}

type LoginExperienceProps = {
  initialMode?: LoginMode;
  initialAccessKey?: string;
  initialRegister?: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("AUTH_TIMEOUT"));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "AUTH_TIMEOUT") {
    return "El login tardo demasiado en responder. Reintenta en unos segundos.";
  }

  return "No se pudo completar el inicio de sesion. Reintenta en unos segundos.";
}

function normalizeAccessKey(value: string) {
  return value.trim().toUpperCase();
}

export default function LoginExperience({
  initialMode = "owner",
  initialAccessKey = "",
  initialRegister = false,
}: LoginExperienceProps) {
  const [mode, setMode] = useState<LoginMode>(initialAccessKey ? "employee" : initialMode);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(initialRegister);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [employeeStep, setEmployeeStep] = useState<EmployeeStep>("key");
  const [branchKey, setBranchKey] = useState(normalizeAccessKey(initialAccessKey));
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [branchEmployees, setBranchEmployees] = useState<EmployeeOption[]>([]);
  const [branchName, setBranchName] = useState("");
  const [pin, setPin] = useState("");

  const autoKeyRef = useRef<string | null>(null);

  const resetEmployeeFlow = (keepBranchKey = false) => {
    setEmployeeStep("key");
    setSelectedBranchId("");
    setSelectedEmployee(null);
    setBranchEmployees([]);
    setBranchName("");
    setPin("");
    if (!keepBranchKey) {
      setBranchKey("");
    }
  };

  const switchToOwnerMode = () => {
    setLoading(false);
    setIsRegister(false);
    setMode("owner");
    setError("");
    resetEmployeeFlow();
  };

  const switchToEmployeeMode = () => {
    setLoading(false);
    setIsRegister(false);
    setMode("employee");
    setError("");
    resetEmployeeFlow(Boolean(initialAccessKey));
    if (initialAccessKey) {
      setBranchKey(normalizeAccessKey(initialAccessKey));
    }
  };

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isRegister) {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || "Error al registrarse");
          setLoading(false);
          return;
        }

        const result = await withTimeout(
          signIn("credentials", {
            email,
            password,
            redirect: false,
            callbackUrl: "/",
          }),
        );

        if (result?.error) {
          setError("No se pudo iniciar sesion despues del registro.");
          setLoading(false);
          return;
        }

        window.location.assign(result?.url || "/");
        return;
      } catch (error) {
        console.error("[Login] Registration sign-in failed:", error);
        setError(getAuthErrorMessage(error));
        setLoading(false);
        return;
      }
    }

    try {
      const result = await withTimeout(
        signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl: "/",
        }),
      );

      if (result?.error) {
        setError("Email o contrasena incorrectos");
        setLoading(false);
        return;
      }

      window.location.assign(result?.url || "/");
    } catch (error) {
      console.error("[Login] Credentials sign-in failed:", error);
      setError(getAuthErrorMessage(error));
      setLoading(false);
    }
  };

  const handleValidateKey = useCallback(async (rawKey?: string) => {
    const normalizedKey = normalizeAccessKey(rawKey ?? branchKey);
    if (!normalizedKey) {
      return;
    }

    setLoading(true);
    setError("");
    setBranchKey(normalizedKey);

    try {
      const res = await withTimeout(fetch(`/api/branches/access-key/${encodeURIComponent(normalizedKey)}/employees`));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Codigo de sucursal invalido");
        setLoading(false);
        return;
      }

      const employees = Array.isArray(data.employees) ? (data.employees as EmployeeOption[]) : [];
      if (employees.length === 0) {
        setError("No hay empleados habilitados para este codigo.");
        setLoading(false);
        return;
      }

      setSelectedBranchId(typeof data.branchId === "string" ? data.branchId : "");
      setBranchName(typeof data.branchName === "string" ? data.branchName : "");
      setBranchEmployees(employees);
      setSelectedEmployee(null);
      setPin("");
      setEmployeeStep("employee");
    } catch (error) {
      console.error("[Login] Employee branch validation failed:", error);
      setError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [branchKey]);

  useEffect(() => {
    const normalizedInitialKey = normalizeAccessKey(initialAccessKey);
    if (!normalizedInitialKey || !ACCESS_KEY_RE.test(normalizedInitialKey)) {
      return;
    }

    if (autoKeyRef.current === normalizedInitialKey) {
      return;
    }

    autoKeyRef.current = normalizedInitialKey;
    setMode("employee");
    setIsRegister(false);
    setError("");
    resetEmployeeFlow(true);
    setBranchKey(normalizedInitialKey);
    void handleValidateKey(normalizedInitialKey);
  }, [handleValidateKey, initialAccessKey]);

  const completeEmployeeLogin = async (employee: EmployeeOption, pinValue: string) => {
    try {
      const result = await withTimeout(
        signIn("employee-login", {
          accessKey: normalizeAccessKey(branchKey),
          employeeId: employee.id,
          pin: pinValue,
          redirect: false,
          callbackUrl: "/",
        }),
      );

      if (result?.error) {
        setError("PIN incorrecto o empleado no autorizado.");
        setLoading(false);
        return;
      }

      window.location.assign(selectedBranchId ? `/${selectedBranchId}/caja` : result?.url || "/");
    } catch (error) {
      console.error("[Login] Employee sign-in failed:", error);
      setError(getAuthErrorMessage(error));
      setLoading(false);
    }
  };

  const handleEmployeeSelect = async (employee: EmployeeOption) => {
    setSelectedEmployee(employee);
    setError("");
    setPin("");

    if (employee.hasPin) {
      setEmployeeStep("pin");
      return;
    }

    setLoading(true);
    await completeEmployeeLogin(employee, "");
  };

  const handleEmployeeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    setLoading(true);
    setError("");
    await completeEmployeeLogin(selectedEmployee, pin);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "40px",
        background: "var(--bg)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "48px",
            marginBottom: "12px",
            filter: "drop-shadow(0 0 20px rgba(34,197,94,0.3))",
          }}
        >
          {"\uD83C\uDFEA"}
        </div>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            marginBottom: "8px",
          }}
        >
          Kiosco 24h
        </h1>
        <p
          style={{
            fontSize: "15px",
            color: "var(--text-2)",
            fontWeight: 400,
          }}
        >
          Sabe exactamente cuanto ganaste hoy.
        </p>
      </div>

      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "360px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "6px",
            }}
          >
            {mode === "employee" ? "Acceso de empleado" : isRegister ? "Crear cuenta" : "Entrar al sistema"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
            {mode === "employee"
              ? "Entrá con el codigo de tu sucursal y tu identidad."
              : isRegister
                ? "Crea tu cuenta y arranca en minutos."
                : "Ingresa a tu kiosco."}
          </p>
        </div>

        {error && (
          <div
            style={{
              color: "#ef4444",
              fontSize: "13px",
              background: "rgba(239, 68, 68, 0.1)",
              padding: "10px",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {mode === "employee" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {employeeStep === "key" && (
              <>
                <p style={{ fontSize: "13px", color: "var(--text-2)", textAlign: "center" }}>
                  Ingresá el código o abrí el enlace que te compartió el responsable del kiosco.
                </p>
                <input
                  type="text"
                  placeholder="Ej: KIOSCO-AB12CD34-EF56GH78"
                  className="input"
                  value={branchKey}
                  onChange={(e) => setBranchKey(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleValidateKey();
                    }
                  }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "0.06em" }}
                />
                <button className="btn btn-primary btn-full" onClick={() => void handleValidateKey()} disabled={loading || !branchKey.trim()}>
                  {loading ? "Validando..." : "Continuar"}
                </button>
              </>
            )}

            {employeeStep === "employee" && (
              <>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "4px" }}>
                    Sucursal autorizada
                  </p>
                  <div style={{ fontWeight: 700 }}>{branchName}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {branchEmployees.map((employee) => (
                    <button
                      key={employee.id}
                      className="btn btn-ghost"
                      onClick={() => void handleEmployeeSelect(employee)}
                      disabled={loading}
                      style={{
                        minHeight: "88px",
                        padding: "12px 10px",
                        flexDirection: "column",
                        gap: "6px",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "999px",
                          background: "var(--primary)",
                          color: "black",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                        }}
                      >
                        {employee.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 700 }}>{employee.name}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {employee.hasPin ? "Requiere PIN" : "Entrar directo"}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  className="btn-ghost"
                  onClick={() => {
                    setError("");
                    setEmployeeStep("key");
                    setSelectedEmployee(null);
                    setPin("");
                  }}
                  style={{ fontSize: "13px", color: "var(--text-3)" }}
                >
                  Cambiar codigo
                </button>
              </>
            )}

            {employeeStep === "pin" && selectedEmployee && (
              <form onSubmit={handleEmployeeSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "999px",
                      background: "var(--primary)",
                      color: "black",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      margin: "0 auto 8px",
                    }}
                  >
                    {selectedEmployee.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 700 }}>{selectedEmployee.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                    Ingresá tu PIN para continuar.
                  </div>
                </div>

                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="PIN"
                  className="input"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  style={{ textAlign: "center", letterSpacing: "0.45em", fontSize: "20px" }}
                />

                <button className="btn btn-primary btn-full" type="submit" disabled={loading || !pin}>
                  {loading ? "Entrando..." : "Entrar"}
                </button>

                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    setError("");
                    setEmployeeStep("employee");
                    setPin("");
                  }}
                  style={{ fontSize: "13px", color: "var(--text-3)" }}
                >
                  Elegir otro empleado
                </button>
              </form>
            )}

            <button
              className="btn-ghost"
              onClick={switchToOwnerMode}
              disabled={loading}
              style={{ fontSize: "14px", color: "var(--primary)", fontWeight: 700 }}
            >
              Volver al acceso principal
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                type="button"
                className={`btn btn-sm ${isRegister ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setIsRegister(true)}
                disabled={loading}
              >
                Crear cuenta
              </button>
              <button
                type="button"
                className={`btn btn-sm ${isRegister ? "btn-ghost" : "btn-primary"}`}
                onClick={() => setIsRegister(false)}
                disabled={loading}
              >
                Ya tengo cuenta
              </button>
            </div>

            <form onSubmit={handleCredentialsSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="email"
                placeholder="Email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Contrasena"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88l-3.29-3.29m7.53.61A10 10 0 0 1 21.84 12a11.59 11.59 0 0 1-3.69 4.39M15 15a3 3 0 0 1-3-3l6-6" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.12 13.12 0 0 1-1.55 2.35m-5.32 1.93A10.43 10.43 0 0 1 12 19c-7 0-10-7-10-7a13.12 13.12 0 0 1 1.55-2.35" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? "Cargando..." : isRegister ? "Registrarse" : "Ingresar"}
              </button>
            </form>

            <button
              className="btn-ghost"
              onClick={switchToEmployeeMode}
              disabled={loading}
              style={{ fontSize: "14px", color: "var(--primary)", fontWeight: 700 }}
            >
              Soy Empleado
            </button>
          </>
        )}
      </div>

      {mode !== "employee" && isRegister && (
        <p style={{ fontSize: "13px", color: "var(--text-3)", textAlign: "center", maxWidth: "320px" }}>
          {SUBSCRIPTION_PROMO_LABEL} {SUBSCRIPTION_CANCEL_LABEL}
        </p>
      )}
    </div>
  );
}
