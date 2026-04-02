/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import ThemeEditor from "@/components/ui/ThemeEditor";
import { optimizeBrandingImage } from "@/lib/image-upload";
import type { TicketPreviewData } from "@/lib/ticket-format";
import type { TicketPrintMode } from "../types";

interface SucursalTabProps {
  branchId: string;
  isOwner: boolean;
  currentBranch: any;
  loadingCurrentBranch: boolean;
  editBranchName: string;
  editBranchAddress: string;
  editBranchPhone: string;
  editLogoUrl: string | null;
  uploadingLogo: boolean;
  savingBranch: boolean;
  branchSettingsError: string | null;
  branchSettingsMessage: string | null;
  ticketShowLogo: boolean;
  ticketShowAddress: boolean;
  ticketShowPhone: boolean;
  ticketShowFooterText: boolean;
  ticketFooterText: string;
  ticketPrintMode: TicketPrintMode;
  loadingTicketSettings: boolean;
  savingTicketSettings: boolean;
  ticketSettingsError: string | null;
  ticketSettingsMessage: string | null;
  pricingMode: "SHARED" | "BRANCH";
  loadingExpirySettings: boolean;
  savingPricingSettings: boolean;
  pricingSettingsError: string | null;
  pricingSettingsMessage: string | null;
  expiryAlertDays: string;
  savingExpirySettings: boolean;
  expirySettingsError: string | null;
  expirySettingsMessage: string | null;
  allowNegativeStock: boolean;
  savingStockRules: boolean;
  stockRulesError: string | null;
  stockRulesMessage: string | null;
  fiscalEnvironment: "TEST" | "PROD";
  fiscalSettingsActive: boolean;
  fiscalMinAmount: number;
  loadingFiscalSettings: boolean;
  savingFiscalSettings: boolean;
  fiscalSettingsError: string | null;
  fiscalSettingsMessage: string | null;
  // Setters
  setEditBranchName: (v: string) => void;
  setEditBranchAddress: (v: string) => void;
  setEditBranchPhone: (v: string) => void;
  setEditLogoUrl: (v: string | null) => void;
  setUploadingLogo: (v: boolean) => void;
  setTicketShowLogo: (v: boolean) => void;
  setTicketShowAddress: (v: boolean) => void;
  setTicketShowPhone: (v: boolean) => void;
  setTicketShowFooterText: (v: boolean) => void;
  setTicketFooterText: (v: string) => void;
  setTicketPrintMode: (v: TicketPrintMode) => void;
  setPricingMode: (v: "SHARED" | "BRANCH") => void;
  setExpiryAlertDays: (v: string) => void;
  setAllowNegativeStock: (v: boolean) => void;
  setFiscalEnvironment: (v: "TEST" | "PROD") => void;
  setFiscalSettingsActive: (v: boolean) => void;
  setFiscalMinAmount: (v: number) => void;
  // Handlers
  handleSaveBranchSettings: () => Promise<void>;
  handleSaveTicketSettings: () => Promise<void>;
  handleSavePricingSettings: () => Promise<void>;
  handleSaveExpirySettings: () => Promise<void>;
  handleSaveStockRules: () => Promise<void>;
  handleSaveFiscalSettings: () => Promise<void>;
  openTicketPreview: (data: TicketPreviewData) => void;
}

