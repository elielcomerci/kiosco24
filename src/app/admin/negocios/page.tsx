import { AccessGrantKind, KioscoAccessOverride } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  normalizeSubscriptionPriceOverrideEmail,
  parseSubscriptionPriceOverrideAmount,
} from "@/lib/subscription-price-overrides";
import { syncSubscriptionFromMercadoPago } from "@/lib/subscription";
import { SUBSCRIPTION_PRICE_ARS, formatSubscriptionPrice } from "@/lib/subscription-plan";
import { revalidatePath } from "next/cache";
import Link from "next/link";
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

async function setAccessOverride(formData: FormData) {
  "use server";

  const session = await ensurePlatformAdmin();
  const kioscoId = String(formData.get("kioscoId") ?? "");
  const override = String(formData.get("override") ?? "INHERIT");
  const note = String(formData.get("note") ?? "").trim();

  if (!kioscoId) {
    return;
  }

  const normalizedOverride =
    override === KioscoAccessOverride.FORCE_ALLOW || override === KioscoAccessOverride.FORCE_BLOCK
      ? override
      : KioscoAccessOverride.INHERIT;

  await prisma.kiosco.update({
    where: { id: kioscoId },
    data: {
      accessOverride: normalizedOverride,
      accessOverrideNote: note || null,
      accessOverrideAt: new Date(),
      accessOverrideById: session.user.id,
    },
  });

  revalidatePath("/admin");
}

async function saveSubscriptionPriceOverride(formData: FormData) {
  "use server";

  const session = await ensurePlatformAdmin();
  const rawEmail = String(formData.get("email") ?? "");
  const normalizedEmail = normalizeSubscriptionPriceOverrideEmail(rawEmail);
  const amount = parseSubscriptionPriceOverrideAmount(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!normalizedEmail || !normalizedEmail.includes("@") || !amount || amount >= SUBSCRIPTION_PRICE_ARS) {
    return;
  }

  await prisma.subscriptionPriceOverride.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      amount,
      note: note || null,
      createdById: session.user.id,
      createdByEmail: session.user.email ?? null,
    },
    update: {
      amount,
      note: note || null,
      createdById: session.user.id,
      createdByEmail: session.user.email ?? null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
}

async function deleteSubscriptionPriceOverride(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const overrideId = String(formData.get("overrideId") ?? "");
  if (!overrideId) {
    return;
  }

  await prisma.subscriptionPriceOverride.delete({
    where: { id: overrideId },
  });

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
}

