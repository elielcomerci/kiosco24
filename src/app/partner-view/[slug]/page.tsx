import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import BrandLogo from "@/components/branding/BrandLogo";
import { SUBSCRIPTION_PROMO_LABEL } from "@/lib/subscription-plan";
import ReferralCookieSetter from "./ReferralCookieSetter";

interface PartnerViewPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PartnerViewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const partner = await prisma.partnerProfile.findUnique({
    where: { referralCode: slug },
    select: {
      user: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!partner) return { title: "Vendedor no encontrado | Clikit" };

  const displayName =
    partner.user.name ??
    [partner.user.firstName, partner.user.lastName].filter(Boolean).join(" ") ??
    "Vendedor Clikit";

  return {
    title: `Registrate con ${displayName} · Clikit`,
    description: `${displayName} te invita a probar Clikit: el sistema operativo para negocios. Ordená stock, ventas y caja en tiempo real.`,
    openGraph: {
      title: `Registrate con ${displayName} · Clikit`,
      description: `Ordená stock, ventas y caja en tiempo real. Activás cuando querás.`,
      type: "website",
    },
  };
}

export default async function PartnerViewPage({ params }: PartnerViewPageProps) {
  const { slug } = await params;

  const partner = await prisma.partnerProfile.findUnique({
    where: { referralCode: slug },
    select: {
      id: true,
      isApproved: true,
      user: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          image: true,
          createdAt: true,
        },
      },
      _count: false,
    },
  });

  if (!partner) notFound();

  const displayName =
    partner.user.name ??
    [partner.user.firstName, partner.user.lastName].filter(Boolean).join(" ") ??
    "Vendedor Clikit";

  const initials = (partner.user.firstName?.[0] ?? partner.user.name?.[0] ?? "P").toUpperCase();
  const registerHref = `/register?ref=${encodeURIComponent(slug)}`;
  const year = new Date().getFullYear();

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');

        .pv-scope {
          --bg:#06080d;--s1:#0e1420;--s2:#131b2a;--s3:#0a0f1a;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
          --text:#eef2f7;--muted:#6b7e96;--muted2:#8fa3ba;
          --gold:#f5a623;--gold-dim:rgba(245,166,35,0.11);--gold-border:rgba(245,166,35,0.28);
          --green:#22d98a;--green-dim:rgba(34,217,138,0.1);--green-border:rgba(34,217,138,0.25);
          --red:#f87171;--red-dim:rgba(248,113,113,0.1);
          --blue:#4da6ff;--blue-dim:rgba(77,166,255,0.08);--blue-border:rgba(77,166,255,0.22);
          --fd:'Bricolage Grotesque',sans-serif;--fb:'Instrument Sans',sans-serif;
          background:var(--bg);color:var(--text);font-family:var(--fb);font-size:16px;line-height:1.6;overflow-x:hidden;
          min-height:100vh;
        }
        .pv-scope * { box-sizing:border-box;margin:0;padding:0 }

        .pv-nav {position:sticky;top:0;z-index:100;display:flex;justify-content:space-between;align-items:center;padding:14px 5%;background:rgba(6,8,13,0.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
        .pv-logo {display:grid;gap:1px}
        .pv-logo-sub {font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
        .pv-nav-right {display:flex;gap:10px;align-items:center;flex-wrap:wrap}

        .pv-btn {display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--fb);font-size:14px;font-weight:600;border-radius:999px;padding:9px 20px;cursor:pointer;text-decoration:none;transition:all .18s;border:none;white-space:nowrap}
        .pv-btn-ghost {background:transparent;color:var(--muted2);border:1px solid var(--border2)}
        .pv-btn-ghost:hover {color:var(--text);border-color:rgba(255,255,255,0.22)}
        .pv-btn-cta {background:var(--gold);color:#1a0f00;font-weight:700}
        .pv-btn-cta:hover {background:#f9b840;transform:translateY(-1px)}
        .pv-btn-lg {padding:15px 30px;font-size:16px}
        .pv-btn-outline {background:transparent;color:var(--text);border:1px solid var(--border2)}
        .pv-btn-outline:hover {border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.04)}

        .pv-hero-wrap {max-width:1200px;margin:0 auto;padding:80px 5% 0;display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
        @media(max-width:820px){.pv-hero-wrap{grid-template-columns:1fr;gap:48px;padding:56px 5% 0}}
        .pv-hero-left {display:grid;gap:0}
        .pv-eyebrow {display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:999px;background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px;width:fit-content}
        .pv-dot {width:6px;height:6px;border-radius:50%;background:var(--gold);animation:pv-blink 2s ease-in-out infinite}
        @keyframes pv-blink{0%,100%{opacity:1}50%{opacity:.3}}
        .pv-hero-left h1 {font-family:var(--fd);font-size:clamp(38px,5.2vw,66px);font-weight:800;line-height:1.0;letter-spacing:-0.045em;margin-bottom:20px}
        .pv-hero-left h1 em {font-style:normal;color:var(--gold)}
        .pv-hero-sub {font-size:18px;color:var(--muted2);line-height:1.7;margin-bottom:32px;max-width:500px}
        .pv-hero-sub strong {color:var(--text);font-weight:600}
        .pv-hero-ctas {display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
        .pv-hero-proof {display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}

        /* PARTNER CARD (replaces iPhone) */
        .pv-partner-mockup {display:flex;justify-content:center;align-items:center;position:relative;animation:pv-fadeUp .7s ease .2s both}
        .pv-partner-card {width:280px;background:var(--s2);border-radius:20px;border:1px solid var(--border);padding:32px 24px;text-align:center;box-shadow:0 0 0 1px rgba(0,0,0,0.8),0 40px 80px rgba(0,0,0,0.7);position:relative}
        .pv-partner-glow {position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;height:400px;border-radius:50%;background:radial-gradient(ellipse,rgba(245,166,35,0.1) 0%,transparent 70%);pointer-events:none;z-index:-1}
        .pv-avatar {width:72px;height:72px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;font-size:26px;font-weight:800;background:linear-gradient(135deg,var(--gold-dim),var(--green-dim));border:2px solid var(--gold-border);color:var(--gold);overflow:hidden;flex-shrink:0}
        .pv-avatar img {width:100%;height:100%;object-fit:cover;border-radius:50%}
        .pv-pcard-name {font-family:var(--fd);font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px}
        .pv-pcard-role {font-size:12px;color:var(--muted);margin-bottom:20px}
        .pv-pcard-stats {display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
        .pv-pstat {background:var(--s1);border-radius:10px;padding:10px;border:1px solid var(--border)}
        .pv-pstat-val {font-family:var(--fd);font-size:18px;font-weight:800;color:var(--gold)}
        .pv-pstat-lbl {font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
        .pv-pcard-badge {display:inline-flex;padding:5px 14px;border-radius:999px;font-size:11px;font-weight:700}
        .pv-pcard-badge--approved {background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
        .pv-pcard-badge--pending {background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.25);color:var(--gold)}
        .pv-pcard-since {font-size:10px;color:var(--muted);margin-top:12px}
        .pv-pcard-link {display:block;margin-top:14px;font-size:12px;color:var(--gold);font-weight:600;text-decoration:none}

        .pv-trust {display:flex;justify-content:center;align-items:center;gap:24px;flex-wrap:wrap;padding:20px 5%;max-width:1200px;margin:44px auto 0;border:1px solid var(--border);border-radius:16px;background:var(--s1)}
        .pv-t-item {display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted2)}
        .pv-tick {width:16px;height:16px;border-radius:50%;background:var(--green-dim);border:1px solid var(--green-border);display:grid;place-items:center;flex-shrink:0}
        .pv-tick svg {width:8px;height:8px}

        .pv-div {height:1px;background:var(--border);max-width:1200px;margin:0 auto}
        .pv-section {padding:88px 5%;max-width:1200px;margin:0 auto}
        .pv-lbl {font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}
        .pv-lbl-red {color:var(--red)} .pv-lbl-green {color:var(--green)} .pv-lbl-gold {color:var(--gold)} .pv-lbl-blue {color:var(--blue)}
        .pv-section h2 {font-family:var(--fd);font-size:clamp(28px,4vw,48px);font-weight:800;letter-spacing:-0.04em;line-height:1.08;margin-bottom:44px;max-width:750px;color:var(--text)}

        .pv-pain-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
        .pv-pain-card {padding:28px;border-radius:20px;background:var(--s1);border:1px solid var(--border);position:relative;overflow:hidden;display:grid;gap:14px;transition:border-color .2s}
        .pv-pain-card:hover {border-color:var(--border2)}
        .pv-pain-card::after {content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),transparent)}
        .pv-pain-n {font-family:var(--fd);font-size:38px;font-weight:800;color:rgba(248,113,113,0.1);line-height:1}
        .pv-pain-t {font-size:18px;font-weight:700;line-height:1.25}
        .pv-pain-d {font-size:14px;color:var(--muted2);line-height:1.7}
        .pv-pain-sol {display:flex;align-items:flex-start;gap:8px;padding:11px 13px;background:var(--green-dim);border:1px solid var(--green-border);border-radius:10px;font-size:13px;color:#c4f5e0;line-height:1.55}
        .pv-ps-i {color:var(--green);flex-shrink:0;font-weight:700}

        .pv-feat-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
        .pv-feat-card {padding:26px;border-radius:18px;background:var(--s1);border:1px solid var(--border);display:grid;gap:12px;transition:border-color .2s,transform .18s}
        .pv-feat-card:hover {border-color:var(--border2);transform:translateY(-2px)}
        .pv-feat-t {font-size:16px;font-weight:600;line-height:1.3}
        .pv-feat-d {font-size:14px;color:var(--muted2);line-height:1.65}
        .pv-tag {display:inline-flex;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;margin-top:2px}
        .pv-tag-gold {background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold)}
        .pv-tag-green {background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
        .pv-tag-blue {background:var(--blue-dim);border:1px solid var(--blue-border);color:var(--blue)}

        .pv-cta-wrap {margin:0 5% 80px;padding:64px 48px;border-radius:24px;background:linear-gradient(135deg,rgba(245,166,35,0.09),rgba(6,8,13,.98));border:1px solid var(--gold-border);text-align:center;position:relative;overflow:hidden}
        .pv-cta-glow {position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:300px;border-radius:50%;background:radial-gradient(ellipse,rgba(245,166,35,0.07),transparent 70%);pointer-events:none}
        .pv-cta-wrap h2 {max-width:680px;margin:0 auto 14px;font-family:var(--fd);font-size:clamp(26px,4vw,46px);font-weight:800;letter-spacing:-0.04em;line-height:1.08;position:relative}
        .pv-cta-wrap p {color:var(--muted2);font-size:17px;margin-bottom:32px;position:relative;max-width:540px;margin-left:auto;margin-right:auto}
        .pv-cta-btns {display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative;margin-bottom:18px}
        .pv-cta-fine {font-size:13px;color:var(--muted)}

        .pv-footer {padding:32px 5%;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
        .pv-f-logo {font-family:var(--fd);font-size:17px;font-weight:800;letter-spacing:-0.04em}
        .pv-f-logo b {color:var(--gold)}
        .pv-f-copy {font-size:13px;color:var(--muted)}

        @keyframes pv-fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .pv-hero-left>*{animation:pv-fadeUp .55s ease both}
        .pv-hero-left>*:nth-child(1){animation-delay:.04s}
        .pv-hero-left>*:nth-child(2){animation-delay:.13s}
        .pv-hero-left>*:nth-child(3){animation-delay:.22s}
        .pv-hero-left>*:nth-child(4){animation-delay:.30s}
        .pv-hero-left>*:nth-child(5){animation-delay:.37s}
        `
      }} />

      <div className="pv-scope">
        <ReferralCookieSetter slug={slug} />

        {/* NAV */}
        <nav className="pv-nav">
          <div className="pv-logo">
            <BrandLogo tone="white" width={110} />
            <div className="pv-logo-sub">El Sistema Operativo para Negocios</div>
          </div>
          <div className="pv-nav-right">
            <Link href="/login" className="pv-btn pv-btn-ghost">Entrar</Link>
            <Link href={registerHref} className="pv-btn pv-btn-cta">Probar Clikit gratis</Link>
          </div>
        </nav>

        {/* HERO */}
        <div className="pv-hero-wrap">
          <div className="pv-hero-left">
            <div className="pv-eyebrow">
              <div className="pv-dot"></div>
              Recomendado por {displayName}
            </div>
            <h1>Tu negocio funciona.<br /><em>Aunque no estés.</em></h1>
            <p className="pv-hero-sub">
              {displayName} te recomienda Clikit: ordena stock, ventas y caja en tiempo real,
              para que <strong>no dependa todo de vos.</strong>
            </p>
            <div className="pv-hero-ctas">
              <Link href={registerHref} className="pv-btn pv-btn-cta pv-btn-lg">Crear mi cuenta</Link>
              <a href="#problema" className="pv-btn pv-btn-outline pv-btn-lg">Ver cómo funciona →</a>
            </div>
            <div className="pv-hero-proof">
              <div style={{ display: "flex" }}>
                <div className="avatar" style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#1e3a2f", color: "var(--green)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, border: "2px solid var(--bg)", marginLeft: "-6px" }}>K</div>
                <div className="avatar" style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#2a1f0e", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, border: "2px solid var(--bg)", marginLeft: "-6px" }}>M</div>
                <div className="avatar" style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#1a2035", color: "var(--blue)", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, border: "2px solid var(--bg)", marginLeft: "-6px" }}>R</div>
              </div>
              <span>Activalo por $14.900 por mes.</span> Activás cuando querés.
            </div>
          </div>

          {/* PARTNER CARD MOCKUP */}
          <div className="pv-partner-mockup">
            <div className="pv-partner-glow" />
            <div className="pv-partner-card">
              <div className="pv-avatar">
                {partner.user.image ? (
                  <Image src={partner.user.image} alt={displayName} fill className="object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="pv-pcard-name">{displayName}</div>
              <div className="pv-pcard-role">Partner Oficial de Clikit</div>
              <div className={`pv-pcard-badge ${partner.isApproved ? "pv-pcard-badge--approved" : "pv-pcard-badge--pending"}`}>
                {partner.isApproved ? "Partner verificado" : "Verificando"}
              </div>
              <div className="pv-pcard-since">
                Partner desde {new Date(partner.user.createdAt).toLocaleDateString("es-AR", { month: "short", year: "numeric" })}
              </div>
            </div>
          </div>
        </div>

        {/* TRUST BAR */}
        <div className="pv-trust">
          {[
            "Sabés cuánto se vendió en tiempo real",
            "Compatible con PC, Mac, Android y iOS",
            "Escaneá con láser o cámara del dispositivo",
            "La caja cierra o te enterás al instante",
            "Stock y vencimientos dejan de estar en la cabeza",
            "Si abrís otra sucursal, te acompañamos sin costo adicional",
          ].map((item) => (
            <div key={item} className="pv-t-item">
              <div className="pv-tick">
                <svg viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2.5" stroke="#22d98a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {item}
            </div>
          ))}
        </div>

        {/* DOLOR */}
        <div className="pv-div" style={{ marginTop: "80px" }} />
        <section className="pv-section" id="problema">
          <div className="pv-lbl pv-lbl-red">El problema real</div>
          <h2>Sin sistema, tu negocio depende de que alguien esté, recuerde y no se equivoque.</h2>
          <div className="pv-pain-grid">
            {[
              {
                n: "01", t: "Vendés rápido, pero nadie sabe qué falta comprar",
                d: "El stock queda en la cabeza de quien atendió. Con dos turnos o dos sucursales, eso explota.",
                sol: "Clikit registra cada venta y actualiza el inventario sin que hagas nada extra."
              },
              {
                n: "02", t: "La caja no cierra y nadie sabe por qué",
                d: "Efectivo, QR, transferencia y fiados mezclados sin orden. El arqueo se transforma en discusión.",
                sol: "Cada medio de cobro queda registrado. El cuadre es automático al cerrar turno."
              },
              {
                n: "03", t: "Perdés plata por mercadería vencida",
                d: "Con la rotación de personal, los productos viejos quedan al fondo hasta que los terminás tirando.",
                sol: "Lotes FEFO Automáticos: el sistema te indica qué vender primero antes de que venza."
              },
              {
                n: "04", t: "El cuaderno de fiados es un agujero negro",
                d: "Anotame esto. El papel se pierde, no se entiende la letra y nadie sabe quién debe cuánto.",
                sol: "Cuentas corrientes: fiados digitales vinculados al cliente, con saldos claros."
              },
              {
                n: "05", t: "El catálogo es un desastre heredado",
                d: "Coca, Cocacola, Coca 2L. Duplicados, sin fotos, mal escritos. El sistema termina frenando la venta.",
                sol: "Autocompletado automático: escaneás el código y trae nombre y foto. Sin errores, sin perder tiempo."
              },
              {
                n: "06", t: "Acelerar la caja frena los comprobantes",
                d: "Si te piden factura, el cajero frena todo mientras la fila crece.",
                sol: "Facturación integrada: emitís comprobantes sin salir de la venta."
              },
            ].map((item) => (
              <div key={item.n} className="pv-pain-card">
                <div className="pv-pain-n">{item.n}</div>
                <div className="pv-pain-t">{item.t}</div>
                <div className="pv-pain-d">{item.d}</div>
                <div className="pv-pain-sol">
                  <span className="pv-ps-i">✓</span>
                  <span>{item.sol}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <div className="pv-div" />
        <section className="pv-section">
          <div className="pv-lbl pv-lbl-green">Todo incluido</div>
          <h2>Las herramientas que tu negocio necesita, en un solo lugar.</h2>
          <div className="pv-feat-grid">
            {[
              { t: "Punto de venta rápido", d: "Escaneá, cobrá y cerrá turno en segundos. Con o sin internet.", tags: ["Láser o cámara", "Sin demoras"] },
              { t: "Inventario inteligente", d: "Lotes FEFO automáticos, alertas de stock bajo y sugerencias de reposición.", tags: ["FEFO", "Alertas"] },
              { t: "Cuentas corrientes", d: "Fiados digitales por cliente con saldo, historial y recordatorios.", tags: ["Sin papel", "Trazable"] },
              { t: "Facturación integrada", d: "Emití comprobantes sin salir de la venta. Sin frenar la fila.", tags: ["Sin salir", "Rápido"] },
              { t: "Reportes en tiempo real", d: "Ventas por turno, efectivo vs QR, fiados, productos más vendidos.", tags: ["Tiempo real", "Móvil"] },
              { t: "Multi-sucursal", d: "Abrí otra sucursal con la misma cuenta. Te acompañamos sin costo.", tags: ["Sin costo extra", "Escalable"] },
            ].map((feat) => (
              <div key={feat.t} className="pv-feat-card">
                <div className="pv-feat-t">{feat.t}</div>
                <div className="pv-feat-d">{feat.d}</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {feat.tags.map((tag) => (
                    <span key={tag} className={`pv-tag pv-tag-${tag === "Sin demoras" || tag === "Sin salir" || tag === "Sin costo extra" || tag === "Sin papel" ? "green" : tag === "FEFO" || tag === "Alertas" || tag === "Escalable" ? "gold" : "blue"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA FINAL */}
        <div className="pv-cta-wrap">
          <div className="pv-cta-glow" />
          <h2>{displayName} te invita a probar Clikit</h2>
          <p>
            Creá tu cuenta ahora. {SUBSCRIPTION_PROMO_LABEL} Sin configuración, sin permanencia.
          </p>
          <div className="pv-cta-btns">
            <Link href={registerHref} className="pv-btn pv-btn-cta pv-btn-lg">Crear mi cuenta</Link>
          </div>
          <div className="pv-cta-fine">
            Si no es para vos, podés cancelar cuando quieras.
          </div>
        </div>

        {/* FOOTER */}
        <div className="pv-footer">
          <div className="pv-f-logo">
            <b>Clikit</b>
          </div>
          <div className="pv-f-copy">© {year} Clikit · El Sistema Operativo para Negocios</div>
        </div>
      </div>
    </>
  );
}
