/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

interface AccesoTabProps {
  branchId: string;
  currentBranch: any;
  accessEntryUrl: string;
  // Handlers
  copyAccessValue: (value: string, message: string) => Promise<void>;
  handleGenerateAccessKey: () => Promise<void>;
}

export default function AccesoTab({
  branchId,
  currentBranch,
  accessEntryUrl,
  copyAccessValue,
  handleGenerateAccessKey,
}: AccesoTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Acceso de Dispositivos */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text-2)" }}>
          🔑 Acceso de Dispositivos
        </h3>

        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6, marginBottom: "8px" }}>
            Usá este código para autorizar teléfonos o PCs de empleados sin compartir tu contraseña de dueño.
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
            También podés compartir el enlace directo para abrir el selector de empleados al instante.
          </p>
        </div>

        {/* Código de Acceso */}
        <div
          style={{
            background: "var(--surface-2)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            fontSize: "20px",
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.1em",
            color: currentBranch?.accessKey ? "var(--primary)" : "var(--text-3)",
            fontFamily: "monospace",
            marginBottom: "12px",
          }}
        >
          {currentBranch?.accessKey || "SIN CÓDIGO GENERADO"}
        </div>

        {currentBranch?.accessKey && (
          <>
            {/* Enlace de Acceso */}
            <div
              style={{
                background: "var(--surface-2)",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                fontSize: "13px",
                color: "var(--text-2)",
                textAlign: "center",
                wordBreak: "break-all",
                marginBottom: "16px",
              }}
            >
              {accessEntryUrl || `/${currentBranch.accessKey}`}
            </div>

            {/* Botones de acción */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginBottom: "16px" }}>
              <button
                className="btn btn-sm btn-ghost"
                style={{ border: "1px solid var(--border)" }}
                onClick={() => copyAccessValue(currentBranch.accessKey, "Codigo copiado.")}
              >
                📋 Copiar codigo
              </button>
              <button
                className="btn btn-sm btn-ghost"
                style={{ border: "1px solid var(--border)" }}
                onClick={() => copyAccessValue(accessEntryUrl, "Enlace copiado.")}
                disabled={!accessEntryUrl}
              >
                🔗 Copiar enlace
              </button>
              {accessEntryUrl && (
                <a
                  href={accessEntryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-ghost"
                  style={{ border: "1px solid var(--border)", textDecoration: "none" }}
                >
                  🚀 Abrir enlace
                </a>
              )}
            </div>
          </>
        )}

        {/* Botón Generar */}
        <button
          className="btn btn-sm btn-ghost"
          style={{ alignSelf: "center", border: "1px solid var(--border)" }}
          onClick={async () => {
            if (confirm("¿Generar un nuevo código? Los dispositivos viejos perderán el acceso.")) {
              await handleGenerateAccessKey();
            }
          }}
        >
          {currentBranch?.accessKey ? "🔄 Generar nuevo código" : "✨ Generar primer código"}
        </button>

        {/* Información adicional */}
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "rgba(59, 130, 246, 0.08)",
            borderRadius: "12px",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            fontSize: "13px",
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          💡 <strong>Importante:</strong> Al generar un nuevo código, todos los dispositivos que estaban usando el código anterior dejarán de funcionar y deberán volver a autenticarse.
        </div>
      </section>

      {/* Cómo funciona */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text-2)" }}>
          📖 ¿Cómo funciona?
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "20px" }}>1️⃣</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Compartí el código o enlace</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                Enviá el código de acceso o el enlace directo a tus empleados.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "20px" }}>2️⃣</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>El empleado ingresa el código</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                En la pantalla de login, el empleado ingresa el código o abre el enlace.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "20px" }}>3️⃣</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Selecciona su nombre</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                El empleado selecciona su nombre de la lista de empleados de esta sucursal.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "20px" }}>4️⃣</div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>Ingresa su PIN (si tiene)</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                Si el empleado tiene PIN configurado, deberá ingresarlo para completar el acceso.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