async function syncKioscoSubscription(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const kioscoId = String(formData.get("kioscoId") ?? "");
  if (!kioscoId) {
    return;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { kioscoId },
    select: { id: true },
  });

  if (!subscription?.id) {
    return;
  }

  await syncSubscriptionFromMercadoPago(subscription.id);

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
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
      accessOverride: true,
      accessOverrideNote: true,
      accessOverrideAt: true,
      accessOverrideBy: {
        select: {
          email: true,
          name: true,
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

  const subscriptionPriceOverrides = await prisma.subscriptionPriceOverride.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      email: true,
      amount: true,
      remainingCycles: true,
      note: true,
      createdByEmail: true,
      updatedAt: true,
    },
  });

  const emailsWithOverride = subscriptionPriceOverrides.map((override) => override.email);
  const overrideUsers =
    emailsWithOverride.length > 0
      ? await prisma.user.findMany({
          where: {
            email: {
              in: emailsWithOverride,
            },
          },
          select: {
            email: true,
            name: true,
            kiosco: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];

  const overrideMatchByEmail = new Map(
    overrideUsers.map((user) => [normalizeSubscriptionPriceOverrideEmail(user.email), user]),
  );
  const overrideByOwnerEmail = new Map(
    subscriptionPriceOverrides.map((override) => [override.email, override]),
  );
  const ownerEmailOptions = Array.from(
    new Set(
      kioscos
        .map((kiosco) => kiosco.owner.email)
        .filter((email): email is string => Boolean(email))
        .map((email) => normalizeSubscriptionPriceOverrideEmail(email)),
    ),
  ).sort((left, right) => left.localeCompare(right, "es-AR"));

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
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/admin/platform-coupons" className="btn btn-secondary">
              Cupones plataforma
            </Link>
            <Link href="/admin/productos" className="btn btn-secondary">
              Catalogo global
            </Link>
            <Link href="/admin/productos/scraper" className="btn btn-secondary">
              Pendientes scraper
            </Link>
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

        <section
          style={{
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            borderRadius: "22px",
            padding: "20px",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <h2 style={{ margin: 0, fontSize: "24px" }}>Precios especiales de suscripcion</h2>
            <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
              Asigna un precio especial por email. Sirve tanto para clientes ya registrados como para alguien que se
              va a registrar despues con ese mismo correo. Precio base actual:{" "}
              <strong style={{ color: "white" }}>{formatSubscriptionPrice(SUBSCRIPTION_PRICE_ARS)}</strong>.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 420px) minmax(320px, 1fr)",
              gap: "18px",
            }}
          >
            <form action={saveSubscriptionPriceOverride} style={{ display: "grid", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>Asignar o actualizar precio especial</div>
              <input
                name="email"
                type="email"
                className="input"
                placeholder="cliente@ejemplo.com"
                list="subscription-owner-email-options"
                required
              />
              <datalist id="subscription-owner-email-options">
                {ownerEmailOptions.map((email) => (
                  <option key={email} value={email} />
                ))}
              </datalist>
              <input
                name="amount"
                type="number"
                min={1}
                max={Math.max(SUBSCRIPTION_PRICE_ARS - 1, 1)}
                defaultValue={Math.max(SUBSCRIPTION_PRICE_ARS - 5000, 1)}
                className="input"
                required
              />
              <textarea
                name="note"
                className="input"
                placeholder="Motivo interno o referencia comercial"
                rows={3}
                style={{ resize: "vertical" }}
              />
              <button type="submit" className="btn btn-primary">
                Guardar precio especial
              </button>
            </form>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ fontWeight: 700 }}>Overrides activos</div>
              {subscriptionPriceOverrides.length === 0 ? (
                <div style={{ color: "#94a3b8" }}>Todavia no hay precios especiales definidos.</div>
              ) : (
                subscriptionPriceOverrides.map((override) => {
                  const matchedUser = overrideMatchByEmail.get(override.email);

                  return (
                    <div
                      key={override.id}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: "rgba(30,41,59,.8)",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <strong>{override.email}</strong>
                          <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                            {matchedUser?.kiosco
                              ? `${matchedUser.name || "Cliente registrado"} · ${matchedUser.kiosco.name}`
                              : "Todavia sin cuenta o sin kiosco"}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", display: "grid", gap: "4px" }}>
                          <strong style={{ color: "#86efac" }}>{formatSubscriptionPrice(override.amount)}</strong>
                          <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                            Actualizado {formatDate(override.updatedAt)}
                          </span>
                          <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                            {override.remainingCycles === null
                              ? "Duracion recurrente"
                              : `${override.remainingCycles} ciclo${override.remainingCycles === 1 ? "" : "s"} restante${override.remainingCycles === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      </div>
                      {override.note && <div style={{ color: "#cbd5e1", fontSize: "14px" }}>{override.note}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                          Asignado por {override.createdByEmail ?? "admin"}
                        </span>
                        <form action={deleteSubscriptionPriceOverride}>
                          <input type="hidden" name="overrideId" value={override.id} />
                          <button type="submit" className="btn btn-ghost">
                            Quitar precio especial
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gap: "16px" }}>
          {kioscos.map((kiosco) => {
            const activeGrant = kiosco.accessGrants.find((grant) => !grant.revokedAt && grant.endsAt >= new Date());
            const ownerEmail = kiosco.owner.email ? normalizeSubscriptionPriceOverrideEmail(kiosco.owner.email) : null;
            const subscriptionPriceOverride = ownerEmail ? overrideByOwnerEmail.get(ownerEmail) ?? null : null;
            const overrideLabel =
              kiosco.accessOverride === "FORCE_ALLOW"
                ? "Habilitada manualmente"
                : kiosco.accessOverride === "FORCE_BLOCK"
                  ? "Bloqueada manualmente"
                  : "Seguir suscripcion";

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
                    {subscriptionPriceOverride && (
                      <span style={{ color: "#86efac", fontSize: "13px" }}>
                        Precio especial: {formatSubscriptionPrice(subscriptionPriceOverride.amount)}
                      </span>
                    )}
                    <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                      Ultimo cambio: {kiosco.subscription?.updatedAt ? formatDate(kiosco.subscription.updatedAt) : "Nunca"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <form action={syncKioscoSubscription}>
                    <input type="hidden" name="kioscoId" value={kiosco.id} />
                    <button type="submit" className="btn btn-secondary">
                      Sincronizar suscripcion con Mercado Pago
                    </button>
                  </form>
                  {kiosco.subscription?.managementUrl && (
                    <a
                      href={kiosco.subscription.managementUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost"
                      style={{ textDecoration: "none" }}
                    >
                      Abrir en Mercado Pago
                    </a>
                  )}
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
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>Override manual</div>
                    <strong>{overrideLabel}</strong>
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

                  <div style={{ display: "grid", gap: "18px" }}>
                    <form action={setAccessOverride} style={{ display: "grid", gap: "10px" }}>
                      <input type="hidden" name="kioscoId" value={kiosco.id} />
                      <div style={{ fontWeight: 700 }}>Habilitar o bloquear manualmente</div>
                      <select name="override" className="input" defaultValue={kiosco.accessOverride}>
                        <option value={KioscoAccessOverride.INHERIT}>Seguir suscripcion o gracia</option>
                        <option value={KioscoAccessOverride.FORCE_ALLOW}>Habilitar manualmente</option>
                        <option value={KioscoAccessOverride.FORCE_BLOCK}>Bloquear manualmente</option>
                      </select>
                      <textarea
                        name="note"
                        className="input"
                        placeholder="Motivo interno"
                        rows={3}
                        defaultValue={kiosco.accessOverrideNote ?? ""}
                        style={{ resize: "vertical" }}
                      />
                      <button type="submit" className="btn btn-secondary">
                        Guardar override
                      </button>
                      {kiosco.accessOverrideAt && (
                        <div style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5 }}>
                          Ultimo cambio: {formatDate(kiosco.accessOverrideAt)}
                          {kiosco.accessOverrideBy && (
                            <>
                              {" "}
                              por {kiosco.accessOverrideBy.name || kiosco.accessOverrideBy.email}
                            </>
                          )}
                        </div>
                      )}
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
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
