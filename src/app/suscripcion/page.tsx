import { auth, signOut } from "@/lib/auth";
import {
  getAccessBlockMessage,
  getKioscoAccessContextForSession,
} from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { syncSubscriptionFromMercadoPago } from "@/lib/subscription";
import SubscriptionActions from "@/components/subscription/SubscriptionActions";
import { redirect } from "next/navigation";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function SubscriptionPage() {
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

  if (session.user.role !== "EMPLOYEE" && kiosco?.subscription?.id) {
    try {
      await syncSubscriptionFromMercadoPago(kiosco.subscription.id);
    } catch {
      // Dejamos el ultimo estado persistido si MP no responde.
    }
  }

  const freshAccess = await getKioscoAccessContextForSession(session.user);
  if (freshAccess.allowed) {
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
        </div>

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
      </div>
    </div>
  );
}
