import { AccessGrantKind } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function ensurePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!isPlatformAdmin(session.user)) {
    redirect("/");
  }

  return session;
}

async function createAccessGrant(formData: FormData) {
  "use server";

  const session = await ensurePlatformAdmin();
  const kioscoId = String(formData.get("kioscoId") ?? "");
  const kind = String(formData.get("kind") ?? "ADMIN_GRACE");
  const days = Number(formData.get("days") ?? 7);
  const note = String(formData.get("note") ?? "").trim();

  if (!kioscoId || !Number.isFinite(days) || days <= 0) {
    return;
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.accessGrant.create({
    data: {
      kioscoId,
      kind: kind === "ADMIN_INVITE" ? AccessGrantKind.ADMIN_INVITE : AccessGrantKind.ADMIN_GRACE,
      startsAt,
      endsAt,
      note: note || null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/admin");
}

async function revokeGrant(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const grantId = String(formData.get("grantId") ?? "");
  if (!grantId) {
    return;
  }

  await prisma.accessGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/admin");
}

export default async function AdminPage() {
  await ensurePlatformAdmin();

  const kioscos = await prisma.kiosco.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      owner: {
        select: {
          email: true,
          name: true,
        },
      },
      branches: {
        select: {
          id: true,
          name: true,
        },
        orderBy: { createdAt: "asc" },
      },
      subscription: {
        select: {
          id: true,
          status: true,
          managementUrl: true,
          updatedAt: true,
        },
      },
      accessGrants: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          kind: true,
          startsAt: true,
          endsAt: true,
          note: true,
          revokedAt: true,
          createdAt: true,
        },
      },
    },
  });

  return (
    <div style={{ minHeight: "100dvh", background: "#020617", padding: "24px", color: "white" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>
              Plataforma
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: "34px" }}>Administrador de acceso</h1>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="btn btn-ghost">
              Salir
            </button>
          </form>
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderRadius: "18px",
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          Desde aca podes revisar el estado de cada kiosco y otorgar acceso temporal por gracia administrativa o
          invitacion. Si queres bootstrapear administradores sin tocar la base manualmente, podes usar el env
          <code style={{ marginLeft: 6 }}>PLATFORM_ADMIN_EMAILS</code>.
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          {kioscos.map((kiosco) => {
            const activeGrant = kiosco.accessGrants.find((grant) => !grant.revokedAt && grant.endsAt >= new Date());

            return (
              <section
                key={kiosco.id}
                style={{
                  background: "rgba(15,23,42,.82)",
                  border: "1px solid rgba(148,163,184,.18)",
                  borderRadius: "22px",
                  padding: "20px",
                  display: "grid",
                  gap: "18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <h2 style={{ margin: 0, fontSize: "24px" }}>{kiosco.name}</h2>
                    <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                      {kiosco.owner.name || "Sin nombre"} · {kiosco.owner.email}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: "grid", gap: "6px" }}>
                    <strong>Suscripcion: {kiosco.subscription?.status ?? "SIN_CONFIGURAR"}</strong>
                    <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                      Ultimo cambio: {kiosco.subscription?.updatedAt ? formatDate(kiosco.subscription.updatedAt) : "Nunca"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                  <div style={{ padding: "14px", borderRadius: "16px", background: "rgba(30,41,59,.8)" }}>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Sucursal principal</div>
                    <strong>{kiosco.branches[0]?.name ?? "Sin sucursales"}</strong>
                  </div>
                  <div style={{ padding: "14px", borderRadius: "16px", background: "rgba(30,41,59,.8)" }}>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Acceso temporal activo</div>
                    <strong>
                      {activeGrant
                        ? `${activeGrant.kind === "ADMIN_INVITE" ? "Invitacion" : "Gracia"} hasta ${formatDate(activeGrant.endsAt)}`
                        : "No"}
                    </strong>
                  </div>
                  <div style={{ padding: "14px", borderRadius: "16px", background: "rgba(30,41,59,.8)" }}>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Alta del kiosco</div>
                    <strong>{formatDate(kiosco.createdAt)}</strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
                    gap: "18px",
                  }}
                >
                  <form action={createAccessGrant} style={{ display: "grid", gap: "10px" }}>
                    <input type="hidden" name="kioscoId" value={kiosco.id} />
                    <div style={{ fontWeight: 700 }}>Otorgar acceso temporal</div>
                    <select name="kind" className="input" defaultValue={AccessGrantKind.ADMIN_GRACE}>
                      <option value={AccessGrantKind.ADMIN_GRACE}>Gracia administrativa</option>
                      <option value={AccessGrantKind.ADMIN_INVITE}>Invitacion</option>
                    </select>
                    <input name="days" type="number" min={1} max={90} defaultValue={7} className="input" />
                    <textarea
                      name="note"
                      className="input"
                      placeholder="Motivo interno"
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                    <button type="submit" className="btn btn-primary">
                      Guardar acceso
                    </button>
                  </form>

                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ fontWeight: 700 }}>Ultimos grants</div>
                    {kiosco.accessGrants.length === 0 ? (
                      <div style={{ color: "#94a3b8" }}>Todavia no hay accesos temporales registrados.</div>
                    ) : (
                      kiosco.accessGrants.map((grant) => (
                        <div
                          key={grant.id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "14px",
                            background: "rgba(30,41,59,.8)",
                            display: "grid",
                            gap: "6px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                            <strong>{grant.kind === "ADMIN_INVITE" ? "Invitacion" : "Gracia"}</strong>
                            <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                              {formatDate(grant.startsAt)} a {formatDate(grant.endsAt)}
                            </span>
                          </div>
                          {grant.note && <div style={{ color: "#cbd5e1", fontSize: "14px" }}>{grant.note}</div>}
                          {grant.revokedAt ? (
                            <div style={{ color: "#fca5a5", fontSize: "13px" }}>
                              Revocado el {formatDate(grant.revokedAt)}
                            </div>
                          ) : (
                            <form action={revokeGrant}>
                              <input type="hidden" name="grantId" value={grant.id} />
                              <button type="submit" className="btn btn-ghost">
                                Revocar
                              </button>
                            </form>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
