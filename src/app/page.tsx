import Link from "next/link";

import BrandLogo from "@/components/branding/BrandLogo";
import { resolveSessionAppLabel, resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth, signOut } from "@/lib/auth";
import {
  SUBSCRIPTION_CANCEL_LABEL,
} from "@/lib/subscription-plan";

export default async function LandingPage() {
  const session = await auth();
  const appHref = resolveSessionAppStartPath(session?.user);
  const appLabel = resolveSessionAppLabel(session?.user);
  const year = new Date().getFullYear();
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');

        .landing-scope {
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
        .landing-scope * { box-sizing:border-box;margin:0;padding:0 }

        .landing-nav {position:sticky;top:0;z-index:100;display:flex;justify-content:space-between;align-items:center;padding:14px 5%;background:rgba(6,8,13,0.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
        .landing-logo {display:grid;gap:1px}
        .landing-logo-sub {font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
        .landing-nav-right {display:flex;gap:10px;align-items:center;flex-wrap:wrap}

        .l-btn {display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--fb);font-size:14px;font-weight:600;border-radius:999px;padding:9px 20px;cursor:pointer;text-decoration:none;transition:all .18s;border:none;white-space:nowrap}
        .l-btn-ghost {background:transparent;color:var(--muted2);border:1px solid var(--border2)}
        .l-btn-ghost:hover {color:var(--text);border-color:rgba(255,255,255,0.22)}
        .l-btn-cta {background:var(--gold);color:#1a0f00;font-weight:700}
        .l-btn-cta:hover {background:#f9b840;transform:translateY(-1px)}
        .l-btn-lg {padding:15px 30px;font-size:16px}
        .l-btn-outline {background:transparent;color:var(--text);border:1px solid var(--border2)}
        .l-btn-outline:hover {border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.04)}

        .hero-wrap {max-width:1200px;margin:0 auto;padding:80px 5% 0;display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
        @media(max-width:820px){.hero-wrap{grid-template-columns:1fr;gap:48px;padding:56px 5% 0}}
        .hero-left {display:grid;gap:0}
        .eyebrow {display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:999px;background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px;width:fit-content}
        .dot {width:6px;height:6px;border-radius:50%;background:var(--gold);animation:blink 2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        .hero-left h1 {font-family:var(--fd);font-size:clamp(38px,5.2vw,66px);font-weight:800;line-height:1.0;letter-spacing:-0.045em;margin-bottom:20px}
        .hero-left h1 em {font-style:normal;color:var(--gold)}
        .hero-sub {font-size:18px;color:var(--muted2);line-height:1.7;margin-bottom:32px;max-width:500px}
        .hero-sub strong {color:var(--text);font-weight:600}
        .hero-ctas {display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
        .hero-proof {display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}
        .avatar {width:26px;height:26px;border-radius:50%;border:2px solid var(--bg);display:grid;place-items:center;font-size:11px;font-weight:700}
        .avatar:not(:first-child){margin-left:-6px}
        .hero-proof span {color:var(--green)}

        .iphone-wrap {display:flex;justify-content:center;align-items:center;position:relative;animation:fadeUp .7s ease .2s both}
        .iphone {width:240px;background:#0a0a0a;border-radius:38px;border:2px solid rgba(255,255,255,0.15);box-shadow:0 0 0 1px rgba(0,0,0,0.8),0 40px 80px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.1);overflow:hidden;position:relative}
        .iphone-notch {width:90px;height:26px;background:#0a0a0a;border-radius:0 0 16px 16px;margin:0 auto;position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:6px}
        .notch-cam {width:8px;height:8px;border-radius:50%;background:#1a1a1a;border:1px solid #2a2a2a}
        .notch-speaker {width:40px;height:4px;border-radius:999px;background:#1a1a1a}
        .iphone-screen {background:var(--s1);min-height:460px}
        .stats-header {padding:14px 14px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
        .stats-title {font-family:var(--fd);font-size:14px;font-weight:800;letter-spacing:-0.03em}
        .stats-title b {color:var(--gold)}
        .stats-date {font-size:9px;color:var(--muted)}
        .stats-notif {display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--green-dim);border-bottom:1px solid var(--green-border)}
        .notif-dot {width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
        .notif-text {font-size:10px;color:#a0f0cc;line-height:1.4}
        .notif-text strong {color:var(--green)}
        .stats-body {padding:12px 14px;display:grid;gap:10px}
        .stat-row {display:flex;justify-content:space-between;align-items:center}
        .stat-lbl {font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
        .stat-val {font-family:var(--fd);font-size:18px;font-weight:800}
        .stat-trend {font-size:9px;color:var(--green);background:var(--green-dim);padding:2px 6px;border-radius:999px}
        .bar-wrap {display:grid;gap:6px}
        .bar-row {display:grid;gap:3px}
        .bar-label {display:flex;justify-content:space-between;font-size:9px;color:var(--muted)}
        .bar-track {height:6px;border-radius:999px;background:rgba(255,255,255,0.06);overflow:hidden}
        .bar-fill {height:100%;border-radius:999px}
        .sdiv {height:1px;background:var(--border)}
        .mini-grid {display:grid;grid-template-columns:1fr 1fr;gap:6px}
        .mini-card {background:var(--s2);border-radius:8px;padding:8px;border:1px solid var(--border)}
        .mini-lbl {font-size:9px;color:var(--muted);margin-bottom:2px}
        .mini-val {font-size:13px;font-weight:700;font-family:var(--fd)}
        .mini-sub {font-size:9px;color:var(--muted);margin-top:1px}
        .stats-alert {display:flex;align-items:flex-start;gap:6px;padding:8px 10px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;margin:0 14px 12px}
        .alert-text {font-size:9px;color:#fca5a5;line-height:1.4}
        .iphone-home {height:4px;width:80px;background:rgba(255,255,255,0.2);border-radius:999px;margin:10px auto 12px}
        .iphone-glow {position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;height:400px;border-radius:50%;background:radial-gradient(ellipse,rgba(245,166,35,0.1) 0%,transparent 70%);pointer-events:none;z-index:-1}

        .trust {display:flex;justify-content:center;align-items:center;gap:24px;flex-wrap:wrap;padding:20px 5%;max-width:1200px;margin:44px auto 0;border:1px solid var(--border);border-radius:16px;background:var(--s1)}
        .t-item {display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted2)}
        .tick {width:16px;height:16px;border-radius:50%;background:var(--green-dim);border:1px solid var(--green-border);display:grid;place-items:center;flex-shrink:0}
        .tick svg {width:8px;height:8px}

        .l-div {height:1px;background:var(--border);max-width:1200px;margin:0 auto}
        .l-section {padding:88px 5%;max-width:1200px;margin:0 auto}
        .lbl {font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}
        .lbl-red {color:var(--red)} .lbl-green {color:var(--green)} .lbl-gold {color:var(--gold)} .lbl-blue {color:var(--blue)}
        .l-section h2 {font-family:var(--fd);font-size:clamp(28px,4vw,48px);font-weight:800;letter-spacing:-0.04em;line-height:1.08;margin-bottom:44px;max-width:750px;color:var(--text)}

        .pain-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
        .pain-card {padding:28px;border-radius:20px;background:var(--s1);border:1px solid var(--border);position:relative;overflow:hidden;display:grid;gap:14px;transition:border-color .2s}
        .pain-card:hover {border-color:var(--border2)}
        .pain-card::after {content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),transparent)}
        .pain-n {font-family:var(--fd);font-size:38px;font-weight:800;color:rgba(248,113,113,0.1);line-height:1}
        .pain-t {font-size:18px;font-weight:700;line-height:1.25}
        .pain-d {font-size:14px;color:var(--muted2);line-height:1.7}
        .pain-sol {display:flex;align-items:flex-start;gap:8px;padding:11px 13px;background:var(--green-dim);border:1px solid var(--green-border);border-radius:10px;font-size:13px;color:#c4f5e0;line-height:1.55}
        .ps-i {color:var(--green);flex-shrink:0;font-weight:700}

        .owner-wrap {display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:640px){.owner-wrap{grid-template-columns:1fr}}
        .owner-card {padding:28px;border-radius:20px;display:grid;gap:14px}
        .owner-bad {background:var(--s1);border:1px solid var(--border)}
        .owner-good {background:var(--green-dim);border:1px solid var(--green-border)}
        .owner-title {font-size:17px;font-weight:700;display:flex;align-items:center;gap:10px}
        .owner-bad .owner-title {color:var(--muted2)}
        .owner-good .owner-title {color:var(--green)}
        .owner-list {display:grid;gap:10px}
        .owner-item {display:flex;gap:10px;font-size:14px;line-height:1.6}
        .owner-bad .owner-item {color:var(--muted2)}
        .owner-good .owner-item {color:#c4f5e0}

        .rubro-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
        .rubro-card {padding:20px;border-radius:16px;background:var(--s1);border:1px solid var(--border);display:grid;gap:8px;text-align:center;transition:border-color .2s,transform .2s;cursor:default}
        .rubro-card:hover {border-color:var(--gold-border);transform:translateY(-2px)}

        .feat-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
        .feat-card {padding:26px;border-radius:18px;background:var(--s1);border:1px solid var(--border);display:grid;gap:12px;transition:border-color .2s,transform .18s}
        .feat-card:hover {border-color:var(--border2);transform:translateY(-2px)}
        .feat-t {font-size:16px;font-weight:600;line-height:1.3}
        .feat-d {font-size:14px;color:var(--muted2);line-height:1.65}
        .l-tag {display:inline-flex;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;margin-top:2px}
        .tag-gold {background:var(--gold-dim);border:1px solid var(--gold-border);color:var(--gold)}
        .tag-green {background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
        .tag-blue {background:var(--blue-dim);border:1px solid var(--blue-border);color:var(--blue)}

        .precio-wrap {display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media(max-width:640px){.precio-wrap{grid-template-columns:1fr}}
        .precio-card {padding:28px;border-radius:20px}
        .pc-free {background:var(--s1);border:1px solid var(--border)}
        .pc-paid {background:var(--gold-dim);border:1px solid var(--gold-border)}
        .pc-tag {font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
        .pc-free .pc-tag {color:var(--muted)}
        .pc-paid .pc-tag {color:var(--gold)}
        .pc-num {font-family:var(--fd);font-size:36px;font-weight:800;line-height:1;margin-bottom:4px}
        .pc-free .pc-num {color:var(--green)}
        .pc-paid .pc-num {color:var(--gold)}
        .pc-sub {font-size:13px;color:var(--muted2);margin-bottom:16px}
        .pc-list {display:grid;gap:9px}
        .pc-item {display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.5}
        .pc-free .pc-item {color:var(--muted2)}
        .pc-free .pc-item span {color:var(--green)}
        .pc-paid .pc-item {color:#f5dfa0}
        .pc-paid .pc-item span {color:var(--gold)}
        .pc-div {height:1px;background:var(--border);margin:14px 0}
        .pc-blocked {display:flex;gap:8px;font-size:13px;color:var(--muted);line-height:1.5}
        .pc-blocked span {color:rgba(248,113,113,0.6);flex-shrink:0}

        .cta-wrap {margin:0 5% 80px;padding:64px 48px;border-radius:24px;background:linear-gradient(135deg,rgba(245,166,35,0.09),rgba(6,8,13,.98));border:1px solid var(--gold-border);text-align:center;position:relative;overflow:hidden}
        .cta-glow {position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:300px;border-radius:50%;background:radial-gradient(ellipse,rgba(245,166,35,0.07),transparent 70%);pointer-events:none}
        .cta-wrap h2 {max-width:680px;margin:0 auto 14px;font-family:var(--fd);font-size:clamp(26px,4vw,46px);font-weight:800;letter-spacing:-0.04em;line-height:1.08;position:relative}
        .cta-wrap p {color:var(--muted2);font-size:17px;margin-bottom:32px;position:relative;max-width:540px;margin-left:auto;margin-right:auto}
        .cta-btns {display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative;margin-bottom:18px}
        .cta-foot {display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;position:relative}
        .cta-badge {padding:7px 16px;border-radius:999px;background:var(--gold-dim);border:1px solid var(--gold-border);font-size:13px;font-weight:700;color:var(--gold)}
        .cta-fine {font-size:13px;color:var(--muted)}

        .landing-footer {padding:32px 5%;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
        .f-logo {font-family:var(--fd);font-size:17px;font-weight:800;letter-spacing:-0.04em}
        .f-logo b {color:var(--gold)}
        .f-copy {font-size:13px;color:var(--muted)}

        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .hero-left>*{animation:fadeUp .55s ease both}
        .hero-left>*:nth-child(1){animation-delay:.04s}
        .hero-left>*:nth-child(2){animation-delay:.13s}
        .hero-left>*:nth-child(3){animation-delay:.22s}
        .hero-left>*:nth-child(4){animation-delay:.30s}
        .hero-left>*:nth-child(5){animation-delay:.37s}
        `
      }} />

      <div className="landing-scope">
        <nav className="landing-nav">
          <div className="landing-logo">
            <BrandLogo tone="white" width={110} />
            <div className="landing-logo-sub">El Sistema Operativo para Negocios</div>
          </div>
          <div className="landing-nav-right">
            {session ? (
              <>
                <Link href={appHref} className="l-btn l-btn-cta">
                  {appLabel}
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button className="l-btn l-btn-ghost">Salir</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="l-btn l-btn-ghost">Entrar</Link>
                <Link href="/register" className="l-btn l-btn-cta">Probar Clikit gratis</Link>
              </>
            )}
          </div>
        </nav>

        {/* HERO */}
        <div className="hero-wrap">
          <div className="hero-left">
            <div className="eyebrow"><div className="dot"></div>El fin de la presencia obligatoria</div>
            <h1>Tu negocio funciona.<br /><em>Aunque no estés.</em></h1>
            <p className="hero-sub">Clikit ordena stock, ventas y caja en tiempo real, para que <strong>no dependa todo de vos.</strong></p>
            <div className="hero-ctas">
              {session ? (
                <Link href={appHref} className="l-btn l-btn-cta l-btn-lg">Ir a {appLabel}</Link>
              ) : (
                <Link href="/register" className="l-btn l-btn-cta l-btn-lg">Probar Clikit gratis</Link>
              )}
              <a href="#dolor" className="l-btn l-btn-outline l-btn-lg">Ver cómo funciona →</a>
            </div>
            {!session && (
              <div className="hero-proof">
                <div style={{ display: "flex" }}>
                  <div className="avatar" style={{ background: "#1e3a2f", color: "var(--green)" }}>K</div>
                  <div className="avatar" style={{ background: "#2a1f0e", color: "var(--gold)" }}>M</div>
                  <div className="avatar" style={{ background: "#1a2035", color: "var(--blue)" }}>R</div>
                </div>
                <span>Activalo por $14.900 por mes.</span> Activás cuando querés.
              </div>
            )}
          </div>

          <div className="iphone-wrap">
            <div className="iphone-glow" />
            <div className="iphone">
              <div className="iphone-notch">
                <div className="notch-cam" />
                <div className="notch-speaker" />
              </div>
              <div className="iphone-screen">
                <div className="stats-header">
                  <div className="stats-title"><b>Clikit</b></div>
                  <div className="stats-date">Hoy · 23:14</div>
                </div>
                <div className="stats-notif">
                  <div className="notif-dot" />
                  <div className="notif-text">
                    <strong>⚠ Stock bajo:</strong> Gaseosas 2L — quedan 8 unidades. Agregado a tu lista de compras.
                  </div>
                </div>
                <div className="stats-body">
                  <div className="stat-row">
                    <div>
                      <div className="stat-lbl">Ventas de hoy</div>
                      <div className="stat-val">$127.450</div>
                    </div>
                    <div className="stat-trend">+18% vs. ayer</div>
                  </div>
                  <div className="sdiv" />
                  <div className="bar-wrap">
                    <div className="bar-row">
                      <div className="bar-label"><span>Turno mañana</span><span>$38.200</span></div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: "30%", background: "var(--blue)" }} /></div>
                    </div>
                    <div className="bar-row">
                      <div className="bar-label"><span>Turno tarde</span><span>$51.800</span></div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: "40%", background: "var(--gold)" }} /></div>
                    </div>
                    <div className="bar-row">
                      <div className="bar-label"><span>Turno noche</span><span>$37.450</span></div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: "30%", background: "var(--green)" }} /></div>
                    </div>
                  </div>
                  <div className="sdiv" />
                  <div className="mini-grid">
                    <div className="mini-card">
                      <div className="mini-lbl">Efectivo en caja</div>
                      <div className="mini-val">$42.800</div>
                      <div className="mini-sub">Cuadre ✓</div>
                    </div>
                    <div className="mini-card">
                      <div className="mini-lbl">Cuentas corrientes</div>
                      <div className="mini-val">$31.200</div>
                      <div className="mini-sub">Fiados activos</div>
                    </div>
                    <div className="mini-card">
                      <div className="mini-lbl">Lotes FEFO</div>
                      <div className="mini-val" style={{ color: "var(--green)", fontSize: "11px" }}>Activo</div>
                      <div className="mini-sub">Sin mermas ✓</div>
                    </div>
                    <div className="mini-card">
                      <div className="mini-lbl">Facturación</div>
                      <div className="mini-val" style={{ color: "var(--green)", fontSize: "11px" }}>OK</div>
                      <div className="mini-sub">Integrada</div>
                    </div>
                  </div>
                </div>
                <div className="iphone-home" />
              </div>
            </div>
          </div>
        </div>

        {/* TRUST BAR */}
        <div className="trust">
          {[
            "Sabés cuánto se vendió en tiempo real",
            "Compatible con PC, Mac, Android y iOS",
            "Escaneá con láser o cámara del dispositivo",
            "La caja cierra o te enterás al instante",
            "Stock y vencimientos dejan de estar en la cabeza",
            "Si abrís otra sucursal, te acompañamos sin costo adicional",
          ].map((item) => (
            <div key={item} className="t-item">
              <div className="tick">
                <svg viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2.5" stroke="#22d98a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {item}
            </div>
          ))}
        </div>

        {/* DOLOR */}
        <div className="l-div" style={{ marginTop: "80px" }} />
        <section className="l-section" id="dolor">
          <div className="lbl lbl-red">El problema real</div>
          <h2>Sin sistema, tu negocio depende de que alguien esté, recuerde y no se equivoque.</h2>
          <div className="pain-grid">
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
              <div key={item.n} className="pain-card">
                <div className="pain-n">{item.n}</div>
                <div className="pain-t">{item.t}</div>
                <div className="pain-d">{item.d}</div>
                <div className="pain-sol"><span className="ps-i">→</span> {item.sol}</div>
              </div>
            ))}
          </div>
        </section>

        {/* OWNER VS OPERARIO */}
        <div className="l-div" />
        <section className="l-section">
          <div className="lbl lbl-green">La diferencia real</div>
          <h2>Lo que cambia cuando el sistema trabaja con vos.</h2>
          <div className="owner-wrap">
            <div className="owner-card owner-bad">
              <div className="owner-title">😓 Sin Clikit</div>
              <div className="owner-list">
                {[
                  "Tenés que estar para que las cosas funcionen",
                  "El stock lo sabe el empleado que memorizó",
                  "La caja no cierra y la discusión es tuya",
                  "Si una sucursal falla, te enterás tarde",
                  "Cada turno es una caja negra",
                ].map((item) => (
                  <div key={item} className="owner-item"><span>✗</span><span>{item}</span></div>
                ))}
              </div>
            </div>
            <div className="owner-card owner-good">
              <div className="owner-title">✓ Con Clikit</div>
              <div className="owner-list">
                {[
                  "Tu negocio opera aunque no estés presente",
                  "El stock se actualiza solo con cada venta",
                  "El cierre de caja es automático y preciso",
                  "Ves todas las sucursales en vivo desde el celular",
                  "Cada turno queda registrado con nombre y hora",
                ].map((item) => (
                  <div key={item} className="owner-item"><span>✓</span><span>{item}</span></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RUBROS */}
<div className="l-div" />
<section className="l-section">
  <div className="lbl lbl-gold">Pensado para tu negocio</div>
  <h2>Diseñado para no perder tiempo.</h2>

  <div className="rubro-grid">
    {[
      { icon: "🏪", name: "Kiosco", desc: "Más control, menos dependencia." },
      { icon: "🛒", name: "Almacén", desc: "Stock ordenado sin esfuerzo." },
      { icon: "🥩", name: "Carnicería", desc: "Menos merma, más margen." },
      { icon: "🥖", name: "Panadería", desc: "Menos sobrante, más control." },
      { icon: "🍎", name: "Verdulería", desc: "Menos merma, más rotación." },
      { icon: "🍕", name: "Rotisería", desc: "Más velocidad, mismo orden." },
      { icon: "💊", name: "Farmacia", desc: "Menos vencido, más control." },
      { icon: "🌸", name: "Perfumería", desc: "Más claridad, menos errores." },
      { icon: "🐶", name: "Pet shop", desc: "Stock siempre disponible." },
      { icon: "📚", name: "Librería", desc: "Todo ubicable al instante." },
      { icon: "👕", name: "Indumentaria", desc: "Variantes bajo control." },
      { icon: "📦", name: "Mayorista", desc: "Volumen sin desorden." },
    ].map((item) => (
      <div key={item.name} className="rubro-card">
        <div style={{ fontSize: "28px" }}>{item.icon}</div>
        <div style={{ fontSize: "14px", fontWeight: 600 }}>{item.name}</div>
        <div style={{ fontSize: "12px", opacity: 0.7 }}>{item.desc}</div>
      </div>
    ))}
  </div>
</section>

        {/* FEATURES */}
        <div className="l-div" />
        <section className="l-section" id="features">
          <div className="lbl lbl-blue">Funcionalidades integrales</div>
          <h2>Cada herramienta pensada para que atiendas sin romperte la cabeza.</h2>
          <div className="feat-grid">
            {[
              {
                icon: "⚡", title: "Caja rápida para venta real",
                desc: "Barcode, táctil, variantes, precios por cliente y fiados. La venta sale en segundos.",
                tag: null, tagType: null
              },
              {
                icon: "📦", title: "Stock con inteligencia FEFO",
                desc: "Lotes con vencimiento, mínimos visibles y alertas antes del problema. El stock deja de estar en tu cabeza.",
                tag: "Lotes activos", tagType: "green"
              },
              {
                icon: "🧾", title: "Facturas y comprobantes integrados",
                desc: "Ticket, Factura, PDF, WhatsApp, impresión térmica. Todo desde la misma venta, sin salir del flujo.",
                tag: null, tagType: null
              },
              {
                icon: "📊", title: "Arqueo blindado por turno",
                desc: "Cada turno abre y cierra con nombre, hora y medios de cobro. El cuadre es automático.",
                tag: null, tagType: null
              },
              {
                icon: "🏪", title: "Multi-sucursal sin caos",
                desc: "Precios compartidos o por sucursal, stock individual, transferencias y catálogo replicable.",
                tag: null, tagType: null
              },
              {
                icon: "🎯", title: "Motor de Promociones Inteligente",
                desc: "2x1, descuentos por volumen, combos y ofertas con vigencia. Aplicadas solas en caja.",
                tag: "Activo en caja", tagType: "gold"
              },
              {
                icon: "🔍", title: "Autocompletado de catálogo",
                desc: "Escaneás un código nuevo y Clikit sugiere nombre, foto y categoría desde la base colaborativa.",
                tag: null, tagType: null
              },
              {
                icon: "📚", title: "Base de datos viva de productos",
                desc: "Más de 17.000 productos con nombre normalizado, foto profesional y código ya cargados. La base sigue creciendo.",
                tag: "17.000+ productos", tagType: "blue"
              },
              {
                icon: "💰", title: "Valorización total del negocio",
                desc: "Sabés cuánto vale tu stock en tiempo real, por sucursal o en total. Un número claro para decisiones claras.",
                tag: null, tagType: null
              },
              {
                icon: "📈", title: "Proyección de venta de stock",
                desc: "En base a tu ritmo de ventas, Clikit te dice cuántos días de stock te quedan de cada producto.",
                tag: null, tagType: null
              },
              {
                icon: "👤", title: "Cuentas corrientes y fiados",
                desc: "Registrás, cobrás y controlás deudas por cliente. Todo con historial y sin cuadernos.",
                tag: null, tagType: null
              },
              {
                icon: "📱", title: "Compatible con todo",
                desc: "Funciona como app instalable en PC, Mac, Android e iOS. Escaneás con lector láser o cámara.",
                tag: "PWA", tagType: "green"
              },
            ].map((feat) => (
              <div key={feat.title} className="feat-card">
                <div style={{ fontSize: "26px" }}>{feat.icon}</div>
                <div className="feat-t">{feat.title}</div>
                <div className="feat-d">{feat.desc}</div>
                {feat.tag && <div className={`l-tag tag-${feat.tagType}`}>{feat.tag}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* PRECIOS */}
        <div className="l-div" />
        <section className="l-section" id="precios">
          <div className="lbl lbl-gold">Sin sorpresas</div>
          <h2>Un precio claro. Sin permanencia. Sin trampa.</h2>
          <div className="precio-wrap">
            <div className="precio-card pc-free">
              <div className="pc-tag">Siempre gratis</div>
              <div className="pc-num">$0</div>
              <div className="pc-sub">Para preparar todo antes de operar</div>
              <div className="pc-div" />
              <div className="pc-list">
                {[
                  "Catálogo completo sin límite de productos",
                  "Sucursales y empleados configurados",
                  "Base de datos viva disponible",
                  "Sin tarjeta. Sin vencimiento.",
                ].map((item) => (
                  <div key={item} className="pc-item"><span>✓</span>{item}</div>
                ))}
              </div>
            </div>
            <div className="precio-card pc-paid">
              <div className="pc-tag">Operativo</div>
              <div className="pc-num">$14.900</div>
              <div className="pc-sub">por mes · Activás cuando querés</div>
              <div className="pc-div" />
              <div className="pc-list">
                {[
                  "Caja, turnos y arqueo activos",
                  "Stock en tiempo real con alertas",
                  "Facturas y comprobantes integrados",
                  "Todas las sucursales sin costo adicional",
                  "Soporte directo por WhatsApp",
                ].map((item) => (
                  <div key={item} className="pc-item"><span>✓</span>{item}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <div className="cta-wrap">
          <div className="cta-glow" />
          <h2>Tu negocio funciona aunque no estés.</h2>
          <p>Empezá gratis. Activá cuando estés listo. Sin permanencia, sin contrato, sin trampa.</p>
          <div className="cta-btns">
            {session ? (
              <Link href={appHref} className="l-btn l-btn-cta l-btn-lg">{appLabel}</Link>
            ) : (
              <Link href="/register" className="l-btn l-btn-cta l-btn-lg">Probar Clikit gratis</Link>
            )}
          </div>
          <div className="cta-foot">
            <div className="cta-badge">$14.900 / mes</div>
            <div className="cta-fine">{SUBSCRIPTION_CANCEL_LABEL}</div>
          </div>
        </div>

        <footer className="landing-footer">
          <BrandLogo tone="white" width={90} />
          <div className="f-copy">© {year} Clikit · El sistema operativo para negocios</div>
        </footer>
      </div>
    </>
  );
}
