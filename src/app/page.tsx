import Link from "next/link";

import BrandLogo from "@/components/branding/BrandLogo";
import { auth, signOut } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PROMO_LABEL,
} from "@/lib/subscription-plan";

const painPoints = [
  {
    title: "Cobras rapido, pero despues nadie sabe que falta comprar",
    desc: "La venta sale, pero el stock queda en la cabeza de quien atendio. Cuando hay dos turnos o dos sucursales, eso explota.",
  },
  {
    title: "Cada kiosco termina trabajando distinto",
    desc: "Fotos distintas, nombres desprolijos, precios duplicados, listas incompletas. El sistema se vuelve una carga en vez de ordenar.",
  },
  {
    title: "Cuando el cliente pide un comprobante, todo se vuelve mas lento",
    desc: "Ticket no fiscal, Factura C, WhatsApp, impresion o PDF. Si eso frena la caja, el sistema deja de ayudar.",
  },
] as const;

const operatingFlow = [
  {
    step: "1. Vendes sin friccion",
    desc: "Caja rapida, lector de barras, variantes, fiados, stock negativo opcional y tickets listos para salir despues de la venta.",
  },
  {
    step: "2. El sistema ordena solo",
    desc: "Minimos de stock, lotes con vencimiento, productos sin foto, sincronizacion con base colaborativa y alertas claras para actuar a tiempo.",
  },
  {
    step: "3. Escalas sin romper nada",
    desc: "Sucursales, precios compartidos o locales, transferencias, importacion y exportacion en planilla, historial de tickets y Factura C opcional.",
  },
] as const;

const featureGroups = [
  {
    title: "Caja pensada para kiosco real",
    desc: "Venta tactil, barcode, variantes, fiados, venta con stock en 0 si el duenio lo habilita, confirmacion antes de vender en negativo y cierre rapido.",
  },
  {
    title: "Stock que te avisa antes del problema",
    desc: "Minimos visibles, bordes por estado, vencimientos por lote, transferencias entre sucursales con estrategia de lotes y carga de stock sin cuentas mentales.",
  },
  {
    title: "Catalogo curado y sincronizado",
    desc: "Base colaborativa con fotos buenas, nombres corregidos, sync manual o auto, push de imagenes y textos a productos existentes y sugerencias por nombre o barcode.",
  },
  {
    title: "Comprobantes sin frenar la venta",
    desc: "Ticket no fiscal, Factura C con formato ticket, PDF propio, WhatsApp, impresion normal o termica y configuracion por sucursal.",
  },
  {
    title: "Multi-sucursal sin caos",
    desc: "Precios compartidos o separados, stock siempre individual, replicacion de catalogo, importacion/exportacion editable y reglas operativas por sucursal.",
  },
  {
    title: "Instalable y listo para usar",
    desc: "Funciona como app, con icono en celular o PC, imagenes optimizadas, carga rapida y una interfaz hecha para atender sin distraerse.",
  },
] as const;

const differentiators = [
  "Base colaborativa con curado central y sincronizacion controlada hacia cada kiosco.",
  "Factura C, ticket no fiscal y modo termica dentro del mismo flujo, sin frenar caja.",
  "Stock negativo opcional por sucursal, pensado para kioscos chicos que venden antes de cargar mercaderia.",
  "Importacion, exportacion y replica de catalogo para crecer de una sucursal a varias sin volver a empezar.",
] as const;

