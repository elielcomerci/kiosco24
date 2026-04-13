import Link from "next/link";

export default async function PartnerSubHome() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');

        .psh-scope {
          --bg:#06080d;--s1:#0e1420;--s2:#131b2a;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
          --text:#eef2f7;--muted:#6b7e96;--muted2:#8fa3ba;
          --green:#22d98a;--green-dim:rgba(34,217,138,0.1);--green-border:rgba(34,217,138,0.25);
          --gold:#f5a623;--gold-dim:rgba(245,166,35,0.11);--gold-border:rgba(245,166,35,0.28);
          --fd:'Bricolage Grotesque',sans-serif;--fb:'Instrument Sans',sans-serif;
          background:var(--bg);color:var(--text);font-family:var(--fb);font-size:16px;line-height:1.6;
          min-height:100vh;
        }
        .psh-scope * { box-sizing:border-box;margin:0;padding:0 }

        .psh-nav {position:sticky;top:0;z-index:100;display:flex;justify-content:space-between;align-items:center;padding:14px 5%;background:rgba(6,8,13,0.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
        .psh-nav-logo {display:grid;gap:1px}
        .psh-nav-sub {font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
        .psh-nav-right {display:flex;gap:10px;align-items:center}

        .psh-btn {display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--fb);font-size:14px;font-weight:600;border-radius:999px;padding:9px 20px;cursor:pointer;text-decoration:none;transition:all .18s;border:none;white-space:nowrap}
        .psh-btn-ghost {background:transparent;color:var(--muted2);border:1px solid var(--border2)}
        .psh-btn-ghost:hover {color:var(--text);border-color:rgba(255,255,255,0.22)}
        .psh-btn-cta {background:var(--green);color:#0a0f1a;font-weight:700}
        .psh-btn-cta:hover {background:#2ae89a;transform:translateY(-1px)}
        .psh-btn-lg {padding:15px 30px;font-size:16px}

        .psh-hero {max-width:900px;margin:0 auto;padding:80px 5% 64px;text-align:center}
        .psh-eyebrow {display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:999px;background:var(--green-dim);border:1px solid var(--green-border);color:var(--green);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
        .psh-hero h1 {font-family:var(--fd);font-size:clamp(36px,5.5vw,64px);font-weight:800;line-height:1.05;letter-spacing:-0.045em;margin-bottom:20px}
        .psh-hero h1 em {font-style:normal;color:var(--green)}
        .psh-hero p {font-size:18px;color:var(--muted2);line-height:1.7;max-width:580px;margin:0 auto 32px}

        .psh-div {height:1px;background:var(--border);max-width:900px;margin:0 auto}

        .psh-numbers {display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;max-width:900px;margin:0 auto;padding:64px 5%}
        .psh-stat {background:var(--s1);border:1px solid var(--border);border-radius:16px;padding:24px;text-align:center}
        .psh-stat-val {font-family:var(--fd);font-size:32px;font-weight:800;color:var(--green)}
        .psh-stat-lbl {font-size:12px;color:var(--muted);margin-top:4px}

        .psh-section {max-width:900px;margin:0 auto;padding:64px 5%}
        .psh-section h2 {font-family:var(--fd);font-size:clamp(24px,3.5vw,40px);font-weight:800;letter-spacing:-0.04em;text-align:center;margin-bottom:40px;color:var(--text)}
        .psh-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
        .psh-card {padding:28px;border-radius:18px;background:var(--s1);border:1px solid var(--border);display:grid;gap:10px;transition:border-color .2s}
        .psh-card:hover {border-color:var(--green-border)}
        .psh-card h3 {font-size:16px;font-weight:700;line-height:1.3}
        .psh-card p {font-size:14px;color:var(--muted2);line-height:1.65}

        .psh-cta-wrap {text-align:center;padding:64px 5% 80px;max-width:700px;margin:0 auto}
        .psh-cta-wrap h2 {font-family:var(--fd);font-size:clamp(22px,3.5vw,36px);font-weight:800;letter-spacing:-0.04em;margin-bottom:14px}
        .psh-cta-wrap p {font-size:16px;color:var(--muted2);margin-bottom:28px;line-height:1.7}

        .psh-footer {text-align:center;padding:32px 5%;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
      `
      }} />

      <div className="psh-scope">
        <nav className="psh-nav">
          <div className="psh-nav-logo">
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.04em" }}>
              Clikit <b style={{ color: "var(--green)" }}>Partners</b>
            </div>
            <div className="psh-nav-sub">Programa de vendedores</div>
          </div>
          <div className="psh-nav-right">
            <Link href="/login" className="psh-btn psh-btn-ghost">Acceder</Link>
            <Link href="/unirse" className="psh-btn psh-btn-cta">Quiero ser partner</Link>
          </div>
        </nav>

        {/* HERO */}
        <div className="psh-hero">
          <div className="psh-eyebrow">Programa de Partners</div>
          <h1>Ganá dinero recomendando <em>Clikit</em></h1>
          <p>
            Ayudá a dueños de kioscos y comercios a ordenar su negocio.
            Cobrás el 50% de la primera factura y 30% recurrente de por vida.
            Sin inversión inicial, sin límite de clientes.
          </p>
          <Link href="/unirse" className="psh-btn psh-btn-cta psh-btn-lg">Quiero ser partner</Link>
        </div>

        <div className="psh-div" />

        {/* NÚMEROS */}
        <div className="psh-numbers">
          <div className="psh-stat">
            <div className="psh-stat-val">$7.450</div>
            <div className="psh-stat-lbl">por cada cliente nuevo</div>
          </div>
          <div className="psh-stat">
            <div className="psh-stat-val">$4.470</div>
            <div className="psh-stat-lbl">por mes recurrente</div>
          </div>
          <div className="psh-stat">
            <div className="psh-stat-val">$134K</div>
            <div className="psh-stat-lbl">/mes con 30 clientes</div>
          </div>
          <div className="psh-stat">
            <div className="psh-stat-val">$447K</div>
            <div className="psh-stat-lbl">/mes con 100 clientes</div>
          </div>
        </div>

        <div className="psh-div" />

        {/* BENEFICIOS */}
        <section className="psh-section">
          <h2>¿Por qué ser partner?</h2>
          <div className="psh-grid">
            {[
              { title: "Ingresos recurrentes", desc: "Cada mes seguís ganando por tu cartera activa. No es una sola vez." },
              { title: "Tu página propia", desc: "Tenés un link único con tu nombre, foto y stats de referidos." },
              { title: "Dashboard en tiempo real", desc: "Vé tus clientes, ganancias y proyecciones desde un panel dedicado." },
              { title: "Sin inversión inicial", desc: "No pagás nada. Solo recomendás y cobrás." },
              { title: "Herramientas de venta", desc: "Calculadora de ingresos para mostrarle al comercio cuánto va a ganar." },
              { title: "Sin límite de clientes", desc: "Vendé 5 o 500, la comisión es siempre la misma." },
            ].map((b) => (
              <div key={b.title} className="psh-card">
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <div className="psh-div" />
        <section className="psh-section">
          <h2>Cómo funciona</h2>
          <div className="psh-grid">
            <div className="psh-card">
              <h3>1. Registrate</h3>
              <p>Completá el formulario. Revisamos tu solicitud en 24-48 horas.</p>
            </div>
            <div className="psh-card">
              <h3>2. Compartí tu link</h3>
              <p>Te damos una página propia (ej: clikit.com/partner-view/tu-nombre) para compartir con comercios.</p>
            </div>
            <div className="psh-card">
              <h3>3. Cobrá por siempre</h3>
              <p>50% de la primera factura + 30% recurrente de por vida por cada cliente que traigas.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="psh-div" />
        <div className="psh-cta-wrap">
          <h2>¿Estás listo para empezar?</h2>
          <p>Completá tus datos y te contactamos para activar tu cuenta de partner.</p>
          <Link href="/unirse" className="psh-btn psh-btn-cta psh-btn-lg">Quiero ser partner →</Link>
        </div>

        <div className="psh-footer">
          Clikit · {new Date().getFullYear()} · Programa de Partners
        </div>
      </div>
    </>
  );
}
