import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { approvePayoutRequest, rejectPayoutRequest, markPayoutAsPaid } from "@/app/actions/admin-payout";

export default async function AdminPayoutsPage() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user)) redirect("/login");

  const payouts = await prisma.payoutRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      amount: true,
      status: true,
      createdAt: true,
      paidAt: true,
      partner: {
        select: {
          id: true,
          referralCode: true,
          bankAlias: true,
          bankCbu: true,
          bankAccountHolder: true,
          user: { select: { name: true, firstName: true, lastName: true, email: true } }
        }
      }
    }
  });

  const displayName = (u: { name: string | null; firstName: string | null; lastName: string | null }) =>
    u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || "—");

  const pendingPayouts = payouts.filter((p) => p.status === "PENDING");
  const approvedPayouts = payouts.filter((p) => p.status === "APPROVED");
  const resolvedPayouts = payouts.filter((p) => p.status === "PAID" || p.status === "REJECTED");

  const totalPending = pendingPayouts.reduce((acc, p) => acc + p.amount, 0);
  const totalApproved = approvedPayouts.reduce((acc, p) => acc + p.amount, 0);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      PENDING:  { label: "Pendiente",  color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
      APPROVED: { label: "Aprobado",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
      PAID:     { label: "Pagado",     color: "#22d98a", bg: "rgba(34,217,138,0.12)" },
      REJECTED: { label: "Rechazado",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
    };
    const s = map[status] ?? { label: status, color: "var(--text-3)", bg: "var(--surface-2)" };
    return (
      <span style={{ background: s.bg, color: s.color, padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
        {s.label}
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "4px" }}>Retiros de Partners</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
          Revisá, aprobá y ejecutá las solicitudes de transferencia.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "32px" }}>
        <div style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#f5a623", textTransform: "uppercase", marginBottom: "8px" }}>Pendientes</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>${Math.round(totalPending).toLocaleString("es-AR")}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{pendingPayouts.length} {pendingPayouts.length === 1 ? "solicitud" : "solicitudes"}</div>
        </div>
        <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "12px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: "8px" }}>Aprobados</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>${Math.round(totalApproved).toLocaleString("es-AR")}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{approvedPayouts.length} {approvedPayouts.length === 1 ? "listo para pagar" : "listos para pagar"}</div>
        </div>
        <div style={{ background: "rgba(34,217,138,0.08)", border: "1px solid rgba(34,217,138,0.2)", borderRadius: "12px", padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#22d98a", textTransform: "uppercase", marginBottom: "8px" }}>Historial</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)" }}>{resolvedPayouts.length}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>pagos ejecutados</div>
        </div>
      </div>

      {/* Payout groups */}
      {[
        { title: "Pendientes de revisión", items: pendingPayouts, accent: "#f5a623" },
        { title: "Aprobados — listos para pagar", items: approvedPayouts, accent: "#60a5fa" },
        { title: "Historial", items: resolvedPayouts, accent: "var(--text-3)" },
      ].map(({ title, items, accent }) => (
        items.length > 0 && (
          <section key={title} style={{ marginBottom: "36px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
              {title}
            </h2>
            <div style={{ display: "grid", gap: "8px" }}>
              {items.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: "16px 20px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  {/* Partner info */}
                  <div style={{ flex: "1", minWidth: "200px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>
                      {displayName(p.partner.user)}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                      {p.partner.user.email} · {p.partner.referralCode}
                    </div>

                    {/* Datos Bancarios (Críticos para transferir) */}
                    <div style={{
                      marginTop: "8px", 
                      padding: "8px 12px", 
                      background: "var(--surface-2)", 
                      borderRadius: "6px",
                      border: "1px dashed var(--border)",
                      fontSize: "12px",
                      color: "var(--text-2)"
                    }}>
                      <div style={{ marginBottom: "2px", fontWeight: 600, color: "var(--text)" }}>
                        Titular: {p.partner.bankAccountHolder || "No especificado"}
                      </div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-3)" }}>
                        <span>Alias: <strong style={{ color: "var(--text-2)" }}>{p.partner.bankAlias || "—"}</strong></span>
                        <span>CBU: <strong style={{ color: "var(--text-2)" }}>{p.partner.bankCbu || "—"}</strong></span>
                      </div>
                    </div>

                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "8px" }}>
                      Solicitado: {new Date(p.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {p.paidAt && ` · Pagado: ${new Date(p.paidAt).toLocaleDateString("es-AR")}`}
                    </div>
                  </div>

                  {/* Amount + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)" }}>
                      ${Math.round(p.amount).toLocaleString("es-AR")}
                    </div>
                    {statusBadge(p.status)}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {p.status === "PENDING" && (
                      <>
                        <form action={approvePayoutRequest.bind(null, p.id)}>
                          <button type="submit" style={btnStyle("approve")}>
                            ✓ Aprobar
                          </button>
                        </form>
                        <form action={rejectPayoutRequest.bind(null, p.id)}>
                          <button type="submit" style={btnStyle("reject")}>
                            ✗ Rechazar
                          </button>
                        </form>
                      </>
                    )}
                    {p.status === "APPROVED" && (
                      <form action={markPayoutAsPaid.bind(null, p.id)}>
                        <button type="submit" style={btnStyle("pay")}>
                          💸 Marcar como pagado
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      ))}

      {payouts.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>💸</div>
          <p style={{ color: "var(--text-3)", fontSize: "14px" }}>No hay solicitudes de retiro aún.</p>
        </div>
      )}
    </div>
  );
}

function btnStyle(type: "approve" | "reject" | "pay") {
  const styles = {
    approve: { background: "rgba(34,217,138,0.12)", color: "#22d98a", border: "1px solid rgba(34,217,138,0.25)" },
    reject:  { background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" },
    pay:     { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" },
  };
  return {
    ...styles[type],
    padding: "7px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.15s",
  } as React.CSSProperties;
}
