import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/lib/auth";

async function AdminSignOut() {
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <form action={handleSignOut}>
      <button type="submit" className="admin-nav__signout">
        Cerrar sesión
      </button>
    </form>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id || !isPlatformAdmin(session.user)) {
    redirect("/login");
  }

  const pendingCount = await prisma.partnerProfile.count({
    where: { isApproved: false },
  });

  return (
    <>
      <style>{`
        .admin-shell {
          display: flex;
          min-height: 100dvh;
        }

        /* ── Sidebar ── */
        .admin-sidebar {
          width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border-right: 1px solid var(--border);
          position: sticky;
          top: 0;
          height: 100dvh;
          overflow-y: auto;
        }

        .admin-sidebar__brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px 16px 16px;
          border-bottom: 1px solid var(--border);
          text-decoration: none;
        }

        .admin-sidebar__logo {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--surface-2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          color: var(--primary);
          flex-shrink: 0;
        }

        .admin-sidebar__brand-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .admin-sidebar__brand-tag {
          font-size: 10px;
          color: var(--text-3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 1px;
        }

        .admin-nav {
          flex: 1;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .admin-nav__section {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-3);
          padding: 12px 8px 6px;
        }

        .admin-nav__link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          font-weight: 500;
          color: var(--text-2);
          text-decoration: none;
          transition: background 0.12s, color 0.12s;
        }

        .admin-nav__link:hover {
          background: var(--surface-2);
          color: var(--text);
        }

        .admin-nav__link.active {
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          color: var(--primary);
        }

        .admin-nav__icon {
          width: 16px;
          height: 16px;
          opacity: 0.7;
          flex-shrink: 0;
        }

        .admin-nav__link.active .admin-nav__icon {
          opacity: 1;
        }

        .admin-sidebar__footer {
          padding: 12px 8px 16px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .admin-sidebar__user {
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .admin-sidebar__user-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
        }

        .admin-sidebar__user-email {
          font-size: 11px;
          color: var(--text-3);
        }

        .admin-nav__signout {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          color: var(--text-3);
          background: transparent;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
          transition: background 0.12s, color 0.12s;
        }

        .admin-nav__signout:hover {
          background: var(--surface-2);
          color: var(--red);
        }

        /* ── Main ── */
        .admin-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .admin-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 28px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .admin-topbar__title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
        }

        .admin-topbar__breadcrumb {
          font-size: 12px;
          color: var(--text-3);
          margin-top: 2px;
        }

        .admin-content {
          flex: 1;
          padding: 28px;
          max-width: 1200px;
          width: 100%;
        }

        @media (max-width: 768px) {
          .admin-sidebar {
            display: none;
          }
          .admin-content {
            padding: 16px;
          }
        }
      `}</style>

      <div className="admin-shell">
        {/* ── Sidebar ── */}
        <aside className="admin-sidebar">
          <Link href="/admin" className="admin-sidebar__brand">
            <div className="admin-sidebar__logo">C</div>
            <div>
              <div className="admin-sidebar__brand-name">Clikit</div>
              <div className="admin-sidebar__brand-tag">Admin</div>
            </div>
          </Link>

          <nav className="admin-nav">
            <span className="admin-nav__section">General</span>

            <Link href="/admin" className="admin-nav__link">
              <svg className="admin-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="6" height="6" rx="1.5" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" />
              </svg>
              Dashboard
            </Link>

            <Link href="/admin/negocios" className="admin-nav__link">
              <svg className="admin-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" />
                <path d="M6 15V9h4v6" />
              </svg>
              Negocios
            </Link>

            <span className="admin-nav__section">Partners</span>

            <Link href="/admin/partners" className="admin-nav__link">
              <svg className="admin-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="5" r="3" />
                <path d="M1 14c0-3 2-5 5-5s5 2 5 5" />
                <path d="M11 7l2 2 3-3" />
              </svg>
              Partners
              {pendingCount > 0 && (
                <span style={{
                  marginLeft: "auto",
                  background: "#f5a623",
                  color: "#1a0f00",
                  fontSize: "10px",
                  fontWeight: 800,
                  borderRadius: "999px",
                  padding: "1px 7px",
                  minWidth: "18px",
                  textAlign: "center",
                }}>
                  {pendingCount}
                </span>
              )}
            </Link>

            {pendingCount > 0 && (
              <Link href="/admin/partners/pending" className="admin-nav__link" style={{ color: "var(--primary)" }}>
                <svg className="admin-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3l2 1" />
                </svg>
                Solicitudes pendientes
              </Link>
            )}

            <Link href="/admin/liquidaciones" className="admin-nav__link">
              <svg className="admin-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="3" width="14" height="10" rx="1.5" />
                <path d="M1 6h14" />
                <path d="M5 10h2M9 10h2" />
              </svg>
              Liquidaciones
            </Link>
          </nav>

          <div className="admin-sidebar__footer">
            <div className="admin-sidebar__user">
              <div className="admin-sidebar__user-name">
                {session.user.name ?? "Admin"}
              </div>
              <div className="admin-sidebar__user-email">
                {session.user.email}
              </div>
            </div>
            <AdminSignOut />
          </div>
        </aside>

        {/* ── Contenido ── */}
        <main className="admin-main">
          <div className="admin-content">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}