import { randomUUID } from "crypto";

import { PlatformCouponDuration, PlatformCouponType } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import PlatformCouponGenerator from "./PlatformCouponGenerator";
import PlatformCouponQrActions from "./PlatformCouponQrActions";
import { auth } from "@/lib/auth";
import {
  getPlatformCouponBenefitLabel,
  getPlatformCouponDurationLabel,
} from "@/lib/platform-coupons";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateTimeLocalInput(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function generatePlatformCouponCode() {
  const token = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `CLK-${token.slice(0, 4)}-${token.slice(4, 8)}`;
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

async function togglePlatformCoupon(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const couponId = String(formData.get("couponId") ?? "");
  const nextActive = String(formData.get("nextActive") ?? "") === "true";

  if (!couponId) {
    return;
  }

  await prisma.platformCoupon.update({
    where: { id: couponId },
    data: { isActive: nextActive },
  });

  revalidatePath("/admin/platform-coupons");
}

export default async function PlatformCouponsPage() {
  await ensurePlatformAdmin();

  const coupons = await prisma.platformCoupon.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      trialDays: true,
      discountPct: true,
      duration: true,
      durationMonths: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      note: true,
      isActive: true,
      createdAt: true,
      createdByEmail: true,
    },
  });

  const defaultExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div style={{ display: "grid", gap: "20px" }}>
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
          <div
            style={{
              fontSize: "13px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#94a3b8",
            }}
          >
            Growth
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: "34px" }}>Cupones de Plataforma</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/admin/negocios" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Ver overrides
          </Link>
          <Link href="/register" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            Abrir registro
          </Link>
        </div>
      </div>

      <section
        style={{
          background: "rgba(15,23,42,.82)",
          border: "1px solid rgba(148,163,184,.18)",
          borderRadius: "22px",
          padding: "20px",
          display: "grid",
        }}
      >
        <PlatformCouponGenerator
          defaultExpiresAt={formatDateTimeLocalInput(defaultExpiresAt)}
          placeholderCode={generatePlatformCouponCode()}
        />
      </section>

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
          <h2 style={{ margin: 0, fontSize: "24px" }}>Cupones existentes</h2>
          <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
            Cada cupon muestra su beneficio, estado de uso y un acceso directo al registro con
            el codigo precargado.
          </div>
        </div>

        {coupons.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>Todavia no hay cupones de plataforma creados.</div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {coupons.map((coupon) => {
              const registerHref = `/register?coupon=${encodeURIComponent(coupon.code)}`;
              const benefitLabel =
                getPlatformCouponBenefitLabel(coupon) || "Sin beneficio definido";
              const durationLabel =
                typeof coupon.discountPct === "number" && coupon.discountPct > 0
                  ? getPlatformCouponDurationLabel(coupon.duration, coupon.durationMonths)
                  : "No aplica";

              return (
                <article
                  key={coupon.id}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "18px",
                    background: "rgba(30,41,59,.82)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong style={{ fontSize: "18px" }}>{coupon.code}</strong>
                      <span style={{ color: "#94a3b8", fontSize: "13px" }}>{benefitLabel}</span>
                    </div>
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 800,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: coupon.isActive ? "#bbf7d0" : "#fecaca",
                        background: coupon.isActive
                          ? "rgba(34,197,94,.12)"
                          : "rgba(239,68,68,.12)",
                        border: coupon.isActive
                          ? "1px solid rgba(34,197,94,.22)"
                          : "1px solid rgba(239,68,68,.22)",
                      }}
                    >
                      {coupon.isActive ? "Activo" : "Pausado"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(15,23,42,.75)",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                        Tipo
                      </div>
                      <strong>
                        {coupon.type === PlatformCouponType.TRIAL_DAYS ? "Trial" : "Descuento"}
                      </strong>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(15,23,42,.75)",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                        Duracion
                      </div>
                      <strong>{durationLabel}</strong>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(15,23,42,.75)",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                        Uso
                      </div>
                      <strong>
                        {coupon.usedCount} / {coupon.maxUses}
                      </strong>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(15,23,42,.75)",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                        Expira
                      </div>
                      <strong>{formatDate(coupon.expiresAt)}</strong>
                    </div>
                  </div>

                  {coupon.note ? (
                    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
                      {coupon.note}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                      Creado {formatDate(coupon.createdAt)} por {coupon.createdByEmail ?? "admin"}
                    </span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <Link
                        href={registerHref}
                        className="btn btn-ghost"
                        style={{ textDecoration: "none" }}
                      >
                        Abrir link
                      </Link>
                      <PlatformCouponQrActions
                        code={coupon.code}
                        expiresAt={coupon.expiresAt.toISOString()}
                        benefitLabel={benefitLabel}
                        note={coupon.note}
                        registerPath={registerHref}
                      />
                      <form action={togglePlatformCoupon}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={coupon.isActive ? "false" : "true"}
                        />
                        <button type="submit" className="btn btn-secondary">
                          {coupon.isActive ? "Pausar" : "Reactivar"}
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