export default async function LandingPage() {
  const session = await auth();

  let branchId = session?.user?.branchId ?? null;
  if (!branchId && session?.user?.role === "EMPLOYEE" && session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { branches: { take: 1, select: { id: true } } },
    });
    branchId = employee?.branches[0]?.id ?? null;
  }

  if (session?.user?.id && !branchId) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        kiosco: {
          include: { branches: { take: 1 } },
        },
      },
    });
    branchId = user?.kiosco?.branches[0]?.id ?? null;
  }

  const appHref = isPlatformAdmin(session?.user) ? "/admin" : branchId ? `/${branchId}/caja` : "/onboarding";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,.18), transparent 28%), radial-gradient(circle at top right, rgba(34,197,94,.12), transparent 24%), linear-gradient(180deg, #07111f 0%, #030712 45%, #020617 100%)",
        color: "#f8fafc",
        fontFamily: "var(--font-open-sans), sans-serif",
      }}
    >
      <header
        style={{
          padding: "20px 5%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(148,163,184,.12)",
          position: "sticky",
          top: 0,
          backdropFilter: "blur(18px)",
          background: "rgba(2,6,23,.78)",
          zIndex: 20,
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <BrandLogo tone="white" width={152} />
          <div style={{ color: "#94a3b8", fontSize: "12px", letterSpacing: ".08em", textTransform: "uppercase" }}>
            Sistema operativo para kioscos
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {session ? (
            <>
              <Link href={appHref} className="btn btn-primary" style={{ borderRadius: "999px", padding: "10px 18px" }}>
                {isPlatformAdmin(session.user) ? "Ir al admin" : "Abrir mi kiosco"}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="btn btn-secondary" style={{ borderRadius: "999px", padding: "10px 18px" }}>
                  Salir
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ borderRadius: "999px", padding: "10px 18px" }}>
                Entrar
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ borderRadius: "999px", padding: "10px 18px" }}>
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "56px 5% 96px", display: "grid", gap: "80px" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "28px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "22px" }}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                padding: "8px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(59,130,246,.22)",
                background: "rgba(37,99,235,.12)",
                color: "#bfdbfe",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
              }}
            >
              Menos memoria. Menos cuaderno. Menos caos.
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(38px, 7vw, 72px)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.05em",
                  fontWeight: 900,
                }}
              >
                El sistema que hace que tu kiosco deje de depender de acordarse de todo.
              </h1>
              <p style={{ margin: 0, maxWidth: "760px", color: "#cbd5e1", fontSize: "20px", lineHeight: 1.7 }}>
                Vendes rapido, controlas stock real, ordenas fiados, emites ticket o Factura C y mantienes varias sucursales sin duplicar trabajo. Todo en una herramienta hecha para atender, no para pelearse con el sistema.
              </p>
            </div>

            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              {session ? (
                <Link href={appHref} className="btn btn-primary btn-lg" style={{ padding: "16px 28px" }}>
                  {isPlatformAdmin(session.user) ? "Entrar al admin" : "Abrir mi kiosco"}
                </Link>
              ) : (
                <Link href="/register" className="btn btn-primary btn-lg" style={{ padding: "16px 28px" }}>
                  Crear mi cuenta
                </Link>
              )}
              <a href="#dolor" className="btn btn-secondary btn-lg" style={{ padding: "16px 28px" }}>
                Ver si te pasa esto
              </a>
            </div>

            {!session && (
              <div style={{ display: "grid", gap: "6px", color: "#94a3b8", fontSize: "14px" }}>
                <div>{SUBSCRIPTION_PROMO_LABEL}</div>
                <div>{SUBSCRIPTION_CANCEL_LABEL}</div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "22px",
              borderRadius: "28px",
              background: "linear-gradient(180deg, rgba(15,23,42,.92), rgba(2,6,23,.92))",
              border: "1px solid rgba(148,163,184,.16)",
              boxShadow: "0 28px 90px rgba(2,6,23,.45)",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: "12px", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 800 }}>
              Lo que ya resuelve hoy
            </div>
            {[
              "Venta tactil y barcode para atender rapido.",
              "Stock negativo opcional por sucursal.",
              "Vencimientos por lote y alertas de minimo visibles.",
              "Ticket no fiscal, Factura C, WhatsApp y PDF.",
              "Base colaborativa con fotos y textos sincronizables.",
              "Precios por sucursal o compartidos.",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(148,163,184,.09)",
                  color: "#e2e8f0",
                }}
              >
                <span style={{ color: "#22c55e", fontWeight: 900 }}>+</span>
                <span style={{ lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
          }}
        >
          {[
            { label: "Atencion rapida", value: "Caja lista para tactil y barcode" },
            { label: "Stock real", value: "Minimos, lotes, alertas y negativo opcional" },
            { label: "Comprobantes", value: "Ticket, Factura C, PDF, WhatsApp e impresion" },
            { label: "Escala", value: "Sucursales, sync y catalogo colaborativo" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                border: "1px solid rgba(148,163,184,.14)",
                background: "rgba(15,23,42,.72)",
                display: "grid",
                gap: "6px",
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>{item.label}</div>
              <div style={{ fontWeight: 800, fontSize: "18px", lineHeight: 1.35 }}>{item.value}</div>
            </div>
          ))}
        </section>

        <section id="dolor" style={{ display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "10px", maxWidth: "760px" }}>
            <div style={{ color: "#93c5fd", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
              El dolor primero
            </div>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 48px)", lineHeight: 1.08, letterSpacing: "-0.04em" }}>
              Si tu kiosco vive de memoria, mensajes y cuadernos, el problema no es vender: es sostener el orden.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            {painPoints.map((item) => (
              <article
                key={item.title}
                style={{
                  padding: "24px",
                  borderRadius: "22px",
                  border: "1px solid rgba(148,163,184,.14)",
                  background: "rgba(15,23,42,.78)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.16)" }} />
                <h3 style={{ margin: 0, fontSize: "22px", lineHeight: 1.2 }}>{item.title}</h3>
                <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.7 }}>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "18px",
          }}
        >
          <div
            style={{
              padding: "28px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.9))",
              border: "1px solid rgba(148,163,184,.16)",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ color: "#86efac", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Como se ordena
            </div>
            {operatingFlow.map((item) => (
              <div key={item.step} style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontWeight: 800, fontSize: "18px" }}>{item.step}</div>
                <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "28px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, rgba(8,47,73,.88), rgba(15,23,42,.92))",
              border: "1px solid rgba(56,189,248,.16)",
              display: "grid",
              gap: "14px",
            }}
          >
            <div style={{ color: "#bae6fd", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Lo que no suele traer otro sistema
            </div>
            {differentiators.map((item) => (
              <div key={item} style={{ display: "flex", gap: "10px", color: "#e0f2fe", lineHeight: 1.7 }}>
                <span style={{ color: "#38bdf8", fontWeight: 900 }}>+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="features" style={{ display: "grid", gap: "18px" }}>
          <div style={{ display: "grid", gap: "10px", maxWidth: "760px" }}>
            <div style={{ color: "#fdba74", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Features completas
            </div>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.04em" }}>
              Primero te saca el dolor. Despues te da control fino para hacer crecer el kiosco.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            {featureGroups.map((feature) => (
              <article
                key={feature.title}
                style={{
                  padding: "24px",
                  borderRadius: "22px",
                  background: "rgba(15,23,42,.78)",
                  border: "1px solid rgba(148,163,184,.14)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ width: "48px", height: "48px", borderRadius: "16px", background: "rgba(249,115,22,.14)", border: "1px solid rgba(249,115,22,.18)" }} />
                <h3 style={{ margin: 0, fontSize: "22px", lineHeight: 1.2 }}>{feature.title}</h3>
                <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.7 }}>{feature.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            padding: "30px",
            borderRadius: "28px",
            border: "1px solid rgba(148,163,184,.14)",
            background: "linear-gradient(135deg, rgba(37,99,235,.16), rgba(2,6,23,.92))",
            display: "grid",
            gap: "18px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "grid", gap: "8px", justifyItems: "center" }}>
            <div style={{ color: "#bfdbfe", fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Listo para probar
            </div>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.08, letterSpacing: "-0.04em" }}>
              Si tu kiosco necesita orden sin volverse lento, por ahi es.
            </h2>
            <p style={{ margin: 0, color: "#dbeafe", maxWidth: "760px", lineHeight: 1.7 }}>
              Empieza con una sola sucursal, ordena stock, tickets, fiados y catalogo. Cuando crezcas, el sistema ya esta preparado para acompanarte.
            </p>
          </div>

          <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
            {session ? (
              <Link href={appHref} className="btn btn-primary btn-lg" style={{ padding: "16px 30px" }}>
                Entrar ahora
              </Link>
            ) : (
              <Link href="/register" className="btn btn-primary btn-lg" style={{ padding: "16px 30px" }}>
                Crear mi cuenta
              </Link>
            )}
            {!session && (
              <Link href="/login" className="btn btn-secondary btn-lg" style={{ padding: "16px 30px" }}>
                Ya tengo cuenta
              </Link>
            )}
          </div>

          {!session && (
            <div style={{ display: "grid", gap: "6px", color: "#bfdbfe", fontSize: "14px" }}>
              <div>{SUBSCRIPTION_PROMO_LABEL}</div>
              <div>{SUBSCRIPTION_CANCEL_LABEL}</div>
            </div>
          )}
        </section>
      </main>

      <footer
        style={{
          padding: "32px 5% 48px",
          borderTop: "1px solid rgba(148,163,184,.1)",
          textAlign: "center",
          color: "#64748b",
        }}
      >
        <span style={{ display: "inline-grid", justifyItems: "center", gap: "10px" }}>
          <BrandLogo tone="white" width={118} />
          <span>Clikit by ZAP.</span>
        </span>
      </footer>
    </div>
  );
}
