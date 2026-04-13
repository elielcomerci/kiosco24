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