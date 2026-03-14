"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [kioscoName, setKioscoName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kioscoName }),
      });
      
      const data = await res.json();
      if (data.branchId) {
        router.push(`/${data.branchId}/caja`);
      } else {
        alert("Error al crear el kiosco. Intentalo de nuevo.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
    } finally {
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
            {loading ? "Configurando..." : "Comenzar mi negocio"}
          </button>
        </form>
      </div>
    </div>
  );
}
