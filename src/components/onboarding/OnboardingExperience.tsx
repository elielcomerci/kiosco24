"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PROMO_LABEL,
} from "@/lib/subscription-plan";

export default function OnboardingExperience() {
  const [kioscoName, setKioscoName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Creando kiosco...");
  const [createdBranchId, setCreatedBranchId] = useState<string | null>(null);
  const [createdKioscoName, setCreatedKioscoName] = useState("");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const router = useRouter();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoadingText("Creando tu kiosco...");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kioscoName }),
      });

      const data = await res.json();
      if (!data.branchId) {
        alert("Error al crear el kiosco. Intentalo de nuevo.");
        setLoading(false);
        return;
      }
      setCreatedKioscoName((data?.kiosco?.name as string) || kioscoName.trim());
      setCreatedBranchId(data.branchId as string);
      setLoading(false);
    } catch (err) {
      console.error(err);
      alert("Error de conexion.");
      setLoading(false);
    }
  };

  const handleGoToSubscription = async () => {
    setSubscriptionLoading(true);

    try {
      const subRes = await fetch("/api/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "ONBOARDING" }),
      });
      const subData = await subRes.json();

      if (subData.init_point) {
        window.location.href = subData.init_point;
        return;
      }

      router.push("/suscripcion");
    } catch (error) {
      console.error(error);
      alert("No pudimos abrir el pago ahora. Puedes intentarlo desde Suscripcion.");
      router.push("/suscripcion");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleSkipForNow = () => {
    if (!createdBranchId) return;
    router.push(`/${createdBranchId}/productos`);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "20px",
      }}
    >
      <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "40px" }}>
        {!createdBranchId ? (
          <>
            <div style={{ fontSize: "48px", textAlign: "center", marginBottom: "20px" }}>{"\uD83D\uDE80"}</div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, textAlign: "center", marginBottom: "10px" }}>
              Bienvenido
            </h1>
            <p style={{ textAlign: "center", color: "var(--text-2)", marginBottom: "30px", fontSize: "15px" }}>
              Crea tu kiosco y empieza a cargar el catalogo desde ahora.
            </p>

            <form onSubmit={handleSetup} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-3)",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Nombre del kiosco o local
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Kiosco El Paso"
                  value={kioscoName}
                  onChange={(e) => setKioscoName(e.target.value)}
                  required
                  autoFocus
                  style={{ width: "100%" }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                disabled={loading || !kioscoName.trim()}
              >
                {loading ? loadingText : "Crear kiosco"}
              </button>

              <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-3)", marginTop: "-10px" }}>
                Podés cargar productos, stock y configuración desde ahora. La suscripción se activa cuando quieras empezar a operar.
              </p>
            </form>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ fontSize: "44px", textAlign: "center" }}>{"\u2705"}</div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, textAlign: "center", margin: 0 }}>
              {createdKioscoName || "Tu kiosco"} ya esta listo
            </h1>
            <p style={{ textAlign: "center", color: "var(--text-2)", margin: 0, fontSize: "15px" }}>
              Podés empezar a cargar productos, precios y stock ahora, y activar la suscripción cuando quieras vender, cobrar o usar la operación diaria.
            </p>

            <button
              type="button"
              className="btn btn-primary btn-lg btn-full"
              disabled={subscriptionLoading}
              onClick={handleGoToSubscription}
            >
              {subscriptionLoading ? "Abriendo pago..." : "Ir a pagar suscripcion"}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-lg btn-full"
              onClick={handleSkipForNow}
            >
              Cargar productos primero
            </button>

            <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-3)", margin: 0 }}>
              {SUBSCRIPTION_PROMO_LABEL} {SUBSCRIPTION_CANCEL_LABEL}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
