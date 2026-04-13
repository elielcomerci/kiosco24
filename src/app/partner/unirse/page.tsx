import Link from "next/link";

export default async function PartnerJoinPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');

        .pj-scope {
          --bg:#06080d;--s1:#0e1420;--s2:#131b2a;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
          --text:#eef2f7;--muted:#6b7e96;--muted2:#8fa3ba;
          --gold:#f5a623;--gold-dim:rgba(245,166,35,0.11);--gold-border:rgba(245,166,35,0.28);
          --green:#22d98a;--green-dim:rgba(34,217,138,0.1);--green-border:rgba(34,217,138,0.25);
          --fd:'Bricolage Grotesque',sans-serif;--fb:'Instrument Sans',sans-serif;
          background:var(--bg);color:var(--text);font-family:var(--fb);min-height:100vh;
        }
        .pj-scope * { box-sizing:border-box;margin:0;padding:0 }

        .pj-nav {position:sticky;top:0;z-index:100;display:flex;justify-content:space-between;align-items:center;padding:14px 5%;background:rgba(6,8,13,0.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
        .pj-nav-tag {font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
        .pj-back {font-size:13px;color:var(--muted2);text-decoration:none;border:1px solid var(--border2);padding:6px 16px;border-radius:999px;transition:all .18s}
        .pj-back:hover {color:var(--text);border-color:rgba(255,255,255,0.22)}

        .pj-hero {max-width:800px;margin:0 auto;padding:80px 5% 64px;text-align:center}
        .pj-hero .eyebrow {display:inline-flex;align-items:center;gap:8px;padding:5px 13px;border-radius:999px;background:var(--green-dim);border:1px solid var(--green-border);color:var(--green);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
        .pj-hero h1 {font-family:var(--fd);font-size:clamp(32px,5vw,56px);font-weight:800;line-height:1.05;letter-spacing:-0.045em;margin-bottom:20px}
        .pj-hero h1 em {font-style:normal;color:var(--green)}
        .pj-hero p {font-size:18px;color:var(--muted2);line-height:1.7;max-width:560px;margin:0 auto}

        .pj-div {height:1px;background:var(--border);max-width:800px;margin:0 auto}

        .pj-section {max-width:900px;margin:0 auto;padding:72px 5%}
        .pj-section .lbl {text-align:center}
        .pj-section h2 {font-family:var(--fd);font-size:clamp(24px,3.5vw,40px);font-weight:800;letter-spacing:-0.04em;text-align:center;margin-bottom:40px;color:var(--text)}

        .pj-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
        .pj-card {padding:28px;border-radius:18px;background:var(--s1);border:1px solid var(--border);display:grid;gap:10px;transition:border-color .2s}
        .pj-card:hover {border-color:var(--green-border)}
        .pj-card-icon {font-size:28px}
        .pj-card h3 {font-size:16px;font-weight:700;line-height:1.3}
        .pj-card p {font-size:14px;color:var(--muted2);line-height:1.65}

        .pj-numbers {display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:40px}
        .pj-stat {background:var(--s1);border:1px solid var(--border);border-radius:16px;padding:24px;text-align:center}
        .pj-stat-val {font-family:var(--fd);font-size:32px;font-weight:800;color:var(--green)}
        .pj-stat-lbl {font-size:12px;color:var(--muted);margin-top:4px}

        .pj-cta-section {text-align:center;padding:64px 5% 80px;max-width:700px;margin:0 auto}
        .pj-cta-section h2 {font-family:var(--fd);font-size:clamp(22px,3.5vw,36px);font-weight:800;letter-spacing:-0.04em;margin-bottom:14px}
        .pj-cta-section p {font-size:16px;color:var(--muted2);margin-bottom:28px;line-height:1.7}
        .pj-cta-section .pj-form {display:grid;gap:14px;max-width:400px;margin:0 auto}
        .pj-cta-section input {
          padding:14px 18px;font-size:15px;font-family:var(--fb);border-radius:12px;
          background:var(--s1);border:1px solid var(--border);color:var(--text);text-align:center;
        }
        .pj-cta-section input:focus {outline:none;border-color:var(--green);box-shadow:0 0 0 3px rgba(34,217,138,0.12)}
        .pj-cta-section button {
          padding:14px 28px;font-size:16px;font-weight:700;font-family:var(--fb);border-radius:12px;
          background:var(--green);color:#0a0f1a;border:none;cursor:pointer;transition:all .18s;
        }
        .pj-cta-section button:hover {background:#2ae89a;transform:translateY(-1px)}
        .pj-cta-section .pj-fine {font-size:12px;color:var(--muted);margin-top:8px}

        .pj-footer {text-align:center;padding:32px 5%;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
      `
      }} />

      <div className="pj-scope">
        <nav className="pj-nav">
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.04em" }}>
              Clikit <b style={{ color: "var(--green)" }}>Partners</b>
            </div>
            <div className="pj-nav-tag">Programa de vendedores</div>
          </div>
          <Link href="/" className="pj-back">← Volver a Clikit</Link>
        </nav>

        {/* HERO */}
        <div className="pj-hero">
          <div className="eyebrow">Programa de Partners</div>
          <h1>Ganá dinero ayudando a <em>otros negocios</em> a ordenarse</h1>
          <p>
            Recomendá Clikit a dueños de kioscos, almacenes y comercios.
            Ganás comisión por cada venta y por cada mes que el cliente siga activo.
            Ingresos recurrentes, para siempre.
          </p>
        </div>

        <div className="pj-div" />

        {/* CÓMO FUNCIONA */}
        <section className="pj-section">
          <div className="lbl" style={{ color: "var(--green)" }}>Cómo funciona</div>
          <h2>Tres pasos para empezar</h2>
          <div className="pj-grid">
            <div className="pj-card">
              <div className="pj-card-icon">1️⃣</div>
              <h3>Registrate como partner</h3>
              <p>Completá el formulario de abajo. Revisamos tu solicitud en 24-48 horas.</p>
            </div>
            <div className="pj-card">
              <div className="pj-card-icon">2️⃣</div>
              <h3>Compartí tu link personal</h3>
              <p>Te damos un link único (ej: clikit.com/partner-view/tu-nombre) para compartir con comercios.</p>
            </div>
            <div className="pj-card">
              <div className="pj-card-icon">3️⃣</div>
              <h3>Cobrá por siempre</h3>
              <p>50% de la primera factura de cada cliente + 30% recurrente de por vida.</p>
            </div>
          </div>
        </section>

        <div className="pj-div" />

        {/* NÚMEROS */}
        <section className="pj-section">
          <div className="lbl" style={{ color: "var(--gold)" }}>Proyección</div>
          <h2>¿Cuánto podés ganar?</h2>
          <div className="pj-numbers">
            <div className="pj-stat">
              <div className="pj-stat-val">$7.450</div>
              <div className="pj-stat-lbl">por cada cliente nuevo (50%)</div>
            </div>
            <div className="pj-stat">
              <div className="pj-stat-val">$4.470</div>
              <div className="pj-stat-lbl">por mes recurrente (30%)</div>
            </div>
            <div className="pj-stat">
              <div className="pj-stat-val">$134K</div>
              <div className="pj-stat-lbl">/mes con 30 clientes activos</div>
            </div>
            <div className="pj-stat">
              <div className="pj-stat-val">$447K</div>
              <div className="pj-stat-lbl">/mes con 100 clientes activos</div>
            </div>
          </div>
          <p style={{ textAlign: "center", fontSize: "13px", color: "var(--muted)" }}>
            Precio de lista $14.900/mes. Las comisiones se calculan sobre el precio de lista.
          </p>
        </section>

        <div className="pj-div" />

        {/* BENEFICIOS */}
        <section className="pj-section">
          <div className="lbl" style={{ color: "var(--gold)" }}>Ventajas</div>
          <h2>¿Por qué ser partner?</h2>
          <div className="pj-grid">
            {[
              { icon: "💰", title: "Ingresos recurrentes", desc: "No cobrás una sola vez. Cada mes seguís ganando por tu cartera activa." },
              { icon: "📱", title: "Tu link, tu negocio", desc: "Tenés una página propia con tu nombre, foto y estadísticas de referidos." },
              { icon: "📊", title: "Dashboard en tiempo real", desc: "Vé tus clientes, ganancias y proyecciones desde un panel dedicado." },
              { icon: "🤝", title: "Sin inversión inicial", desc: "No pagás nada. Solo recomendás y cobrás." },
              { icon: "🎯", title: "Herramientas de venta", desc: "Calculadora de ingresos para mostrarle al comercio cuánto va a ganar." },
              { icon: "🚀", title: "Sin límite", desc: "No hay tope de clientes. Vendé 5 o 500, la comisión es siempre la misma." },
            ].map((b) => (
              <div key={b.title} className="pj-card">
                <div className="pj-card-icon">{b.icon}</div>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="pj-div" />

        {/* FORMULARIO */}
        <section className="pj-cta-section">
          <h2>¿Estás listo para empezar?</h2>
          <p>Completá tus datos y te contactamos para activar tu cuenta de partner.</p>
          <div className="pj-form">
            <input type="text" name="partnerName" placeholder="Tu nombre completo" required />
            <input type="email" name="partnerEmail" placeholder="tu@email.com" required />
            <input type="text" name="partnerPhone" placeholder="Tu teléfono (opcional)" />
            <input type="text" name="partnerCode" placeholder="Código de referido (si te invitó un partner)" />
            <button type="submit">Quiero ser partner</button>
          </div>
          <div className="pj-fine">Revisamos cada solicitud personalmente. Respuesta en 24-48 horas.</div>
        </section>

        <div className="pj-footer">
          Clikit · {new Date().getFullYear()} · Programa de Partners
        </div>
      </div>
    </>
  );
}
