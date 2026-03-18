"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Employee Flow State
  const [isEmployeeFlow, setIsEmployeeFlow] = useState(false);
  const [employeeStep, setEmployeeStep] = useState(1); // 1: Key, 2: Selection, 3: PIN
  const [branchKey, setBranchKey] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [branchEmployees, setBranchEmployees] = useState<any[]>([]);
  const [branchName, setBranchName] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isRegister) {
      // Registro
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Error al registrarse");
          setLoading(false);
          return;
        }

        // Login automático tras registro
        await signIn("credentials", {
          email,
          password,
          callbackUrl: "/",
        });
      } catch (err) {
        setError("Error de conexión");
        setLoading(false);
      }
    } else {
      // Login
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email o contraseña incorrectos");
        setLoading(false);
      } else {
        window.location.href = "/";
      }
    }
  };

  const handleValidateKey = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/branches/access-key/${branchKey}/employees`);
      if (!res.ok) {
        setError("Código de sucursal inválido");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setBranchEmployees(data.employees);
      setBranchName(data.branchName);
      setEmployeeStep(2);
    } catch (err) {
      setError("Error al conectar con la sucursal");
    }
    setLoading(false);
  };

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("employee-login", {
      accessKey: branchKey,
      employeeId: selectedEmployee.id,
      pin: pin,
      redirect: false,
    });

    if (result?.error) {
      setError("PIN incorrecto o empleado no autorizado");
      setLoading(false);
    } else {
      window.location.href = `/${branchKey}/caja`; // Redirect using accessKey could be tricky, better use result URL if possible or just "/"
      // Wait, let's just go to "/" and let the layout redirect
      window.location.href = "/";
    }
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
      {/* Logo / Brand */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "48px",
            marginBottom: "12px",
            filter: "drop-shadow(0 0 20px rgba(34,197,94,0.3))",
          }}
        >
          🏪
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
          Sabé exactamente cuánto ganaste hoy.
        </p>
      </div>

      {/* Login box */}
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
            {isRegister ? "Crear cuenta" : "Entrar al sistema"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
            14 días gratis, sin tarjeta.
          </p>
        </div>

        {error && (
          <div style={{
            color: "#ef4444",
            fontSize: "13px",
            background: "rgba(239, 68, 68, 0.1)",
            padding: "10px",
            borderRadius: "8px",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        {isEmployeeFlow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {employeeStep === 1 && (
              <>
                <p style={{ fontSize: "13px", color: "var(--text-2)", textAlign: "center" }}>
                  Ingresá el código de acceso de tu sucursal
                </p>
                <input
                  type="text"
                  placeholder="Ej: KIOSCO-XXXX-XXXX"
                  className="input"
                  value={branchKey}
                  onChange={(e) => setBranchKey(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleValidateKey()}
                  style={{ textAlign: "center", textTransform: "uppercase", letterSpacing: "1px" }}
                />
                <button className="btn btn-primary" onClick={handleValidateKey} disabled={loading || !branchKey}>
                  {loading ? "Validando..." : "Siguiente ›"}
                </button>
              </>
            )}

            {employeeStep === 2 && (
              <>
                <p style={{ fontSize: "13px", color: "var(--text-2)", textAlign: "center" }}>
                  Hola! Quién sos? en <strong>{branchName}</strong>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", maxHeight: "200px", overflowY: "auto", padding: "4px" }}>
                  {branchEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      className="btn btn-ghost"
                      onClick={() => { setSelectedEmployee(emp); setEmployeeStep(3); }}
                      style={{ height: "auto", padding: "12px 8px", flexDirection: "column", gap: "4px", background: "var(--surface-2)" }}
                    >
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "black", fontWeight: 800 }}>
                        {emp.name.charAt(0)}
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>{emp.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
                <button className="btn-ghost" onClick={() => setEmployeeStep(1)} style={{ fontSize: "12px" }}>
                  ‹ Cambiar Sucursal
                </button>
              </>
            )}

            {employeeStep === 3 && (
              <form onSubmit={handleEmployeeLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "black", fontWeight: 800, margin: "0 auto 8px" }}>
                    {selectedEmployee.name.charAt(0)}
                  </div>
                  <p style={{ fontWeight: 700 }}>{selectedEmployee.name}</p>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Ingresá tu PIN"
                  className="input"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  style={{ textAlign: "center", letterSpacing: "0.5em", fontSize: "20px" }}
                />
                <button className="btn btn-primary" type="submit" disabled={loading || !pin}>
                  {loading ? "Entrando..." : "Entrar ›"}
                </button>
                <button className="btn-ghost" type="button" onClick={() => { setEmployeeStep(2); setPin(""); }} style={{ fontSize: "12px" }}>
                  ‹ No soy yo
                </button>
              </form>
            )}
          </div>
        ) : (
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
                placeholder="Contraseña"
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
                  justifyContent: "center"
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
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? "Cargando..." : (isRegister ? "Registrarse" : "Ingresar")}
            </button>
          </form>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "5px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>O</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }}></div>
        </div>

        <button
          className="btn btn-secondary btn-full"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{ gap: "12px", fontSize: "14px" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google
        </button>
        <button
          className="btn-ghost"
          onClick={() => setIsRegister(!isRegister)}
          style={{ fontSize: "14px", color: "var(--text-3)" }}
        >
          {isRegister ? "¿Ya tenés cuenta? Ingresá" : "¿No tenés cuenta? Registrate"}
        </button>

        <button
          className="btn-ghost"
          onClick={() => {
            setIsEmployeeFlow(!isEmployeeFlow);
            setError("");
          }}
          style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary)", marginTop: "10px" }}
        >
          {isEmployeeFlow ? "‹ Volver a Dueño" : "👤 Soy Empleado"}
        </button>
      </div>

      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
        $9.900/mes después de la prueba
      </p>
    </div>
  );
}
