"use client";

import { useSearchParams } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = "request" | "check-email" | "reset";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token");

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (tokenFromUrl) {
      setStep("reset");
    }
  }, [tokenFromUrl]);

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al solicitar recuperación");
        setLoading(false);
        return;
      }

      setStep("check-email");
    } catch (error) {
      console.error("[Reset] Request failed:", error);
      setError("Error de conexión. Reintenta.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cambiar contraseña");
        setLoading(false);
        return;
      }

      setSuccess("Contraseña actualizada correctamente. Redirigiendo al login...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      console.error("[Reset] Reset failed:", error);
      setError("Error de conexión. Reintenta.");
    } finally {
      setLoading(false);
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
        background: "var(--bg)",
      }}
    >
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
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "12px",
              filter: "drop-shadow(0 0 20px rgba(34,197,94,0.3))",
            }}
          >
            {"\uD83D\uDD11"}
          </div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: "8px",
            }}
          >
            {step === "request" && "Recuperar contraseña"}
            {step === "check-email" && "Revisa tu email"}
            {step === "reset" && "Nueva contraseña"}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
            {step === "request" && "Ingresa tu email para recibir un enlace de recuperación."}
            {step === "check-email" && "Te enviamos un enlace a tu email. Revisa tu bandeja de entrada."}
            {step === "reset" && "Crea una nueva contraseña para tu cuenta."}
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

        {success && (
          <div
            style={{
              color: "#22c55e",
              fontSize: "13px",
              background: "rgba(34, 197, 94, 0.1)",
              padding: "10px",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            {success}
          </div>
        )}

        {step === "request" && (
          <form onSubmit={handleRequestReset} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="email"
              placeholder="Email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/login")}
              disabled={loading}
              style={{ fontSize: "14px", color: "var(--text-3)" }}
            >
              Volver al login
            </button>
          </form>
        )}

        {step === "check-email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "16px",
                background: "rgba(34, 197, 94, 0.1)",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "14px", color: "var(--text)", marginBottom: "8px" }}>
                Email enviado a:
              </p>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--primary)" }}>{email}</p>
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => setStep("request")}
              disabled={loading}
            >
              Intentar con otro email
            </button>
            <button
              className="btn-ghost"
              onClick={() => router.push("/login")}
              disabled={loading}
              style={{ fontSize: "14px", color: "var(--text-3)" }}
            >
              Volver al login
            </button>
          </div>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                placeholder="Nueva contraseña"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                placeholder="Confirmar contraseña"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading || !password || !confirmPassword}>
              {loading ? "Guardando..." : "Cambiar contraseña"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/login")}
              disabled={loading}
              style={{ fontSize: "14px", color: "var(--text-3)" }}
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
