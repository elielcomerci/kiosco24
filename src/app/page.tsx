import { auth, signOut } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

import { FeatureCard } from "@/components/FeatureCard";

export default async function LandingPage() {
  const session = await auth();

  // Obtenemos los datos mínimamente necesarios para el botón dinámico si hay sesión
  let branchId = session?.user?.branchId ?? null;
  if (!branchId && session?.user?.role === "EMPLOYEE" && session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { branches: { take: 1, select: { id: true } } },
    });
    branchId = employee?.branches[0]?.id ?? null;
  }

  if (session?.user?.id && !branchId) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        kiosco: {
          include: { branches: { take: 1 } }
        }
      }
    });
    branchId = user?.kiosco?.branches[0]?.id ?? null;
  }

  // Landing Page Premium — Visible para todos
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
        alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.05)"
      }}>
        <div style={{ fontSize: "21px", fontWeight: 800, display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "28px" }}>🏪</span>
          <span style={{ letterSpacing: "-0.03em" }}>Kiosco 24h</span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {session ? (
            <>
              <span style={{ fontSize: "14px", color: "var(--text-3)", display: "none" }}>{session.user?.email}</span>
              <form action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}>
                <button className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "14px", borderRadius: "100px" }}>
                  Salir
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ padding: "8px 20px", fontSize: "14px", borderRadius: "100px" }}>
                Entrar
              </Link>
              <Link href="/login?register=1" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "14px", borderRadius: "100px" }}>
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </header>

      <main style={{ padding: "80px 5%", textAlign: "center", maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ 
          fontSize: "clamp(36px, 7vw, 64px)", 
          fontWeight: 900, 
          lineHeight: 1.1, 
          letterSpacing: "-0.04em",
          marginBottom: "24px",
          background: "linear-gradient(to bottom, #ffffff, #aaaaaa)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent"
        }}>
          El sistema de ventas <br/> que tu kiosco merece.
        </h1>
        
        <p style={{ 
          fontSize: "18px", 
          color: "rgba(255,255,255,0.6)", 
          maxWidth: "600px", 
          margin: "0 auto 40px",
          lineHeight: 1.6
        }}>
          Control de stock, ventas rápidas, fiados y estadísticas en tiempo real. 
          Diseñado para ser el más rápido del mercado argentino.
        </p>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          {session ? (
            <Link
              href={
                isPlatformAdmin(session.user)
                  ? "/admin"
                  : branchId
                    ? `/${branchId}/caja`
                    : "/onboarding"
              }
              className="btn btn-primary btn-lg"
              style={{ padding: "16px 40px" }}
            >
              {isPlatformAdmin(session.user) ? "Ir al Admin" : "Ir a mi Kiosco 🚀"}
            </Link>
          ) : (
            <Link href="/login?register=1" className="btn btn-primary btn-lg" style={{ padding: "16px 40px" }}>
              Crear mi cuenta
            </Link>
          )}
          {!session && (
            <Link href="/login" className="btn btn-secondary btn-lg" style={{ padding: "16px 40px" }}>
              Ya tengo cuenta
            </Link>
          )}
          {session && (
            <a href="#features" className="btn btn-secondary btn-lg" style={{ padding: "16px 40px" }}>
              Ver bondades
            </a>
          )}
        </div>

        {/* Features Grid */}
        <div id="features" style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
          gap: "24px", 
          marginTop: "100px",
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

      <footer style={{ padding: "60px 5%", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "80px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
        <p>© 2026 Kiosco 24 - Hecho con ❤️ por ZAP Agencia Creativa.</p>
      </footer>
    </div>
  );
}
