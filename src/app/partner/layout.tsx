import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { UserRole } from "@prisma/client";

async function PartnerSignOut() {
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <form action={handleSignOut}>
      <button type="submit" className="nav__signout">
        Cerrar sesión
      </button>
    </form>
  );
}

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const isAllowed =
    session?.user?.role === UserRole.PARTNER ||
    session?.user?.role === UserRole.PLATFORM_ADMIN;

  if (!session?.user?.id || !isAllowed) {
    redirect("/login");
  }

  // Check if partner profile is approved
  const { prisma } = await import("@/lib/prisma");
  const partnerProfile = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { isApproved: true, referralCode: true },
  });

  if (!partnerProfile?.isApproved) {
    return (
      <div style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#06080d",
        fontFamily: "'Instrument Sans', sans-serif",
        padding: "28px",
      }}>
        <div style={{
          maxWidth: "420px",
          textAlign: "center",
          padding: "40px 32px",
          borderRadius: "20px",
          background: "#0e1420",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: "24px",
            fontWeight: 800,
            color: "#eef2f7",
            marginBottom: "12px",
          }}>Solicitud pendiente</h2>
          <p style={{ color: "#8fa3ba", fontSize: "14px", lineHeight: 1.7, marginBottom: "20px" }}>
            Tu solicitud está siendo revisada. Te avisamos por email cuando esté aprobada.
          </p>
          {partnerProfile?.referralCode && (
            <div style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}>
              <div style={{ fontSize: "10px", color: "#6b7e96", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "4px" }}>
                Tu código de referido
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "18px",
                fontWeight: 500,
                color: "#f5a623",
              }}>
                {partnerProfile.referralCode}
              </div>
            </div>
          )}
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/lib/auth");
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button style={{
              padding: "10px 24px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.13)",
              background: "transparent",
              color: "#8fa3ba",
              fontSize: "13px",
              fontFamily: "'Instrument Sans', sans-serif",
              cursor: "pointer",
            }}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/partner" className="brand">
          <div className="logo">C</div>
          <div>
            <div className="brand-name">Clikit</div>
            <div className="brand-tag">Partner</div>
          </div>
        </Link>

        {/* 💰 SLOT DE MÉTRICA (después lo hidratás) */}
        <div className="summary">
          <div className="summary-value">$—</div>
          <div className="summary-label">Ingresos mensuales</div>
        </div>

        <nav className="nav">
          <span className="section">Mi negocio</span>

          <Link href="/partner" className="link">Dashboard</Link>
          <Link href="/partner/cartera" className="link">Cartera</Link>
          <Link href="/partner/ganancias" className="link">Ganancias</Link>

          <span className="section">Herramientas</span>

          <Link href="/partner/link" className="link link--primary">
            Compartir mi link
          </Link>
        </nav>

        <div className="footer">
          <div className="user">
            <div className="user-name">{session.user.name}</div>
            <div className="user-email">{session.user.email}</div>
          </div>
          <PartnerSignOut />
        </div>
      </aside>

      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  );
}