"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useMemo, useState, type FormEvent } from "react";

import BrandLogo from "@/components/branding/BrandLogo";
import {
  DEFAULT_BUSINESS_ACTIVITY_CODE,
  getBusinessActivityOptionFromList,
  type BusinessActivityOption,
} from "@/lib/business-activities";

const AUTH_TIMEOUT_MS = 15000;

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

function getRegisterErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "AUTH_TIMEOUT") {
    return "El alta tardo demasiado en responder. Reintenta en unos segundos.";
  }

  return "No pudimos crear tu cuenta ahora. Reintenta en unos segundos.";
}

export default function RegisterExperience({
  businessActivities,
}: {
  businessActivities: BusinessActivityOption[];
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [mainBusinessActivity, setMainBusinessActivity] = useState(
    businessActivities[0]?.value ?? DEFAULT_BUSINESS_ACTIVITY_CODE,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedActivity = useMemo(
    () => getBusinessActivityOptionFromList(businessActivities, mainBusinessActivity),
    [businessActivities, mainBusinessActivity],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          businessName,
          mainBusinessActivity,
          email,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "No pudimos crear la cuenta.");
        setLoading(false);
        return;
      }

      const callbackUrl =
        typeof data.branchId === "string"
          ? `/${data.branchId}/productos`
          : "/";
      const result = await withTimeout(
        signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl,
        }),
      );

      if (result?.error) {
        setError("La cuenta se creo, pero no pudimos iniciar sesion automaticamente.");
        setLoading(false);
        return;
      }

      window.location.assign(callbackUrl);
    } catch (submitError) {
      console.error("[Register] Registration failed:", submitError);
      setError(getRegisterErrorMessage(submitError));
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
        .auth-scope { font-family: 'Instrument Sans', sans-serif; }
        .auth-scope h1, .auth-scope h2 { font-family: 'Bricolage Grotesque', sans-serif; letter-spacing: -0.04em; }
        .auth-scope .input { font-family: 'Instrument Sans', sans-serif; background: #0e1420; border: 1px solid rgba(255,255,255,0.07); color: #eef2f7; }
        .auth-scope .input::placeholder { color: #6b7e96; }
        .auth-scope .input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.12); }
        .auth-scope .btn { font-family: 'Instrument Sans', sans-serif; }
        .auth-scope .btn-primary { background: #f5a623; color: #1a0f00; font-weight: 700; }
        .auth-scope .btn-primary:hover { background: #f9b840; }
        .auth-scope .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.13); color: #8fa3ba; }
        .auth-scope .btn-ghost:hover { border-color: rgba(255,255,255,0.22); color: #eef2f7; }
      `}} />
    <div
      className="auth-scope"
      style={{
        minHeight: "100dvh",
        padding: "28px",
        display: "grid",
        placeItems: "center",
        background: "#06080d",
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
            gap: "22px",
            justifyContent: "space-between",
            background:
              "#0e1420",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(245,166,35,0.11)",
                border: "1px solid rgba(245,166,35,0.28)",
                color: "#f5a623",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Empezar bien
            </div>

            <BrandLogo tone="white" width={180} />

            <div style={{ display: "grid", gap: "12px" }}>
              <h1
                style={{
                  margin: 0,
                  color: "#eef2f7",
                  fontSize: "clamp(28px, 4vw, 42px)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.04em",
                  fontFamily: "'Bricolage Grotesque',sans-serif",
                }}
              >
                Tu cuenta nace con nombre, negocio y rumbo desde el primer minuto.
              </h1>
              <p style={{ margin: 0, color: "#8fa3ba", lineHeight: 1.7, fontSize: "15px" }}>
                Te pedimos muy poco, pero lo justo para recibirte por tu nombre y dejar tu negocio
                bien encaminado desde el inicio.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {[
              "Tu cuenta y tu negocio quedan creados juntos, listos para arrancar con orden.",
              "Cuando suma, te dejamos una base inicial para ganar tiempo desde el primer día.",
              "Después podés completar CUIT/CUIL/DNI, dirección, ciudad y teléfono desde tu perfil.",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  color: "#eef2f7",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "#f5a623", fontWeight: 900 }}>+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ color: "#6b7e96", fontSize: "12px", lineHeight: 1.6 }}>
            Al entrar, te vamos a ofrecer activar tu cuenta o seguir preparando todo con calma antes
            de empezar a operar.
          </div>
        </section>

        <section
          className="card"
          style={{
            padding: "32px",
            display: "grid",
            gap: "22px",
            border: "1px solid rgba(255,255,255,0.07)",
            background: "#131b2a",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(245,166,35,0.11)",
                border: "1px solid rgba(245,166,35,0.28)",
                color: "#f5a623",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Alta nueva
            </div>
            <div>
              <h2 style={{ margin: 0, color: "#eef2f7", fontSize: "26px", fontWeight: 800 }}>
                Crear tu cuenta
              </h2>
              <p style={{ margin: "8px 0 0", color: "#6b7e96", fontSize: "14px", lineHeight: 1.6 }}>
                Solo lo necesario para dejar tu negocio listo y hablarte como corresponde.
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

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>Nombre</label>
                <input
                  type="text"
                  className="input"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  placeholder="Ej: Martina"
                  required
                />
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>Apellido</label>
                <input
                  type="text"
                  className="input"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  placeholder="Ej: Pérez"
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                Nombre del negocio
              </label>
              <input
                type="text"
                className="input"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                autoComplete="organization"
                placeholder="Ej: Clásico 24, Almacén del Centro"
                required
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                Rubro principal
              </label>
              <select
                className="input"
                value={mainBusinessActivity}
                onChange={(event) => setMainBusinessActivity(event.target.value)}
                required
              >
                {businessActivities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedActivity ? (
                <div style={{ fontSize: "12px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  {selectedActivity.description}{" "}
                  {selectedActivity.seedDefaultCatalog
                    ? "Te dejamos una base inicial lista para ganar tiempo desde el primer día."
                    : "Empiezas con una estructura limpia para acomodarlo a tu manera."}
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="vos@negocio.com"
                required
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
                  autoComplete="new-password"
                  placeholder="Al menos 8 caracteres"
                  minLength={8}
                  required
                  style={{ paddingRight: "48px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
                  }}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? "Creando tu cuenta..." : "Crear mi cuenta en Clikit"}
            </button>
          </form>

          <div style={{ display: "grid", gap: "10px", justifyItems: "center" }}>
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "13px", textAlign: "center" }}>
              ¿Ya tenés cuenta?
            </p>
            <Link href="/login" className="btn btn-ghost btn-full" style={{ textDecoration: "none" }}>
              Ir al login
            </Link>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
