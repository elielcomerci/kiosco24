import { auth, signOut } from "@/lib/auth";
import {
  getAccessBlockMessage,
  getKioscoAccessContextForSession,
} from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPriceOverrideForEmail } from "@/lib/subscription-price-overrides";
import { syncSubscriptionFromMercadoPago } from "@/lib/subscription";
import { resolveSubscriptionPricing } from "@/lib/subscription-offers";
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PRICE_ARS,
  formatSubscriptionPrice,
  getSubscriptionPromoLabel,
} from "@/lib/subscription-plan";
import BrandLogo from "@/components/branding/BrandLogo";
import SubscriptionActions from "@/components/subscription/SubscriptionActions";
import { redirect } from "next/navigation";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; refresh?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (isPlatformAdmin(session.user)) {
    redirect("/admin");
  }

  const access = await getKioscoAccessContextForSession(session.user);

  if (access.reason === "NO_KIOSCO") {
    redirect("/onboarding");
  }

  const kiosco = access.kioscoId
    ? await prisma.kiosco.findUnique({
        where: { id: access.kioscoId },
        select: {
          id: true,
          name: true,
          branches: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
          subscription: {
            select: {
              id: true,
              status: true,
              managementUrl: true,
              updatedAt: true,
            },
          },
          subscriptionOfferPriceArs: true,
          subscriptionOfferFreezeEndsAt: true,
          accessGrants: {
            where: {
              revokedAt: null,
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              kind: true,
              startsAt: true,
              endsAt: true,
              note: true,
              revokedAt: true,
            },
          },
        },
      })
    : null;

  const query = await searchParams;
  const shouldAttemptSync =
    session.user.role !== "EMPLOYEE" &&
    Boolean(kiosco?.subscription?.id) &&
    (
      kiosco?.subscription?.status === "PENDING" ||
      query.source === "mercadopago" ||
      query.refresh === "1"
    );

  if (shouldAttemptSync && kiosco?.subscription?.id) {
    try {
      await syncSubscriptionFromMercadoPago(kiosco.subscription.id);
    } catch {
      // Dejamos el ultimo estado persistido si MP no responde.
    }
  }

  const freshAccess = await getKioscoAccessContextForSession(session.user);
  const isMercadoPagoReturn = query.source === "mercadopago";
  const priceOverride =
    session.user.role === "EMPLOYEE"
      ? null
      : await getSubscriptionPriceOverrideForEmail(session.user.email);
  const pricing = resolveSubscriptionPricing({
    emailOverrideAmount: priceOverride?.amount ?? null,
    offerPriceArs: kiosco?.subscriptionOfferPriceArs ?? null,
    offerFreezeEndsAt: kiosco?.subscriptionOfferFreezeEndsAt ?? null,
  });
  const hasSpecialPrice = pricing.amountArs < SUBSCRIPTION_PRICE_ARS;

  if (freshAccess.allowed && !isMercadoPagoReturn) {
    redirect(freshAccess.firstBranchId ? `/${freshAccess.firstBranchId}/caja` : "/");
  }

  const latestKiosco = freshAccess.kioscoId
    ? await prisma.kiosco.findUnique({
        where: { id: freshAccess.kioscoId },
        select: {
          name: true,
          subscription: {
            select: {
              status: true,
              managementUrl: true,
              updatedAt: true,
            },
          },
        },
      })
    : null;

  const subscription = latestKiosco?.subscription ?? kiosco?.subscription ?? null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at top right, rgba(34,197,94,.18), transparent 30%), linear-gradient(180deg, #0f172a 0%, #020617 100%)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "560px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {freshAccess.allowed && isMercadoPagoReturn ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "center", padding: "16px 0" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <BrandLogo tone="white" width={168} />
            </div>
            <div style={{ fontSize: "56px" }}>{"\uD83C\uDF89"}</div>
            <h1 style={{ fontSize: "28px", margin: 0, fontWeight: 800 }}>¡Gracias por sumarte a Clikit!</h1>
            <p style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6, fontSize: "16px" }}>
              El cobro se está procesando. Ya podés disfrutar de todas las herramientas exclusivas para manejar tu negocio al siguiente nivel.
            </p>
            <a 
              href={freshAccess.firstBranchId ? `/${freshAccess.firstBranchId}/caja` : "/"} 
              className="btn btn-primary btn-lg" 
              style={{ marginTop: "16px", textDecoration: "none", width: "100%", justifyContent: "center" }}
            >
              Ir a Clikit
            </a>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "13px", color: "var(--text-3)", fontWeight: 700 }}>
            Acceso restringido
          </div>
          <h1 style={{ fontSize: "30px", lineHeight: 1.1, margin: 0 }}>
            {session.user.role === "EMPLOYEE"
              ? "Este kiosco no tiene acceso vigente"
              : "Necesitas una suscripcion activa para usar el sistema"}
          </h1>
          <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
            {getAccessBlockMessage(freshAccess.reason)}
          </p>
          {session.user.role !== "EMPLOYEE" && (
            <p style={{ margin: 0, color: "var(--text-3)", lineHeight: 1.6, fontSize: "14px" }}>
              {hasSpecialPrice ? (
                <>
                  Precio especial para tu cuenta:{" "}
                  <span style={{ textDecoration: "line-through", opacity: 0.8 }}>
                    {formatSubscriptionPrice(SUBSCRIPTION_PRICE_ARS)}
                  </span>{" "}
                  <strong style={{ color: "var(--green)" }}>{formatSubscriptionPrice(pricing.amountArs)}</strong>.{" "}
                  {SUBSCRIPTION_CANCEL_LABEL}
                </>
              ) : (
                `${getSubscriptionPromoLabel(pricing.amountArs)} ${SUBSCRIPTION_CANCEL_LABEL}`
              )}
            </p>
          )}
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: "18px",
            background: "rgba(15,23,42,.72)",
            border: "1px solid var(--border)",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Kiosco</span>
            <strong>{freshAccess.kioscoName ?? latestKiosco?.name ?? "Sin configurar"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Estado de suscripcion</span>
            <strong>{subscription?.status ?? "SIN_CONFIGURAR"}</strong>
          </div>
          {subscription?.updatedAt && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Ultima sincronizacion</span>
              <strong>{formatDate(subscription.updatedAt)}</strong>
            </div>
          )}
          {freshAccess.activeGrant && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Acceso temporal</span>
              <strong>
                {freshAccess.activeGrant.kind === "ADMIN_INVITE" ? "Invitacion vigente" : "Gracia administrativa"} hasta{" "}
                {formatDate(freshAccess.activeGrant.endsAt)}
              </strong>
            </div>
          )}
          {freshAccess.manualOverride && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Decision administrativa</span>
              <strong>
                {freshAccess.manualOverride.mode === "FORCE_BLOCK"
                  ? "Bloqueo manual vigente"
                  : "Habilitacion manual vigente"}
              </strong>
            </div>
          )}
        </div>

        {freshAccess.manualOverride?.note && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "rgba(245,158,11,.10)",
              border: "1px solid rgba(245,158,11,.24)",
              color: "var(--text-2)",
              lineHeight: 1.6,
            }}
          >
            Motivo administrativo: {freshAccess.manualOverride.note}
          </div>
        )}

        {session.user.role === "EMPLOYEE" ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "rgba(59,130,246,.10)",
              border: "1px solid rgba(59,130,246,.2)",
              color: "var(--text-2)",
              lineHeight: 1.6,
            }}
          >
            Pedile al dueño del negocio que active la suscripcion o que gestione un periodo de gracia.
          </div>
        ) : (
          <SubscriptionActions
            canCreateSubscription={subscription?.status !== "ACTIVE"}
            managementUrl={subscription?.managementUrl ?? null}
            priceArs={pricing.amountArs}
            compareAtPriceArs={hasSpecialPrice ? SUBSCRIPTION_PRICE_ARS : null}
            origin="SUBSCRIPTION_PAGE"
          />
        )}

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="btn btn-ghost" style={{ width: "100%" }}>
            Salir
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
