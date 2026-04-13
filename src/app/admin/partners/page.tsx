import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminPartnersPage() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) redirect("/login");

  const [partners, pendingCount] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { isApproved: true },
      select: {
        id: true,
        referralCode: true,
        phone: true,
        createdAt: true,
        _count: { select: { referrals: true } },
        user: { select: { name: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partnerProfile.count({ where: { isApproved: false } }),
  ]);

  const displayName = (u: { name: string | null; firstName: string | null; lastName: string | null }) =>
    u.name ?? [u.firstName, u.lastName].filter(Boolean).join(" ");

  return (
    <div>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "4px" }}>Partners</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
            {partners.length} {partners.length === 1 ? "partner activo" : "partners activos"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {pendingCount > 0 && (
            <Link
              href="/admin/partners/pending"
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                background: "rgba(245,166,35,0.1)",
                border: "1px solid rgba(245,166,35,0.25)",
                color: "var(--primary)",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {pendingCount} {pendingCount === 1 ? "pendiente" : "pendientes"}
            </Link>
          )}
        </div>
      </div>

      {partners.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>👥</div>
          <p style={{ color: "var(--text-3)" }}>Aún no hay partners aprobados.</p>
          {pendingCount > 0 && (
            <Link href="/admin/partners/pending" style={{ color: "var(--primary)", fontSize: "13px" }}>
              Ver solicitudes pendientes →
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {partners.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "16px 20px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "15px" }}>
                  {displayName(p.user)}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-3)" }}>{p.user.email}</div>
                <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                  📅 {new Date(p.createdAt).toLocaleDateString("es-AR")}
                  {p.phone && ` · 📱 ${p.phone}`}
                  {` · 👤 ${p._count.referrals} ${p._count.referrals === 1 ? "referido" : "referidos"}`}
                </div>
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "13px",
                color: "var(--primary)",
                background: "rgba(245,166,35,0.1)",
                padding: "4px 12px",
                borderRadius: "999px",
              }}>
                {p.referralCode}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
