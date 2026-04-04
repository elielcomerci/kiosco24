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
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PROMO_LABEL,
} from "@/lib/subscription-plan";

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
    return "El alta tardó demasiado en responder. Reintentá en unos segundos.";
  }

  return "No pudimos crear tu cuenta ahora. Reintentá en unos segundos.";
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

      const callbackUrl = typeof data.branchId === "string" ? `/${data.branchId}/productos` : "/";
      const result = await withTimeout(
        signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl,
        }),
      );

      if (result?.error) {
        setError("La cuenta se creó, pero no pudimos iniciar sesión automáticamente.");
        setLoading(false);
        return;
      }

      window.location.assign(result?.url || callbackUrl);
    } catch (submitError) {
      console.error("[Register] Registration failed:", submitError);
      setError(getRegisterErrorMessage(submitError));
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "28px",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(143,102,255,.18), transparent 28%), radial-gradient(circle at bottom right, rgba(34,197,94,.12), transparent 26%), linear-gradient(180deg, #07111f 0%, #030712 45%, #020617 100%)",
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
              "linear-gradient(160deg, rgba(8,15,31,.94) 0%, rgba(11,20,43,.9) 55%, rgba(24,24,63,.88) 100%)",
            border: "1px solid rgba(148,163,184,.14)",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
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
                Creá tu cuenta con identidad real desde el primer minuto.
              </h1>
              <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.7, fontSize: "15px" }}>
                Nombre, negocio y rubro quedan listos desde el alta para que Clikit pueda
                acompañarte con un tono más humano y preparar el camino a nuevos tipos de comercio.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {[
              "Tu negocio nace creado junto con la cuenta, sin pasar por un alta improvisada después.",
              "Para rubros tipo kiosco cargamos una base inicial; para el resto arrancás limpio, sin ruido.",
              "Más adelante vas a completar CUIT/CUIL/DNI, dirección, ciudad y teléfono desde tu perfil.",
            ].map((item) => (
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
                <span style={{ color: "#8f66ff", fontWeight: 900 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: 1.6 }}>
            {SUBSCRIPTION_PROMO_LABEL} {SUBSCRIPTION_CANCEL_LABEL}
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
          <div style={{ display: "grid", gap: "8px" }}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(143,102,255,.14)",
                border: "1px solid rgba(143,102,255,.24)",
                color: "#d8ccff",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Alta nueva
            </div>
            <div>
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "26px", fontWeight: 800 }}>
                Crear cuenta
              </h2>
              <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: "14px", lineHeight: 1.6 }}>
                Te pedimos sólo lo necesario para dejar tu negocio listo y poder hablarte por tu nombre.
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
                  onChange={(e) => setFirstName(e.target.value)}
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
                  onChange={(e) => setLastName(e.target.value)}
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
                onChange={(e) => setBusinessName(e.target.value)}
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
                onChange={(e) => setMainBusinessActivity(e.target.value)}
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
                    ? "Te dejamos una base inicial lista para empezar más rápido."
                    : "Arrancás con estructura limpia para adaptarlo a tu rubro."}
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="vos@negocio.com"
                required
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 700 }}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              {loading ? "Creando cuenta..." : "Crear mi cuenta"}
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
  );
}
