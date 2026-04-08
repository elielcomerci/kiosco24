"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import BrandLogo from "@/components/branding/BrandLogo";
import {
  BRANCH_ACCESS_KEY_PLACEHOLDER,
  isBranchAccessKey,
  normalizeBranchAccessKey,
} from "@/lib/branch-access-key";

const AUTH_TIMEOUT_MS = 15000;

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
  return normalizeBranchAccessKey(value);
}

export default function LoginExperience({
  initialMode = "owner",
  initialAccessKey = "",
}: LoginExperienceProps) {
  const [mode, setMode] = useState<LoginMode>(initialAccessKey ? "employee" : initialMode);
  const [loading, setLoading] = useState(false);
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
    setMode("owner");
    setError("");
    resetEmployeeFlow();
  };

  const switchToEmployeeMode = () => {
    setLoading(false);
    setMode("employee");
    setError("");
    resetEmployeeFlow(Boolean(initialAccessKey));
    if (initialAccessKey) {
      setBranchKey(normalizeAccessKey(initialAccessKey));
    }
  };

  const handleCredentialsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

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
        setError("Email o contrasena incorrectos.");
        setLoading(false);
        return;
      }

      window.location.assign(result?.url || "/");
    } catch (submitError) {
      console.error("[Login] Credentials sign-in failed:", submitError);
      setError(getAuthErrorMessage(submitError));
      setLoading(false);
    }
  };

  const handleValidateKey = useCallback(
    async (rawKey?: string) => {
      const normalizedKey = normalizeAccessKey(rawKey ?? branchKey);
      if (!normalizedKey) {
        return;
      }

      setLoading(true);
      setError("");
      setBranchKey(normalizedKey);

      try {
        const response = await withTimeout(
          fetch(`/api/branches/access-key/${encodeURIComponent(normalizedKey)}/employees`),
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(data.error || "Codigo de sucursal invalido.");
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
      } catch (validationError) {
        console.error("[Login] Employee branch validation failed:", validationError);
        setError(getAuthErrorMessage(validationError));
      } finally {
        setLoading(false);
      }
    },
    [branchKey],
  );

  useEffect(() => {
    const normalizedInitialKey = normalizeAccessKey(initialAccessKey);
    if (!normalizedInitialKey || !isBranchAccessKey(normalizedInitialKey)) {
      return;
    }

    if (autoKeyRef.current === normalizedInitialKey) {
      return;
    }

    autoKeyRef.current = normalizedInitialKey;
    setMode("employee");
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
    } catch (submitError) {
      console.error("[Login] Employee sign-in failed:", submitError);
      setError(getAuthErrorMessage(submitError));
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

  const handleEmployeeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    setLoading(true);
    setError("");
    await completeEmployeeLogin(selectedEmployee, pin);
  };

  const ownerHighlights = [
    "Entras y todo vuelve a estar a mano.",
    "Caja, stock y fiados listos para seguir.",
    "Tu negocio te espera con ritmo real.",
  ];

  const employeeHighlights = [
    "Cada persona entra con su identidad.",
    "El turno arranca claro desde el primer segundo.",
    "Rapido para el equipo, ordenado para el negocio.",
  ];

  const employeeStepMeta = {
    key: {
      badge: "Paso 1",
      title: "Identifica tu sucursal",
      text: "Ingresa el codigo que te compartio el responsable para entrar sin rodeos.",
    },
    employee: {
      badge: "Paso 2",
      title: "Elige quien entra",
      text: "Selecciona a la persona correcta para mantener la operacion ordenada.",
    },
    pin: {
      badge: "Paso 3",
      title: "Confirma tu identidad",
      text: "Tu PIN cierra el ingreso y te deja directo en caja.",
    },
  }[employeeStep];

  const currentHighlights = mode === "employee" ? employeeHighlights : ownerHighlights;

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "28px",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(14,165,233,.18), transparent 30%), radial-gradient(circle at bottom right, rgba(245,158,11,.15), transparent 24%), linear-gradient(180deg, #08111d 0%, #030712 46%, #020617 100%)",
      }}
    >
      <div
        style={{
          width: "min(1080px, 100%)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "22px",
          alignItems: "stretch",
        }}
      >
        <section
          className="card"
          style={{
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            justifyContent: "space-between",
            background:
              "linear-gradient(155deg, rgba(5,15,28,.96) 0%, rgba(11,31,52,.92) 52%, rgba(28,37,62,.9) 100%)",
            border: "1px solid rgba(148,163,184,.14)",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(14,165,233,.12)",
                border: "1px solid rgba(14,165,233,.22)",
                color: "#bae6fd",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Acceso Clikit
            </div>

            <BrandLogo tone="white" width={180} />

            <div style={{ display: "grid", gap: "12px" }}>
              <h1
                style={{
                  margin: 0,
                  color: "#f8fafc",
                  fontSize: "clamp(28px, 4vw, 42px)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.04em",
                }}
              >
                {mode === "employee"
                  ? "Tu equipo entra rapido, claro y con identidad."
                  : "Tu negocio te espera listo para seguir."}
              </h1>
              <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.7, fontSize: "15px" }}>
                {mode === "employee"
                  ? "Clikit lleva a cada persona a la sucursal correcta para que el turno empiece con claridad, confianza y sin rodeos."
                  : "Entra, retoma caja, stock y fiados, y sigue donde lo dejaste con una experiencia humana, agil y firme."}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {currentHighlights.map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  color: "#e2e8f0",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "#38bdf8", fontWeight: 900 }}>+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gap: "10px",
              padding: "16px",
              borderRadius: "18px",
              background: "rgba(15,23,42,.55)",
              border: "1px solid rgba(148,163,184,.14)",
            }}
          >
            <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 700 }}>
              {mode === "employee" ? "Acceso de equipo" : "Acceso principal"}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6 }}>
              {mode === "employee"
                ? "Codigo de sucursal, persona y PIN si hace falta. Rapido y ordenado."
                : "Email, contrasena y adentro. Claro, directo y sin frialdad."}
            </div>
          </div>
        </section>

        <section
          className="card"
          style={{
            padding: "32px",
            display: "grid",
            gap: "22px",
            border: "1px solid rgba(148,163,184,.14)",
            background: "rgba(2, 6, 23, 0.9)",
          }}
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "8px",
                padding: "6px",
                borderRadius: "18px",
                background: "rgba(15,23,42,.72)",
                border: "1px solid rgba(148,163,184,.14)",
              }}
            >
              <button
                type="button"
                className={`btn ${mode === "owner" ? "btn-primary" : "btn-ghost"}`}
                onClick={switchToOwnerMode}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Dueno
              </button>
              <button
                type="button"
                className={`btn ${mode === "employee" ? "btn-primary" : "btn-ghost"}`}
                onClick={switchToEmployeeMode}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Equipo
              </button>
            </div>

            <div>
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "26px", fontWeight: 800 }}>
                {mode === "employee" ? employeeStepMeta.title : "Entrar a Clikit"}
              </h2>
              <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: "14px", lineHeight: 1.6 }}>
                {mode === "employee" ? employeeStepMeta.text : "Volvamos a poner tu negocio en marcha."}
              </p>
            </div>
          </div>

          {error ? (
            <div
              style={{
                color: "#fecaca",
                background: "rgba(239,68,68,.12)",
                border: "1px solid rgba(239,68,68,.22)",
                borderRadius: "14px",
                padding: "12px 14px",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          ) : null}

          {mode === "employee" ? (
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(56,189,248,.12)",
                  border: "1px solid rgba(56,189,248,.22)",
                  color: "#bae6fd",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                {employeeStepMeta.badge}
              </div>

              {employeeStep === "key" ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(15,23,42,.72)",
                      border: "1px solid rgba(148,163,184,.14)",
                      color: "#cbd5e1",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    Usa el codigo que te compartio el responsable o entra desde el enlace directo de tu sucursal.
                  </div>

                  <div style={{ display: "grid", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                      Codigo de sucursal
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={branchKey}
                      onChange={(event) => setBranchKey(event.target.value.toUpperCase())}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleValidateKey();
                        }
                      }}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={`Ej: ${BRANCH_ACCESS_KEY_PLACEHOLDER}`}
                      style={{
                        textAlign: "center",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={() => void handleValidateKey()}
                    disabled={loading || !branchKey.trim()}
                  >
                    {loading ? "Validando..." : "Continuar"}
                  </button>
                </div>
              ) : null}

              {employeeStep === "employee" ? (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      background: "rgba(15,23,42,.72)",
                      border: "1px solid rgba(148,163,184,.14)",
                      display: "grid",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "#94a3b8",
                      }}
                    >
                      Sucursal autorizada
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc" }}>{branchName}</div>
                    <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                      Elige quien entra para seguir con la operacion correcta.
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                    {branchEmployees.map((employee) => (
                      <button
                        key={employee.id}
                        className="btn btn-ghost"
                        onClick={() => void handleEmployeeSelect(employee)}
                        disabled={loading}
                        style={{
                          minHeight: "96px",
                          padding: "14px 12px",
                          flexDirection: "column",
                          gap: "8px",
                          background: "rgba(15,23,42,.62)",
                          border: "1px solid rgba(148,163,184,.14)",
                        }}
                      >
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "999px",
                            background: "linear-gradient(135deg, #38bdf8 0%, #f59e0b 100%)",
                            color: "#020617",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                          }}
                        >
                          {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 700 }}>{employee.name}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                          {employee.hasPin ? "Requiere PIN" : "Ingreso directo"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    className="btn btn-ghost btn-full"
                    onClick={() => {
                      setError("");
                      setEmployeeStep("key");
                      setSelectedEmployee(null);
                      setPin("");
                    }}
                  >
                    Cambiar codigo
                  </button>
                </div>
              ) : null}

              {employeeStep === "pin" && selectedEmployee ? (
                <form onSubmit={handleEmployeeSubmit} style={{ display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      padding: "18px",
                      borderRadius: "18px",
                      background: "rgba(15,23,42,.72)",
                      border: "1px solid rgba(148,163,184,.14)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "999px",
                        background: "linear-gradient(135deg, #38bdf8 0%, #f59e0b 100%)",
                        color: "#020617",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        margin: "0 auto 10px",
                      }}
                    >
                      {selectedEmployee.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 800, color: "#f8fafc" }}>{selectedEmployee.name}</div>
                    <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px" }}>
                      Ingresa tu PIN para terminar el acceso.
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                      PIN
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="input"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="PIN"
                      autoFocus
                      style={{ textAlign: "center", letterSpacing: "0.45em", fontSize: "20px" }}
                    />
                  </div>

                  <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={loading || !pin}>
                    {loading ? "Entrando..." : "Entrar al turno"}
                  </button>

                  <button
                    className="btn btn-ghost btn-full"
                    type="button"
                    onClick={() => {
                      setError("");
                      setEmployeeStep("employee");
                      setPin("");
                    }}
                  >
                    Elegir otra persona
                  </button>
                </form>
              ) : null}

              <button
                className="btn btn-ghost btn-full"
                onClick={switchToOwnerMode}
                disabled={loading}
                style={{ color: "var(--primary)", fontWeight: 700 }}
              >
                Volver al acceso principal
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "16px",
                  borderRadius: "18px",
                  background: "rgba(56,189,248,.08)",
                  border: "1px solid rgba(56,189,248,.18)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "#bae6fd",
                  }}
                >
                  Alta nueva
                </div>
                <div style={{ fontSize: "14px", color: "#e2e8f0", lineHeight: 1.6 }}>
                  Si todavia no tienes cuenta, crea tu negocio y empieza con una experiencia pensada para vender de verdad.
                </div>
                <Link href="/register" className="btn btn-primary btn-full" style={{ textDecoration: "none" }}>
                  Crear mi cuenta
                </Link>
              </div>

              <form onSubmit={handleCredentialsSubmit} style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>Email</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="vos@negocio.com"
                  />
                </div>

                <div style={{ display: "grid", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                    Contrasena
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      className="input"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="Tu contrasena"
                      style={{ paddingRight: "48px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-3)",
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 700,
                      }}
                    >
                      {showPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar a Clikit"}
                </button>
              </form>

              <a
                href="/reset-password"
                style={{
                  fontSize: "13px",
                  color: "var(--text-3)",
                  textDecoration: "underline",
                  textAlign: "center",
                }}
              >
                Olvide mi contrasena
              </a>

              <button
                className="btn btn-ghost btn-full"
                onClick={switchToEmployeeMode}
                disabled={loading}
                style={{ color: "var(--primary)", fontWeight: 700 }}
              >
                Entrar como equipo
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
