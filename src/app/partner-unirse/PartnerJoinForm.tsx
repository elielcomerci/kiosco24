"use client";

import { useState, type FormEvent } from "react";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 20);
}

export default function PartnerJoinForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [referrerSlug, setReferrerSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ referralCode: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 8) {
      setError("La contraseña tiene al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    if (customSlug) {
      const slug = slugify(customSlug);
      if (slug.length < 3) {
        setError("El slug debe tener al menos 3 caracteres.");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/partner/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          password,
          customSlug,
          referrerSlug,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No pudimos registrar tu solicitud. Reintenta.");
        setLoading(false);
        return;
      }

      setSuccess({ referralCode: data.referralCode });
    } catch {
      setError("Error de conexión. Reintenta en unos segundos.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        style={{
          padding: "28px",
          borderRadius: "16px",
          background: "rgba(34,217,138,0.08)",
          border: "1px solid rgba(34,217,138,0.2)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
        <h3 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#22d98a" }}>
          ¡Solicitud enviada!
        </h3>
        <p style={{ margin: "0 0 16px", color: "#a0f0cc", fontSize: "14px", lineHeight: 1.6 }}>
          Revisamos tu solicitud en 24-48 horas. Te avisamos por email cuando tu cuenta esté activa.
        </p>
        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#6b7e96", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
            Tu código de referido
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "22px", fontWeight: 500, color: "#22d98a" }}>
            {success.referralCode}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: "12px", color: "#6b7e96", lineHeight: 1.7 }}>
          Tu link para compartir: <strong style={{ color: "#22d98a" }}>{success.referralCode}.clikit.com.ar</strong>
        </p>
      </div>
    );
  }

  const slugPreview = customSlug ? slugify(customSlug) : "";

  return (
    <form onSubmit={handleSubmit} className="pj-form">
      {error && (
        <div
          style={{
            color: "#fecaca",
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.22)",
            borderRadius: "12px",
            padding: "10px 14px",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <input
          type="text"
          placeholder="Nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Apellido"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
      </div>
      <input
        type="email"
        placeholder="tu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Tu teléfono (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña (mínimo 8 caracteres)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Tu link personalizado (ej: kiosco-maria)"
          value={customSlug}
          onChange={(e) => {
            const val = e.target.value;
            setCustomSlug(val);
          }}
        />
        {slugPreview && (
          <div style={{
            fontSize: "11px",
            color: "var(--green)",
            marginTop: "4px",
            fontFamily: "'DM Mono', monospace",
          }}>
            {slugPreview}.clikit.com.ar
          </div>
        )}
      </div>
      <input
        type="text"
        placeholder="Código de otro partner que te invitó (opcional)"
        value={referrerSlug}
        onChange={(e) => setReferrerSlug(e.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Enviando solicitud..." : "Quiero ser partner"}
      </button>
    </form>
  );
}