export default function SucursalTab({
  branchId,
  isOwner,
  currentBranch,
  loadingCurrentBranch,
  editBranchName,
  editBranchAddress,
  editBranchPhone,
  editLogoUrl,
  uploadingLogo,
  savingBranch,
  branchSettingsError,
  branchSettingsMessage,
  ticketShowLogo,
  ticketShowAddress,
  ticketShowPhone,
  ticketShowFooterText,
  ticketFooterText,
  ticketPrintMode,
  loadingTicketSettings,
  savingTicketSettings,
  ticketSettingsError,
  ticketSettingsMessage,
  pricingMode,
  loadingExpirySettings,
  savingPricingSettings,
  pricingSettingsError,
  pricingSettingsMessage,
  expiryAlertDays,
  savingExpirySettings,
  expirySettingsError,
  expirySettingsMessage,
  allowNegativeStock,
  savingStockRules,
  stockRulesError,
  stockRulesMessage,
  fiscalEnvironment,
  fiscalSettingsActive,
  fiscalMinAmount,
  loadingFiscalSettings,
  savingFiscalSettings,
  fiscalSettingsError,
  fiscalSettingsMessage,
  setEditBranchName,
  setEditBranchAddress,
  setEditBranchPhone,
  setEditLogoUrl,
  setUploadingLogo,
  setTicketShowLogo,
  setTicketShowAddress,
  setTicketShowPhone,
  setTicketShowFooterText,
  setTicketFooterText,
  setTicketPrintMode,
  setPricingMode,
  setExpiryAlertDays,
  setAllowNegativeStock,
  setFiscalEnvironment,
  setFiscalSettingsActive,
  setFiscalMinAmount,
  handleSaveBranchSettings,
  handleSaveTicketSettings,
  handleSavePricingSettings,
  handleSaveExpirySettings,
  handleSaveStockRules,
  handleSaveFiscalSettings,
  openTicketPreview,
}: SucursalTabProps) {
  const editPrimaryColor = currentBranch?.primaryColor || "#22c55e";
  const editBgColor = currentBranch?.bgColor || "#0f172a";
  const sectionGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "18px",
    alignItems: "start",
  } as React.CSSProperties;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
      {/* Identidad Visual */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🎨 Identidad Visual
          </h2>
        </div>

        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderBottom: "2px solid var(--primary)",
          borderRadius: "var(--radius)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ position: "relative", width: "80px", height: "80px", borderRadius: "12px", border: "2px dashed var(--border)", overflow: "hidden", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {editLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editLogoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : uploadingLogo ? (
                <span className="animate-pulse">...</span>
              ) : (
                <span style={{ fontSize: "24px", opacity: 0.5 }}>📸</span>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingLogo(true);
                  try {
                    const optimizedFile = await optimizeBrandingImage(file);
                    const formData = new FormData();
                    formData.append("file", optimizedFile);
                    formData.append("folder", "branding");
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) {
                      setEditLogoUrl(null);
                      return;
                    }
                    if (typeof data?.secure_url !== "string" || !data.secure_url) {
                      setEditLogoUrl(null);
                      return;
                    }
                    setEditLogoUrl(data.secure_url);
                  } catch (err) {
                    console.error(err);
                    setEditLogoUrl(null);
                  } finally {
                    setUploadingLogo(false);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>NOMBRE DEL NEGOCIO</label>
              <input
                className="input"
                value={editBranchName}
                onChange={(e) => setEditBranchName(e.target.value)}
                placeholder="Nombre de la sucursal"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>DIRECCION</label>
              <input
                className="input"
                value={editBranchAddress}
                onChange={(e) => setEditBranchAddress(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>TELEFONO</label>
              <input
                className="input"
                value={editBranchPhone}
                onChange={(e) => setEditBranchPhone(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={handleSaveBranchSettings}
            disabled={savingBranch || uploadingLogo || !editBranchName.trim()}
          >
            {savingBranch ? "Guardando..." : "Guardar sucursal"}
          </button>
          <div style={{ fontSize: "12px", color: branchSettingsError ? "var(--red)" : branchSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
            {branchSettingsError || branchSettingsMessage || "Nombre, logo y datos del ticket se guardan aca."}
          </div>
        </div>
      </section>

      {/* Theme Editor */}
      <section style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🎨 Tema
          </h2>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
          {loadingCurrentBranch ? (
            <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando editor de temas...</div>
          ) : (
            <ThemeEditor
              branchId={branchId}
              initialBg={editBgColor}
              initialAccent={editPrimaryColor}
              onSaved={() => window.location.reload()}
            />
          )}
        </div>
      </section>

      {/* Ticket */}
      {isOwner && (
        <section style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              🧾 Ticket
            </h2>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              <button
                type="button"
                className={`btn ${ticketShowLogo ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setTicketShowLogo(!ticketShowLogo)}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                <span>Logo</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{ticketShowLogo ? "ON" : "OFF"}</span>
              </button>
              <button
                type="button"
                className={`btn ${ticketShowAddress ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setTicketShowAddress(!ticketShowAddress)}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                <span>Direccion</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{ticketShowAddress ? "ON" : "OFF"}</span>
              </button>
              <button
                type="button"
                className={`btn ${ticketShowPhone ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setTicketShowPhone(!ticketShowPhone)}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                <span>Telefono</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{ticketShowPhone ? "ON" : "OFF"}</span>
              </button>
              <button
                type="button"
                className={`btn ${ticketShowFooterText ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setTicketShowFooterText(!ticketShowFooterText)}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                <span>Pie de ticket</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{ticketShowFooterText ? "ON" : "OFF"}</span>
              </button>
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>PIE DEL TICKET</label>
              <textarea
                className="input"
                value={ticketFooterText}
                onChange={(e) => setTicketFooterText(e.target.value.slice(0, 400))}
                placeholder="Opcional"
                rows={4}
                style={{ minHeight: "104px", resize: "vertical" }}
                disabled={loadingTicketSettings || savingTicketSettings || !ticketShowFooterText}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>MODO DE IMPRESION</label>
              <select
                className="input"
                value={ticketPrintMode}
                onChange={(e) => setTicketPrintMode(e.target.value as TicketPrintMode)}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                <option value="STANDARD">Standard</option>
                <option value="THERMAL_58">Termica 58mm</option>
                <option value="THERMAL_80">Termica 80mm</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveTicketSettings}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                {savingTicketSettings ? "Guardando..." : "Guardar ticket"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openTicketPreview({
                  saleId: "demo",
                  ticketNumber: "000123",
                  issuedAt: new Date().toISOString(),
                  printMode: ticketPrintMode,
                  items: [{ name: "Producto Demo", quantity: 2, unitPrice: 1000, subtotal: 2000 }],
                  subtotal: 2000,
                  discount: 0,
                  total: 2000,
                  paymentMethod: "CASH",
                  paymentMethodLabel: "Efectivo",
                  branchName: editBranchName,
                  branchAddress: editBranchAddress,
                  branchPhone: editBranchPhone,
                  branchLogoUrl: editLogoUrl,
                  footerText: ticketFooterText,
                  orderLink: null,
                  employeeName: null,
                  customerName: null,
                  showLogo: ticketShowLogo,
                  showAddress: ticketShowAddress,
                  showPhone: ticketShowPhone,
                  showFooterText: ticketShowFooterText,
                  cashReceived: null,
                  change: null,
                  voided: false,
                })}
                disabled={loadingTicketSettings || savingTicketSettings}
              >
                Vista previa
              </button>
            </div>
            <div style={{ fontSize: "12px", color: ticketSettingsError ? "var(--red)" : ticketSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
              {ticketSettingsError || ticketSettingsMessage || "Configura como se verán los tickets de esta sucursal."}
            </div>
          </div>
        </section>
      )}

      {/* Precios */}
      {isOwner && (
        <section style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              💸 Precios
            </h2>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>Modo de precios</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>El stock no cambia. Solo define si precio y costo son compartidos o por sucursal.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button
                type="button"
                className={`btn ${pricingMode === "SHARED" ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", minHeight: "70px", justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start" }}
                onClick={() => setPricingMode("SHARED")}
                disabled={loadingExpirySettings || savingPricingSettings}
              >
                <span style={{ fontWeight: 700 }}>Iguales en todas</span>
                <span style={{ fontSize: "12px", color: pricingMode === "SHARED" ? "rgba(255,255,255,0.9)" : "var(--text-3)" }}>Editás una vez y se copia precio/costo al resto.</span>
              </button>
              <button
                type="button"
                className={`btn ${pricingMode === "BRANCH" ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", minHeight: "70px", justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start" }}
                onClick={() => setPricingMode("BRANCH")}
                disabled={loadingExpirySettings || savingPricingSettings}
              >
                <span style={{ fontWeight: 700 }}>Separados por sucursal</span>
                <span style={{ fontSize: "12px", color: pricingMode === "BRANCH" ? "rgba(255,255,255,0.9)" : "var(--text-3)" }}>Cada sucursal conserva y edita sus valores propios.</span>
              </button>
            </div>

            <div style={{ padding: "12px 14px", borderRadius: "12px", background: pricingMode === "SHARED" ? "rgba(34,197,94,0.08)" : "var(--surface-2)", border: `1px solid ${pricingMode === "SHARED" ? "rgba(34,197,94,0.2)" : "var(--border)"}`, fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 }}>
              {pricingMode === "SHARED" ? "Al guardar, esta sucursal copia precio y costo al resto." : "Al separar, cada sucursal conserva sus valores."}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: pricingSettingsError ? "var(--red)" : pricingSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
                {pricingSettingsError || pricingSettingsMessage || "Esto aplica a todo el kiosco, no solo a la sucursal actual."}
              </div>
              <button
                className="btn btn-ghost"
                style={{ border: "1px solid var(--border)" }}
                onClick={handleSavePricingSettings}
                disabled={loadingExpirySettings || savingPricingSettings || pricingMode === "SHARED"}
              >
                {savingPricingSettings ? "Guardando..." : "Guardar modo de precios"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Vencimientos */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📅 Vencimientos
          </h2>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>Alerta de vencimiento</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>Define cuántos dias antes queres ver la alerta.</div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ minWidth: "120px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>Días de alerta</label>
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                value={expiryAlertDays}
                onChange={(e) => setExpiryAlertDays(e.target.value)}
                disabled={loadingExpirySettings || savingExpirySettings}
              />
            </div>

            <button
              className="btn btn-ghost"
              style={{ border: "1px solid var(--border)" }}
              onClick={handleSaveExpirySettings}
              disabled={loadingExpirySettings || savingExpirySettings}
            >
              {savingExpirySettings ? "Guardando..." : "Guardar alerta"}
            </button>
          </div>

          <div style={{ fontSize: "12px", color: expirySettingsError ? "var(--red)" : expirySettingsMessage ? "var(--green)" : "var(--text-3)" }}>
            {loadingExpirySettings ? "Cargando configuración..." : expirySettingsError || expirySettingsMessage || "Usa 0 para avisar solo los lotes que vencen hoy, sin anticipación extra."}
          </div>
        </div>
      </section>

      {/* Stock */}
      {isOwner && (
        <section style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              📦 Reglas de Stock
            </h2>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>Permitir venta con stock en 0</div>
                <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>Permite vender y dejar faltante en negativo.</div>
              </div>
              <button
                type="button"
                onClick={() => setAllowNegativeStock(!allowNegativeStock)}
                disabled={loadingCurrentBranch || savingStockRules}
                style={{ width: "52px", height: "30px", borderRadius: "99px", border: "none", background: allowNegativeStock ? "var(--green)" : "var(--border)", position: "relative", cursor: loadingCurrentBranch || savingStockRules ? "not-allowed" : "pointer", flexShrink: 0 }}
              >
                <span style={{ position: "absolute", top: "3px", left: allowNegativeStock ? "25px" : "3px", width: "24px", height: "24px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>

            <div style={{ padding: "12px 14px", borderRadius: "12px", background: allowNegativeStock ? "rgba(34,197,94,0.08)" : "var(--surface-2)", border: `1px solid ${allowNegativeStock ? "rgba(34,197,94,0.2)" : "var(--border)"}`, fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 }}>
              {allowNegativeStock ? "Activo: productos sin stock seguirán visibles en caja, con badges de Sin stock o Stock negativo." : "Inactivo: la sucursal mantiene el comportamiento actual y no deja vender cuando el stock vendible llega a 0."}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: stockRulesError ? "var(--red)" : stockRulesMessage ? "var(--green)" : "var(--text-3)" }}>
                {stockRulesError || stockRulesMessage || "Esta opción aplica solo a la sucursal actual."}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ border: "1px solid var(--border)" }}
                onClick={handleSaveStockRules}
                disabled={loadingCurrentBranch || savingStockRules}
              >
                {savingStockRules ? "Guardando..." : "Guardar regla"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
