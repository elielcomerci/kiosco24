"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [kioscoName, setKioscoName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Creando kiosco...");
  const router = useRouter();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoadingText("Creando tu kiosco...");
    
    try {
      // 1. Crear el kiosco y sucursal base
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

      // 2. Crear suscripción en MercadoPago
      setLoadingText("Generando link de pago seguro...");
      const subRes = await fetch("/api/subscription/create", { method: "POST" });
      const subData = await subRes.json();

      if (subData.init_point) {
        // Redirigir a MercadoPago para suscribirse
        window.location.href = subData.init_point;
      } else {
        alert("Tu kiosco fue creado, pero hubo un error generando la suscripción.");
        router.push(`/${data.branchId}/caja`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: "100dvh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "var(--bg)",
      padding: "20px"
    }}>
      <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "40px" }}>
        <div style={{ fontSize: "48px", textAlign: "center", marginBottom: "20px" }}>🚀</div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, textAlign: "center", marginBottom: "10px" }}>¡Bienvenido!</h1>
        <p style={{ textAlign: "center", color: "var(--text-2)", marginBottom: "30px", fontSize: "15px" }}>
          Solo un paso más. ¿Cómo se llama tu negocio?
        </p>
        
        <form onSubmit={handleSetup} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: "8px" }}>
              Nombre del Kiosco / Local
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
            {loading ? loadingText : "Suscribirme por $9.900/mes"}
          </button>
          
          <p style={{ textAlign: "center", fontSize: "12px", color: "var(--text-3)", marginTop: "-10px" }}>
            Serás redirigido a MercadoPago para completar la suscripción de forma segura.
          </p>
        </form>
      </div>
    </div>
  );
}
