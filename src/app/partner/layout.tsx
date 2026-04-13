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
    <>
      <style>{`
        .shell {
          display: flex;
          min-height: 100dvh;
          background: #06080d;
          color: #eef2f7;
        }

        .sidebar {
          width: 260px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #0e121b;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky;
          top: 0;
          height: 100dvh;
          overflow-y: auto;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 24px;
          text-decoration: none;
        }
        
        .brand:hover .logo {
          transform: scale(1.05);
          box-shadow: 0 0 16px rgba(59, 130, 246, 0.4);
        }

        .logo {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          font-weight: 800;
          font-size: 18px;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .brand-name {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #fff;
          line-height: 1.1;
        }

        .brand-tag {
          font-size: 11px;
          font-weight: 700;
          color: #3b82f6;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 2px;
        }

        .summary {
          margin: 0 16px 24px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          position: relative;
          overflow: hidden;
        }

        .summary::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3b82f6, #10b981);
        }

        .summary-value {
          font-size: 24px;
          font-weight: 800;
          font-family: 'DM Mono', monospace;
          color: #fff;
          line-height: 1.2;
        }

        .summary-label {
          font-size: 12px;
          color: #8fa3ba;
          margin-top: 4px;
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 16px;
          flex: 1;
        }

        .section {
          font-size: 11px;
          font-weight: 700;
          color: #6b7e96;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 16px 0 8px 12px;
        }

        .link {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          border-radius: 8px;
          color: #cbd5e1;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .link:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .link--primary {
          background: rgba(34, 217, 138, 0.1);
          color: #22d98a;
          border: 1px solid rgba(34, 217, 138, 0.2);
          margin-top: 8px;
          justify-content: center;
          font-weight: 700;
        }

        .link--primary:hover {
          background: rgba(34, 217, 138, 0.2);
          color: #22d98a;
        }

        .footer {
          padding: 20px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          margin-top: auto;
        }

        .user {
          margin-bottom: 12px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
        }

        .user-email {
          font-size: 12px;
          color: #8fa3ba;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .nav__signout {
          width: 100%;
          padding: 8px;
          background: transparent;
          border: 1px solid rgba(248, 113, 113, 0.2);
          color: #f87171;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .nav__signout:hover {
          background: rgba(248, 113, 113, 0.1);
        }

        .main {
          flex: 1;
          max-width: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .content {
          flex: 1;
        }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
          .shell { flex-direction: column; }
          .sidebar { 
            width: 100%; 
            height: auto; 
            position: relative; 
            border-right: none;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .nav { padding-bottom: 24px; }
        }
      `}</style>
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
    </>
  );
}