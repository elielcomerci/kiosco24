import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

import { FeatureCard } from "@/components/FeatureCard";

export default async function LandingPage() {
  const session = await auth();

  // Si está logueado, redirigir a su sucursal o dashboard
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        kiosco: {
          include: { branches: { take: 1 } }
        }
      }
    });

    const branchId = user?.kiosco?.branches[0]?.id;
    if (branchId) {
      redirect(`/${branchId}/caja`);
    } else {
      // Si no tiene sucursal, es un usuario nuevo (onboarding)
      redirect("/login");
    }
  }

  // Landing Page Premium para usuarios no logueados
  return (
    <div className="landing-container" style={{ 
      minHeight: "100dvh", 
      background: "radial-gradient(circle at top right, #1a1a1a, #0a0a0a)",
      color: "white",
      fontFamily: "var(--font-open-sans), sans-serif"
    }}>
      {/* Hero Section */}
      <header style={{ 
        padding: "20px 5%", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center" 
      }}>
        <div style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "32px" }}>🏪</span>
          <span style={{ letterSpacing: "-0.03em" }}>Kiosco 24h</span>
        </div>
        <Link href="/login" className="btn btn-primary" style={{ padding: "10px 24px", borderRadius: "100px" }}>
          Entrar ahora
        </Link>
      </header>

      <main style={{ padding: "80px 5%", textAlign: "center", maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ 
          fontSize: "clamp(40px, 8vw, 72px)", 
          fontWeight: 900, 
          lineHeight: 1, 
          letterSpacing: "-0.04em",
          marginBottom: "24px",
          background: "linear-gradient(to bottom, #ffffff, #888888)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent"
        }}>
          El sistema de ventas <br/> que tu kiosco merece.
        </h1>
        
        <p style={{ 
          fontSize: "20px", 
          color: "var(--text-2)", 
          maxWidth: "700px", 
          margin: "0 auto 48px",
          lineHeight: 1.6
        }}>
          Control de stock, ventas rápidas, fiados y estadísticas en tiempo real. 
          Diseñado para ser el más rápido del mercado argentino.
        </p>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login" className="btn btn-primary btn-lg" style={{ padding: "16px 40px" }}>
            Empezar gratis
          </Link>
          <a href="#features" className="btn btn-secondary btn-lg" style={{ padding: "16px 40px" }}>
            Ver bondades
          </a>
        </div>

        {/* Features Grid */}
        <div id="features" style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
          gap: "24px", 
          marginTop: "120px",
          textAlign: "left"
        }}>
          <FeatureCard 
            emoji="⚡" 
            title="Venta en 2 segundos" 
            desc="Interfaz optimizada para pantallas táctiles y lectores de barras. No pierdas tiempo." 
          />
          <FeatureCard 
            emoji="📉" 
            title="Control de Stock" 
            desc="Alertas automáticas cuando te quedás sin mercadería. Sabé qué comprar." 
          />
          <FeatureCard 
            emoji="📝" 
            title="Gestión de Fiados" 
            desc="Llevá la cuenta de tus clientes habituales sin cuadernos. Todo digital y seguro." 
          />
          <FeatureCard 
            emoji="📊" 
            title="Cierre de Caja" 
            desc="Informes diarios de ganancias. Sabé exactamente cuánto ganaste al final del día." 
          />
          <FeatureCard 
            emoji="🏢" 
            title="Multi-sucursal" 
            desc="Gestioná varios locales desde un solo lugar con stock y precios independientes." 
          />
          <FeatureCard 
            emoji="🖨️" 
            title="Impresión amigable" 
            desc="Formatos optimizados para tickets en blanco y negro con el logo de tu negocio." 
          />
        </div>
      </main>

      <footer style={{ padding: "60px 5%", borderTop: "1px solid #333", marginTop: "100px", textAlign: "center", color: "var(--text-3)" }}>
        <p>© 2026 Kiosco 24h - Hecho con ❤️ para comerciantes argentinos.</p>
      </footer>
    </div>
  );
}


