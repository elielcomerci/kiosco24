import { auth, signOut } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";

async function approvePartner(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) return;

  const partnerId = formData.get("partnerId") as string;
  if (partnerId) {
    await prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { isApproved: true },
    });
    revalidatePath("/admin/partners/pending");
  }
}

async function rejectPartner(formData: FormData) {
  "use server";
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) return;

  const partnerId = formData.get("partnerId") as string;
  if (partnerId) {
    await prisma.partnerProfile.delete({ where: { id: partnerId } });
    revalidatePath("/admin/partners/pending");
  }
}

export default async function AdminPendingPartners() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) redirect("/login");

  const pending = await prisma.partnerProfile.findMany({
    where: { isApproved: false },
    select: {
      id: true,
      referralCode: true,
      phone: true,
      createdAt: true,
      invitedBy: { select: { referralCode: true } },
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/partners" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
          ← Volver a partners
        </Link>
        <h1 style={{ fontSize: "20px", fontWeight: 800, marginTop: "8px" }}>
          Solicitudes pendientes ({pending.length})
        </h1>
      </div>

      {pending.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
          <p style={{ color: "var(--text-3)" }}>No hay solicitudes pendientes.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {pending.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "16px 20px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>{p.user.name ?? "Sin nombre"}</div>
                  <div style={{ fontSize: "13px", color: "var(--text-3)" }}>{p.user.email}</div>
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "13px",
                  color: "var(--primary)",
                  background: "rgba(245,166,35,0.1)",
                  padding: "3px 10px",
                  borderRadius: "999px",
                }}>
                  {p.referralCode}
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--text-3)" }}>
                <span>📅 {new Date(p.createdAt).toLocaleDateString("es-AR")}</span>
                {p.phone && <span>📱 {p.phone}</span>}
                {p.invitedBy && <span>👥 Invitado por: {p.invitedBy.referralCode}</span>}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <form action={approvePartner}>
                  <input type="hidden" name="partnerId" value={p.id} />
                  <button
                    type="submit"
                    style={{
                      padding: "6px 16px",
                      borderRadius: "999px",
                      border: "none",
                      background: "#22d98a",
                      color: "#0a0f1a",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Aprobar
                  </button>
                </form>
                <form action={rejectPartner}>
                  <input type="hidden" name="partnerId" value={p.id} />
                  <button
                    type="submit"
                    style={{
                      padding: "6px 16px",
                      borderRadius: "999px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-3)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Rechazar
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
