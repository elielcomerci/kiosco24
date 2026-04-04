"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import BackButton from "@/components/ui/BackButton";
import ModalPortal from "@/components/ui/ModalPortal";
import TicketModal from "@/components/ticket/TicketModal";
import ThemeEditor from "@/components/ui/ThemeEditor";
import {
  SUBSCRIPTION_CANCEL_LABEL,
  SUBSCRIPTION_PRICE_ARS,
  formatSubscriptionPrice,
  getSubscriptionPromoLabel,
} from "@/lib/subscription-plan";
import { optimizeBrandingImage } from "@/lib/image-upload";
import type { TicketPreviewData } from "@/lib/ticket-format";
import { getTicketPrintModeLabel, type TicketPrintMode } from "@/lib/ticketing";
import ConfigTabsContainer from "./ConfigTabsContainer";
import type { Employee, Category, Branch, PricingMode, FiscalEnvironment, Subscription } from "./types";
import ZapAdSlot from "@/components/ads/ZapAdSlot";

// ─── Employee Form Modal ───────────────────────────────────────────────────────
function EmployeeModal({
  branchId,
  allBranches,
  employee,
  onClose,
  onSave,
}: {
  branchId: string;
  allBranches: Branch[];
  employee: Employee | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !employee;
  const [name, setName] = useState(employee?.name || "");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"CASHIER" | "MANAGER">(employee?.role || "CASHIER");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    employee?.branches.map(b => b.id) || [branchId]
  );
  const [active, setActive] = useState(employee?.active ?? true);
  const [suspendedUntil, setSuspendedUntil] = useState(employee?.suspendedUntil || "");
  const [removePin, setRemovePin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hasStoredPin = Boolean(employee?.hasPin);

  const toggleBranch = (id: string) => {
    setSelectedBranchIds(prev => 
      prev.includes(id) 
        ? (prev.length > 1 ? prev.filter(bid => bid !== id) : prev) 
        : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    if (isNew) {
      const res = await fetch("/api/empleados", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ 
          name, 
          pin: pin || null, 
          role, 
          branchIds: selectedBranchIds 
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "No se pudo crear el empleado.");
        setLoading(false);
        return;
      }
    } else {
      const payload: {
        name: string;
        active: boolean;
        suspendedUntil: string | null;
        pin?: string | null;
        role?: string;
        branchIds?: string[];
      } = {
        name,
        active,
        suspendedUntil: suspendedUntil || null,
        role,
        branchIds: selectedBranchIds,
      };

      if (removePin) {
        payload.pin = null;
      } else if (pin.trim()) {
        payload.pin = pin;
      }

      const res = await fetch(`/api/empleados/${employee.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "No se pudo guardar el empleado.");
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onSave();
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    const res = await fetch(`/api/empleados/${employee!.id}`, {
      method: "DELETE",
      headers: {
        "x-branch-id": branchId,
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo eliminar.");
      setLoading(false);
      return;
    }
    setLoading(false);
    onSave();
  };

  return (
    <div 
      className="modal-overlay animate-fade-in" 
      onClick={onClose}
      style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div 
        className="modal animate-slide-up" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxHeight: "85dvh",
          overflowY: "auto", 
          padding: "20px",
          width: "100%",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
          {isNew ? "Nuevo empleado" : "Editar empleado"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nombre
            </label>
            <input
              className="input"
              placeholder="Ej: Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              PIN numérico (opcional)
            </label>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={
                removePin
                  ? "El PIN actual se va a quitar"
                  : !isNew && hasStoredPin
                    ? "Escribi uno nuevo para reemplazarlo"
                    : "Ej: 1234"
              }
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (removePin) {
                  setRemovePin(false);
                }
              }}
              disabled={removePin}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: "20px" }}
            />
            {!isNew && hasStoredPin && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", gap: "10px" }}>
                <span style={{ fontSize: "11px", color: removePin ? "var(--amber)" : "var(--text-3)" }}>
                  {removePin
                    ? "El PIN se quitara cuando guardes."
                    : pin
                      ? "Se reemplazara el PIN actual."
                      : "Deja vacio para mantener el PIN actual."}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ border: "1px solid var(--border)", whiteSpace: "nowrap" }}
                  onClick={() => {
                    setRemovePin((prev) => !prev);
                    setPin("");
                  }}
                >
                  {removePin ? "Mantener PIN" : "Quitar PIN"}
                </button>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Suspender hasta (Opcional)
            </label>
            <input
              className="input"
              type="date"
              value={suspendedUntil ? suspendedUntil.split('T')[0] : ""}
              onChange={(e) => setSuspendedUntil(e.target.value ? `${e.target.value}T23:59:59Z` : "")}
              style={{ colorScheme: "dark" }}
            />
            {suspendedUntil && (
              <p style={{ fontSize: "11px", color: "var(--amber)", marginTop: "4px" }}>
                El empleado no podrá entrar hasta esta fecha.
              </p>
            )}
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
              Rol
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["CASHIER", "MANAGER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn btn-sm ${role === r ? "btn-green" : "btn-ghost"}`}
                  style={{ flex: 1, textTransform: "capitalize", border: "1px solid var(--border)" }}
                  onClick={() => setRole(r)}
                >
                  {r === "CASHIER" ? "Cajero" : "Encargado"}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>
              {role === "CASHIER" 
                ? "Solo puede abrir caja y vender." 
                : "Tiene acceso a retiros, gastos y estadísticas de la sucursal."}
            </p>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
              Sucursales asignadas
            </label>
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px",
              maxHeight: "120px",
              overflowY: "auto",
              padding: "8px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)"
            }}>
              {allBranches.map((b) => (
                <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px", cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={selectedBranchIds.includes(b.id)} 
                    onChange={() => toggleBranch(b.id)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span style={{ fontSize: "14px" }}>{b.name}</span>
                </label>
              ))}
            </div>
          </div>

          {!isNew && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Caja Habilitada</span>
              <button
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "99px",
                  background: active ? "var(--primary)" : "var(--border)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  position: "relative",
                  flexShrink: 0
                }}
                onClick={() => setActive((a) => !a)}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: active ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
          {!isNew && (
            <button
              className="btn btn-ghost"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
              onClick={handleDelete}
              disabled={loading}
            >
              {confirming ? "¿Confirmar?" : "🗑"}
            </button>
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-green"
            style={{ flex: 2 }}
            onClick={handleSave}
            disabled={loading || !name.trim()}
          >
            {loading ? "..." : isNew ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Branch Form Modal ─────────────────────────────────────────────────────────
function BranchModal({
  branchId,
  pricingMode,
  onClose,
  onSave,
}: {
  branchId: string;
  pricingMode: PricingMode;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    
    // Create new branch
    await fetch("/api/branches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-branch-id": branchId,
      },
      body: JSON.stringify({
        name,
        sourceBranchId: branchId,
      }),
    });
    
    setLoading(false);
    onSave();
  };

  return (
    <div 
      className="modal-overlay animate-fade-in" 
      onClick={onClose}
      style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div 
        className="modal animate-slide-up" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxHeight: "85dvh",
          overflowY: "auto", 
          padding: "20px",
          width: "100%",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
          Nueva Sucursal
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "12px", lineHeight: "1.4" }}>
          {pricingMode === "SHARED"
            ? <>Tu catálogo actual se va a copiar a la nueva sucursal con el <strong style={{ color: "var(--text)" }}>mismo precio y costo</strong>, pero con <strong style={{ color: "var(--text)" }}>stock en 0</strong> porque sigue siendo individual.</>
            : <>Tu catálogo actual se va a copiar a la nueva sucursal con <strong style={{ color: "var(--text)" }}>stock y precio en 0</strong> para que puedas configurarlo localmente.</>}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nombre de la sucursal
            </label>
            <input
              className="input"
              placeholder="Ej: Kiosco Centro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-green"
            style={{ flex: 2 }}
            onClick={handleSave}
            disabled={loading || !name.trim()}
          >
            {loading ? "Creando..." : "Crear e inicializar 🚀"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Form Modal ────────────────────────────────────────────────────────
function CategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: "new" | Category;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = category === "new";
  const [name, setName] = useState(isNew ? "" : category.name);
  const [color, setColor] = useState(isNew ? "#3b82f6" : category.color || "#3b82f6");
  const [showInGrid, setShowInGrid] = useState(isNew ? true : category.showInGrid !== false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);

    const payload = { name, color, showInGrid };

    if (isNew) {
      await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/categorias/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setLoading(false);
    onSave();
  };

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    await fetch(`/api/categorias/${(category as Category).id}`, {
      method: "DELETE",
    });
    setLoading(false);
    onSave();
  };

  return (
    <div 
      className="modal-overlay animate-fade-in" 
      onClick={onClose}
      style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div 
        className="modal animate-slide-up" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxHeight: "85dvh",
          overflowY: "auto", 
          padding: "20px",
          width: "100%",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
          {isNew ? "Nueva Categoría" : "Editar Categoría"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nombre
            </label>
            <input
              className="input"
              placeholder="Ej: Bebidas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
              Color
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                padding: "2px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                cursor: "pointer"
              }}
            />
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "4px" }}>
              <input 
                type="checkbox" 
                checked={showInGrid}
                onChange={(e) => setShowInGrid(e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <div>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Mostrar en la caja</span>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-3)", lineHeight: "1.2" }}>Desactivá esto para ocultar la categoría de los botones principales.</p>
              </div>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
          {!isNew && (
            <button
              className="btn btn-ghost"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
              onClick={handleDelete}
              disabled={loading}
            >
              {confirming ? "¿Seguro?" : "🗑"}
            </button>
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-green"
            style={{ flex: 2 }}
            onClick={handleSave}
            disabled={loading || !name.trim()}
          >
            {loading ? "..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Config Page ─────────────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const { branchId } = useParams() as { branchId: string };
  const router = useRouter();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCurrentBranch, setLoadingCurrentBranch] = useState(true);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [loadingExpirySettings, setLoadingExpirySettings] = useState(true);
  const [loadingTicketSettings, setLoadingTicketSettings] = useState(true);
  const [loadingFiscalSettings, setLoadingFiscalSettings] = useState(true);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [expiryAlertDays, setExpiryAlertDays] = useState("30");
  const [pricingMode, setPricingMode] = useState<PricingMode>("BRANCH");
  const [savedPricingMode, setSavedPricingMode] = useState<PricingMode>("BRANCH");
  const [savingExpirySettings, setSavingExpirySettings] = useState(false);
  const [expirySettingsMessage, setExpirySettingsMessage] = useState<string | null>(null);
  const [expirySettingsError, setExpirySettingsError] = useState<string | null>(null);
  const [savingPricingSettings, setSavingPricingSettings] = useState(false);
  const [pricingSettingsMessage, setPricingSettingsMessage] = useState<string | null>(null);
  const [pricingSettingsError, setPricingSettingsError] = useState<string | null>(null);

  const [employeeModal, setEmployeeModal] = useState<"new" | Employee | null>(null);
  const [branchModal, setBranchModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState<"new" | Category | null>(null);

  const [editBranchName, setEditBranchName] = useState("");
  const [editBranchAddress, setEditBranchAddress] = useState("");
  const [editBranchPhone, setEditBranchPhone] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editPrimaryColor, setEditPrimaryColor] = useState("#22c55e");
  const [editBgColor, setEditBgColor] = useState("#0f172a");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchSettingsMessage, setBranchSettingsMessage] = useState<string | null>(null);
  const [branchSettingsError, setBranchSettingsError] = useState<string | null>(null);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [savingStockRules, setSavingStockRules] = useState(false);
  const [stockRulesMessage, setStockRulesMessage] = useState<string | null>(null);
  const [stockRulesError, setStockRulesError] = useState<string | null>(null);
  const [ticketShowLogo, setTicketShowLogo] = useState(true);
  const [ticketShowAddress, setTicketShowAddress] = useState(false);
  const [ticketShowPhone, setTicketShowPhone] = useState(false);
  const [ticketShowFooterText, setTicketShowFooterText] = useState(true);
  const [ticketFooterText, setTicketFooterText] = useState("¡Gracias por su compra!");
  const [ticketOrderLink, setTicketOrderLink] = useState("");
  const [ticketPrintMode, setTicketPrintMode] = useState<TicketPrintMode>("STANDARD");
  const [savingTicketSettings, setSavingTicketSettings] = useState(false);
  const [ticketSettingsMessage, setTicketSettingsMessage] = useState<string | null>(null);
  const [ticketSettingsError, setTicketSettingsError] = useState<string | null>(null);
  const [showTicketDemo, setShowTicketDemo] = useState(false);
  const [fiscalActive, setFiscalActive] = useState(false);
  const [fiscalCuit, setFiscalCuit] = useState("");
  const [fiscalRazonSocial, setFiscalRazonSocial] = useState("");
  const [fiscalDomicilioFiscal, setFiscalDomicilioFiscal] = useState("");
  const [fiscalInicioActividad, setFiscalInicioActividad] = useState("");
  const [fiscalIngresosBrutos, setFiscalIngresosBrutos] = useState("");
  const [fiscalEnvironment, setFiscalEnvironment] = useState<FiscalEnvironment>("TEST");
  const [fiscalPuntoVenta, setFiscalPuntoVenta] = useState("1");
  const [fiscalMinimumAmount, setFiscalMinimumAmount] = useState("0");
  const [savingFiscalSettings, setSavingFiscalSettings] = useState(false);
  const [fiscalSettingsMessage, setFiscalSettingsMessage] = useState<string | null>(null);
  const [fiscalSettingsError, setFiscalSettingsError] = useState<string | null>(null);
  const [fiscalProductionEnabled, setFiscalProductionEnabled] = useState(false);
  const [fiscalAfipAccessToken, setFiscalAfipAccessToken] = useState("");
  const [fiscalTokenConfigured, setFiscalTokenConfigured] = useState(false);
  const [fiscalTokenLast4, setFiscalTokenLast4] = useState<string | null>(null);
  const [fiscalUsingSharedTestToken, setFiscalUsingSharedTestToken] = useState(false);
  const [fiscalClearOwnToken, setFiscalClearOwnToken] = useState(false);

  // MercadoPago
  const [mpSetupLoading, setMpSetupLoading] = useState(false);
  const [mpSetupError, setMpSetupError] = useState<string | null>(null);

  const accessEntryUrl =
    currentBranch?.accessKey && typeof window !== "undefined"
      ? `${window.location.origin}/${currentBranch.accessKey}`
      : "";

  // Auto-trigger setup-pos cuando MP acaba de conectarse (viene con ?mp=connected)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("mp") === "connected") {
      // Limpiar el query param sin recargar
      url.searchParams.delete("mp");
      window.history.replaceState({}, "", url.toString());
      // Disparar setup-pos automáticamente
      handleMpSetupPos();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch]);

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    const res = await fetch("/api/empleados", {
      headers: {
        "x-branch-id": branchId,
      },
    });
    if(res.ok) {
      const data = await res.json();
      setEmployees(data);
    }
    setLoadingEmployees(false);
  }, [branchId]);

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    const res = await fetch("/api/branches");
    if(res.ok) {
      const data = await res.json();
      setBranches(data.branches || []);
    }
    setLoadingBranches(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    const res = await fetch("/api/categorias");
    if(res.ok) {
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    }
    setLoadingCategories(false);
  }, []);

  const applyBranchDraft = useCallback((branch: Branch) => {
    setCurrentBranch(branch);
    setEditBranchName(branch.name);
    setEditBranchAddress(branch.address || "");
    setEditBranchPhone(branch.phone || "");
    setEditLogoUrl(branch.logoUrl || "");
    setEditPrimaryColor(branch.primaryColor || "#22c55e");
    setEditBgColor(branch.bgColor || "#0f172a");
    setAllowNegativeStock(branch.allowNegativeStock ?? false);
    setBranches((prev) => {
      if (prev.some((candidate) => candidate.id === branch.id)) {
        return prev.map((candidate) => (candidate.id === branch.id ? branch : candidate));
      }

      return prev;
    });
  }, []);

  const fetchCurrentBranch = useCallback(async () => {
    setLoadingCurrentBranch(true);
    const res = await fetch(`/api/branches`); // Reuse GET all or specific if needed
    if (res.ok) {
      const data = await res.json();
      const b = (data.branches as Branch[]).find(v => v.id === branchId);
      if (b) {
        applyBranchDraft(b);
      }
    }
    setLoadingCurrentBranch(false);
  }, [applyBranchDraft, branchId]);

  const copyAccessValue = async (value: string, successMessage: string) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      alert(successMessage);
    } catch {
      alert("No se pudo copiar automaticamente. Proba de nuevo.");
    }
  };

  const fetchSubscription = useCallback(async () => {
    setLoadingSubscription(true);
    try {
      const res = await fetch("/api/subscription/status");
      if (res.ok) {
        const data = await res.json();
        setSubscription(
          data?.subscription
            ? {
                status: data.subscription.status,
                managementUrl: data.subscription.managementUrl,
                amountArs:
                  typeof data?.pricing?.amountArs === "number" ? data.pricing.amountArs : null,
                pricingSource:
                  typeof data?.pricing?.source === "string" ? data.pricing.source : null,
                freezeEndsAt:
                  typeof data?.pricing?.freezeEndsAt === "string" ? data.pricing.freezeEndsAt : null,
              }
            : {
                status: "NOT_CONFIGURED",
                managementUrl: null,
                amountArs:
                  typeof data?.pricing?.amountArs === "number" ? data.pricing.amountArs : null,
                pricingSource:
                  typeof data?.pricing?.source === "string" ? data.pricing.source : null,
                freezeEndsAt:
                  typeof data?.pricing?.freezeEndsAt === "string" ? data.pricing.freezeEndsAt : null,
              },
        );
      }
    } catch {}
    setLoadingSubscription(false);
  }, []);

  const fetchExpirySettings = useCallback(async () => {
    setLoadingExpirySettings(true);
    try {
      const res = await fetch("/api/kiosco/settings", {
        headers: {
          "x-branch-id": branchId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setExpiryAlertDays(String(data?.expiryAlertDays ?? 30));
        const nextPricingMode = data?.pricingMode === "SHARED" ? "SHARED" : "BRANCH";
        setPricingMode(nextPricingMode);
        setSavedPricingMode(nextPricingMode);
      }
    } finally {
      setLoadingExpirySettings(false);
    }
  }, [branchId]);

  const fetchTicketSettings = useCallback(async () => {
    setLoadingTicketSettings(true);
    try {
      const res = await fetch("/api/ticket/settings", {
        headers: {
          "x-branch-id": branchId,
        },
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json().catch(() => null);
      setTicketShowLogo(Boolean(data?.showLogo));
      setTicketShowAddress(Boolean(data?.showAddress));
      setTicketShowPhone(Boolean(data?.showPhone));
      setTicketShowFooterText(Boolean(data?.showFooterText));
      setTicketFooterText(
        typeof data?.footerText === "string" && data.footerText.trim()
          ? data.footerText
          : "¡Gracias por su compra!",
      );
      setTicketOrderLink(typeof data?.orderLink === "string" ? data.orderLink : "");
      setTicketPrintMode(data?.printMode === "THERMAL_58" || data?.printMode === "THERMAL_80" ? data.printMode : "STANDARD");
    } finally {
      setLoadingTicketSettings(false);
    }
  }, [branchId]);

  const fetchFiscalSettings = useCallback(async () => {
    setLoadingFiscalSettings(true);
    try {
      const res = await fetch("/api/fiscal/settings", {
        headers: {
          "x-branch-id": branchId,
        },
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFiscalSettingsError(data?.error || "No se pudo cargar la facturacion electronica.");
        return;
      }

      setFiscalActive(Boolean(data?.branchSettings?.activo));
      setFiscalCuit(typeof data?.profile?.cuit === "string" ? data.profile.cuit : "");
      setFiscalRazonSocial(typeof data?.profile?.razonSocial === "string" ? data.profile.razonSocial : "");
      setFiscalDomicilioFiscal(typeof data?.profile?.domicilioFiscal === "string" ? data.profile.domicilioFiscal : "");
      setFiscalInicioActividad(typeof data?.profile?.inicioActividad === "string" ? data.profile.inicioActividad : "");
      setFiscalIngresosBrutos(typeof data?.profile?.ingresosBrutos === "string" ? data.profile.ingresosBrutos : "");
      setFiscalEnvironment(data?.profile?.environment === "PROD" ? "PROD" : "TEST");
      setFiscalPuntoVenta(
        data?.branchSettings?.puntoDeVenta !== null && data?.branchSettings?.puntoDeVenta !== undefined
          ? String(data.branchSettings.puntoDeVenta)
          : "1",
      );
      setFiscalMinimumAmount(String(data?.branchSettings?.minimumInvoiceAmount ?? 0));
      setFiscalProductionEnabled(Boolean(data?.productionEnabled));
      setFiscalTokenConfigured(Boolean(data?.profile?.tokenConfigured));
      setFiscalTokenLast4(typeof data?.profile?.tokenLast4 === "string" ? data.profile.tokenLast4 : null);
      setFiscalUsingSharedTestToken(Boolean(data?.profile?.usingSharedTestToken));
      setFiscalAfipAccessToken("");
      setFiscalClearOwnToken(false);
      setFiscalSettingsError(null);
    } finally {
      setLoadingFiscalSettings(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchEmployees();
    fetchBranches();
    fetchCategories();
    fetchCurrentBranch();
    fetchSubscription();
    fetchExpirySettings();
    fetchTicketSettings();
    fetchFiscalSettings();
  }, [fetchEmployees, fetchBranches, fetchCategories, fetchCurrentBranch, fetchSubscription, fetchExpirySettings, fetchTicketSettings, fetchFiscalSettings]);

  const handleSaveBranchSettings = async () => {
    if (!editBranchName.trim()) {
      setBranchSettingsError("El nombre de la sucursal es obligatorio.");
      return;
    }

    setBranchSettingsError(null);
    setBranchSettingsMessage(null);
    setSavingBranch(true);

    try {
      const res = await fetch(`/api/branches/${branchId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          name: editBranchName.trim(),
          address: editBranchAddress.trim() || null,
          phone: editBranchPhone.trim() || null,
          logoUrl: editLogoUrl || null,
          primaryColor: editPrimaryColor,
          bgColor: editBgColor,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setBranchSettingsError(data?.error || "No se pudo guardar el logo.");
        return;
      }

      applyBranchDraft(data as Branch);
      setBranchSettingsMessage("Datos de sucursal guardados.");
      router.refresh();
    } catch (error) {
      console.error(error);
      setBranchSettingsError("No se pudo guardar la sucursal.");
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSaveTicketSettings = async () => {
    setTicketSettingsError(null);
    setTicketSettingsMessage(null);
    setSavingTicketSettings(true);

    try {
      const res = await fetch("/api/ticket/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          showLogo: ticketShowLogo,
          showAddress: ticketShowAddress,
          showPhone: ticketShowPhone,
          showFooterText: ticketShowFooterText,
          footerText: ticketFooterText.trim() || null,
          orderLink: ticketOrderLink.trim() || null,
          printMode: ticketPrintMode,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setTicketSettingsError(data?.error || "No se pudo guardar el ticket.");
        return;
      }

      setTicketShowLogo(Boolean(data?.showLogo));
      setTicketShowAddress(Boolean(data?.showAddress));
      setTicketShowPhone(Boolean(data?.showPhone));
      setTicketShowFooterText(Boolean(data?.showFooterText));
      setTicketFooterText(
        typeof data?.footerText === "string" && data.footerText.trim()
          ? data.footerText
          : "¡Gracias por su compra!",
      );
      setTicketOrderLink(typeof data?.orderLink === "string" ? data.orderLink : "");
      setTicketPrintMode(data?.printMode === "THERMAL_58" || data?.printMode === "THERMAL_80" ? data.printMode : "STANDARD");
      setTicketSettingsMessage("Ticket actualizado.");
    } catch (error) {
      console.error(error);
      setTicketSettingsError("No se pudo guardar el ticket.");
    } finally {
      setSavingTicketSettings(false);
    }
  };

  const handleSaveFiscalSettings = async () => {
    setFiscalSettingsError(null);
    setFiscalSettingsMessage(null);
    setSavingFiscalSettings(true);

    try {
      const res = await fetch("/api/fiscal/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          activo: fiscalActive,
          cuit: fiscalCuit,
          razonSocial: fiscalRazonSocial,
          domicilioFiscal: fiscalDomicilioFiscal,
          condicionIva: "MONOTRIBUTO",
          inicioActividad: fiscalInicioActividad,
          ingresosBrutos: fiscalIngresosBrutos.trim() || null,
          environment: fiscalEnvironment,
          puntoDeVenta: fiscalPuntoVenta,
          minimumInvoiceAmount: fiscalMinimumAmount,
          ...(fiscalAfipAccessToken.trim() ? { afipAccessToken: fiscalAfipAccessToken.trim() } : {}),
          ...(fiscalClearOwnToken ? { clearAfipAccessToken: true } : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFiscalSettingsError(data?.error || "No se pudo guardar la facturacion electronica.");
        return;
      }

      setFiscalActive(Boolean(data?.branchSettings?.activo));
      setFiscalCuit(typeof data?.profile?.cuit === "string" ? data.profile.cuit : fiscalCuit);
      setFiscalRazonSocial(typeof data?.profile?.razonSocial === "string" ? data.profile.razonSocial : fiscalRazonSocial);
      setFiscalDomicilioFiscal(
        typeof data?.profile?.domicilioFiscal === "string" ? data.profile.domicilioFiscal : fiscalDomicilioFiscal,
      );
      setFiscalInicioActividad(
        typeof data?.profile?.inicioActividad === "string" ? data.profile.inicioActividad : fiscalInicioActividad,
      );
      setFiscalIngresosBrutos(typeof data?.profile?.ingresosBrutos === "string" ? data.profile.ingresosBrutos : "");
      setFiscalEnvironment(data?.profile?.environment === "PROD" ? "PROD" : "TEST");
      setFiscalPuntoVenta(
        data?.branchSettings?.puntoDeVenta !== null && data?.branchSettings?.puntoDeVenta !== undefined
          ? String(data.branchSettings.puntoDeVenta)
          : fiscalPuntoVenta,
      );
      setFiscalMinimumAmount(String(data?.branchSettings?.minimumInvoiceAmount ?? fiscalMinimumAmount));
      setFiscalProductionEnabled(Boolean(data?.productionEnabled));
      setFiscalTokenConfigured(Boolean(data?.profile?.tokenConfigured));
      setFiscalTokenLast4(typeof data?.profile?.tokenLast4 === "string" ? data.profile.tokenLast4 : null);
      setFiscalUsingSharedTestToken(Boolean(data?.profile?.usingSharedTestToken));
      setFiscalAfipAccessToken("");
      setFiscalClearOwnToken(false);
      setFiscalSettingsMessage("Facturacion electronica actualizada.");
    } catch {
      setFiscalSettingsError("No se pudo guardar la facturacion electronica.");
    } finally {
      setSavingFiscalSettings(false);
    }
  };

  const handleSaveExpirySettings = async () => {
    const normalizedValue = Number(expiryAlertDays);
    if (!Number.isInteger(normalizedValue) || normalizedValue < 0 || normalizedValue > 365) {
      setExpirySettingsError("Ingresá una cantidad de días entre 0 y 365.");
      setExpirySettingsMessage(null);
      return;
    }

    setSavingExpirySettings(true);
    setExpirySettingsError(null);
    setExpirySettingsMessage(null);

    try {
      const res = await fetch("/api/kiosco/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ expiryAlertDays: normalizedValue }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setExpirySettingsError(data?.error || "No se pudo guardar la alerta de vencimientos.");
        return;
      }

      setExpiryAlertDays(String(data?.expiryAlertDays ?? normalizedValue));
      setExpirySettingsMessage("Alerta de vencimientos actualizada.");
    } catch (error) {
      console.error(error);
      setExpirySettingsError("No se pudo guardar la alerta de vencimientos.");
    } finally {
      setSavingExpirySettings(false);
    }
  };

  const handleSavePricingSettings = async () => {
    setPricingSettingsError(null);
    setPricingSettingsMessage(null);

    const isSwitchingToShared = pricingMode === "SHARED" && savedPricingMode !== "SHARED";
    if (
      isSwitchingToShared &&
      !window.confirm(
        "Vamos a usar esta sucursal como base para copiar precio y costo al resto. El stock no se toca. ¿Continuar?",
      )
    ) {
      return;
    }

    setSavingPricingSettings(true);

    try {
      const res = await fetch("/api/kiosco/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          pricingMode,
          sourceBranchId: branchId,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPricingSettingsError(data?.error || "No se pudo guardar el modo de precios.");
        return;
      }

      setPricingMode(data?.pricingMode === "SHARED" ? "SHARED" : "BRANCH");
      setSavedPricingMode(data?.pricingMode === "SHARED" ? "SHARED" : "BRANCH");
      setPricingSettingsMessage(
        data?.pricingMode === "SHARED"
          ? "Precios compartidos activados. Esta sucursal quedó como base."
          : "Precios separados por sucursal activados. Se conservaron los valores actuales.",
      );
    } catch (error) {
      console.error(error);
      setPricingSettingsError("No se pudo guardar el modo de precios.");
    } finally {
      setSavingPricingSettings(false);
    }
  };

  const handleSaveStockRules = async () => {
    setStockRulesError(null);
    setStockRulesMessage(null);
    setSavingStockRules(true);

    try {
      const res = await fetch(`/api/branches/${branchId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          allowNegativeStock,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStockRulesError(data?.error || "No se pudo guardar la regla de stock.");
        return;
      }

      applyBranchDraft(data as Branch);
      setStockRulesMessage("Regla de venta con stock bajo actualizada.");
    } catch (error) {
      console.error(error);
      setStockRulesError("No se pudo guardar la regla de stock.");
    } finally {
      setSavingStockRules(false);
    }
  };

  const handleEmployeeModalClose = () => setEmployeeModal(null);
  const handleEmployeeModalSave = () => { setEmployeeModal(null); fetchEmployees(); };

  const handleBranchModalClose = () => setBranchModal(false);
  const handleBranchModalSave = () => { setBranchModal(false); window.location.reload(); };

  const handleCategoryModalClose = () => setCategoryModal(null);
  const handleCategoryModalSave = () => { setCategoryModal(null); fetchCategories(); };

  const handleMpSetupPos = async () => {
    setMpSetupLoading(true);
    setMpSetupError(null);
    const res = await fetch("/api/mp/setup-pos", {
      method: "POST",
      headers: { "x-branch-id": branchId },
    });
    if (res.ok) {
      fetchCurrentBranch(); // Recargar para mostrar estado actualizado
    } else {
      const data = await res.json();
      setMpSetupError(data.error ?? "Error configurando punto de venta.");
    }
    setMpSetupLoading(false);
  };

  const handleCreateSubscription = async () => {
    setCreatingSubscription(true);
    setSubscriptionError(null);
    try {
      const res = await fetch("/api/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "SETTINGS" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.init_point) {
        window.location.href = data.init_point;
        return;
      }
      setSubscriptionError(data?.error || "No se pudo generar el link.");
    } catch {
      setSubscriptionError("Error de conexión al generar la suscripción.");
    } finally {
      setCreatingSubscription(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelingSubscription(true);
    try {
      const res = await fetch("/api/subscription/cancel", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setCancelModalOpen(false);
        fetchSubscription();
        return;
      }
      alert(data?.error || "Error al cancelar la suscripción.");
    } catch {
      alert("Error de conexión al cancelar.");
    } finally {
      setCancelingSubscription(false);
    }
  };

  const handleMpDisconnect = async () => {
    await fetch(`/api/branches/${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpUserId: null,
        mpAccessToken: null,
        mpRefreshToken: null,
        mpTokenExpiresAt: null,
        mpStoreId: null,
        mpPosId: null,
      }),
    });
    fetchCurrentBranch();
  };

  const currentBranchName = currentBranch?.name || editBranchName || "Sucursal actual";
  const activeEmployees = employees.filter((employee) => employee.active).length;
  const mpStatusLabel = loadingCurrentBranch
    ? "Cargando"
    : !currentBranch?.mpUserId
      ? "Sin conectar"
      : !currentBranch?.mpPosId
        ? "Falta terminal"
        : "Listo";
  const pricingModeLabel = pricingMode === "SHARED" ? "Compartidos" : "Por sucursal";
  const branchAccent = currentBranch?.primaryColor || "var(--primary)";
  const sectionGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "18px",
    alignItems: "start",
  };
  const groupCardStyle = {
    border: "1px solid var(--border)",
    borderRadius: "24px",
    padding: "22px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
    boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
  };
  const heroMetricStyle = {
    borderRadius: "18px",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    minWidth: "140px",
  };
  const heroBadgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "12px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.92)",
  };
  const ticketDemoData: TicketPreviewData = {
    saleId: "demo-ticket",
    ticketNumber: "000123",
    issuedAt: new Date().toISOString(),
    printMode: ticketPrintMode,
    branchName: editBranchName.trim() || currentBranch?.name || "Mi kiosco",
    branchAddress: editBranchAddress.trim() || null,
    branchPhone: editBranchPhone.trim() || null,
    branchLogoUrl: editLogoUrl || null,
    footerText: ticketFooterText.trim() || null,
    orderLink: ticketOrderLink.trim() || null,
    items: [
      { name: "Coca Cola 500ml", quantity: 2, unitPrice: 800, subtotal: 1600 },
      { name: "Alfajor", quantity: 1, unitPrice: 500, subtotal: 500 },
    ],
    subtotal: 2100,
    discount: null,
    total: 2100,
    paymentMethod: "CASH",
    paymentMethodLabel: "Efectivo",
    cashReceived: 2500,
    change: 400,
    employeeName: "Caja principal",
    customerName: null,
    showLogo: ticketShowLogo,
    showAddress: ticketShowAddress,
    showPhone: ticketShowPhone,
    showFooterText: ticketShowFooterText,
    voided: false,
  };


  return (
    <div style={{ minHeight: "100dvh", padding: "24px 16px 110px" }}>
      {/* Header */}
      <div style={{ maxWidth: "1180px", margin: "0 auto 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <BackButton />
        <h1 style={{ fontSize: "20px", fontWeight: 800 }}>Configuración</h1>
        <div style={{ width: "60px" }} />{/* spacer to center title */}
      </div>

      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        
        <ZapAdSlot zone="configuracion" branchId={branchId} />

        <div
          style={{
            borderRadius: "28px",
            padding: "24px",
            background: `radial-gradient(circle at top right, ${branchAccent}33, transparent 32%), linear-gradient(135deg, rgba(9,15,28,0.96), rgba(17,24,39,0.92))`,
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 50px rgba(0,0,0,0.28)",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={heroBadgeStyle}>{isOwner ? "Owner" : "Empleado"}</span>
                <span style={heroBadgeStyle}>{currentBranchName}</span>
              </div>
              <div>
                <h2 style={{ fontSize: "32px", lineHeight: 1.05, fontWeight: 800, margin: 0, color: "#fff" }}>
                  Configuracion del kiosco
                </h2>
                <p style={{ margin: "10px 0 0", maxWidth: "740px", color: "rgba(255,255,255,0.78)", fontSize: "14px", lineHeight: 1.6 }}>
                  Todo lo importante, en un solo lugar.
                </p>
              </div>
            </div>

            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "22px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {editLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editLogoUrl} alt="Logo actual" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "28px" }}>⚙️</span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Sucursal</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{currentBranchName}</span>
            </div>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Equipo activo</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{loadingEmployees ? "..." : activeEmployees}</span>
            </div>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Sucursales</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{loadingBranches ? "..." : branches.length}</span>
            </div>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Mercado Pago</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{mpStatusLabel}</span>
            </div>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Precios</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{pricingModeLabel}</span>
            </div>
            <div style={heroMetricStyle}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>Alerta venc.</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{expiryAlertDays || "0"} dias</span>
            </div>
          </div>
        </div>

        <section style={groupCardStyle}>
          <div style={{ marginBottom: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 700 }}>
              Sucursal actual
            </span>
            <h2 style={{ margin: 0, fontSize: "26px", fontWeight: 800 }}>Identidad, caja y acceso</h2>
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "14px", lineHeight: 1.6 }}>
              Imagen, tema, cobros y acceso.
            </p>
          </div>

          <div style={sectionGridStyle}>

      {/* Identidad Visual Section */}
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
          {/* Logo & Name */}
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
                  setBranchSettingsError(null);
                  setBranchSettingsMessage(null);
                  setUploadingLogo(true);
                  try {
                    const optimizedFile = await optimizeBrandingImage(file);
                    const formData = new FormData();
                    formData.append("file", optimizedFile);
                    formData.append("folder", "branding");
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) {
                      setBranchSettingsError(data?.error || "No se pudo subir el logo.");
                      return;
                    }
                    if (typeof data?.secure_url !== "string" || !data.secure_url) {
                      setBranchSettingsError("La subida no devolvio una URL valida para el logo.");
                      return;
                    }
                    setEditLogoUrl(data.secure_url);
                    setBranchSettingsMessage("Logo cargado. Guarda nombre y logo para aplicarlo.");
                  } catch (err) {
                    console.error(err);
                    setBranchSettingsError("No se pudo subir el logo.");
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
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                DIRECCION
              </label>
              <input
                className="input"
                value={editBranchAddress}
                onChange={(e) => setEditBranchAddress(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                TELEFONO
              </label>
              <input
                className="input"
                value={editBranchPhone}
                onChange={(e) => setEditBranchPhone(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          {/* Save name + logo button */}
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

      {/* Theme Editor Section */}
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
              onChangeBg={setEditBgColor}
              onChangeAccent={setEditPrimaryColor}
            />
          )}
        </div>
      </section>

      {isOwner && (
        <section style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Ticket
            </h2>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {[
                { label: "Logo", active: ticketShowLogo, onToggle: () => setTicketShowLogo((prev) => !prev) },
                { label: "Direccion", active: ticketShowAddress, onToggle: () => setTicketShowAddress((prev) => !prev) },
                { label: "Telefono", active: ticketShowPhone, onToggle: () => setTicketShowPhone((prev) => !prev) },
                { label: "Pie de ticket", active: ticketShowFooterText, onToggle: () => setTicketShowFooterText((prev) => !prev) },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={`btn ${option.active ? "btn-green" : "btn-ghost"}`}
                  style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                  onClick={option.onToggle}
                  disabled={loadingTicketSettings || savingTicketSettings}
                >
                  <span>{option.label}</span>
                  <span style={{ fontSize: "12px", opacity: 0.9 }}>{option.active ? "ON" : "OFF"}</span>
                </button>
              ))}
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                PIE DEL TICKET
              </label>
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
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                LINK PARA PEDIR
              </label>
              <input
                className="input"
                value={ticketOrderLink}
                onChange={(e) => setTicketOrderLink(e.target.value.slice(0, 300))}
                placeholder="https://..."
                disabled={loadingTicketSettings || savingTicketSettings}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block" }}>
                MODO DE IMPRESION
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                {(["STANDARD", "THERMAL_58", "THERMAL_80"] as TicketPrintMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`btn ${ticketPrintMode === mode ? "btn-green" : "btn-ghost"}`}
                    style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                    onClick={() => setTicketPrintMode(mode)}
                    disabled={loadingTicketSettings || savingTicketSettings}
                  >
                    <span>{getTicketPrintModeLabel(mode)}</span>
                    <span style={{ fontSize: "12px", opacity: 0.9 }}>{ticketPrintMode === mode ? "ACTIVO" : "Usar"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: ticketSettingsError ? "var(--red)" : ticketSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
                {loadingTicketSettings
                  ? "Cargando ticket..."
                  : ticketSettingsError || ticketSettingsMessage || `Si cargas un link, el ticket genera el QR solo. Modo actual: ${getTicketPrintModeLabel(ticketPrintMode)}.`}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ border: "1px solid var(--border)" }}
                  onClick={() => setShowTicketDemo(true)}
                  disabled={loadingTicketSettings}
                >
                  Ver demo
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ border: "1px solid var(--border)" }}
                  onClick={handleSaveTicketSettings}
                  disabled={loadingTicketSettings || savingTicketSettings}
                >
                  {savingTicketSettings ? "Guardando..." : "Guardar ticket"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {isOwner && (
        <section style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Facturacion electronica
            </h2>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              <button
                type="button"
                className={`btn ${fiscalActive ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setFiscalActive((prev) => !prev)}
                disabled={loadingFiscalSettings || savingFiscalSettings}
              >
                <span>Activa</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{fiscalActive ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                className={`btn ${fiscalEnvironment === "TEST" ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setFiscalEnvironment("TEST")}
                disabled={loadingFiscalSettings || savingFiscalSettings}
              >
                <span>Sandbox</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>TEST</span>
              </button>

              <button
                type="button"
                className={`btn ${fiscalEnvironment === "PROD" ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", justifyContent: "space-between" }}
                onClick={() => setFiscalEnvironment("PROD")}
                disabled={loadingFiscalSettings || savingFiscalSettings}
              >
                <span>Produccion</span>
                <span style={{ fontSize: "12px", opacity: 0.9 }}>{fiscalProductionEnabled ? "OK" : "BLOQ."}</span>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  CUIT
                </label>
                <input className="input" value={fiscalCuit} onChange={(e) => setFiscalCuit(e.target.value)} placeholder="Sin guiones" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  PUNTO DE VENTA
                </label>
                <input className="input" value={fiscalPuntoVenta} onChange={(e) => setFiscalPuntoVenta(e.target.value)} placeholder="1" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  RAZON SOCIAL
                </label>
                <input className="input" value={fiscalRazonSocial} onChange={(e) => setFiscalRazonSocial(e.target.value)} placeholder="Como figura en ARCA" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  DOMICILIO FISCAL
                </label>
                <input className="input" value={fiscalDomicilioFiscal} onChange={(e) => setFiscalDomicilioFiscal(e.target.value)} placeholder="Calle y numero" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  ACCESS TOKEN AFIPSDK
                </label>
                <input
                  className="input"
                  type="password"
                  value={fiscalAfipAccessToken}
                  onChange={(e) => {
                    setFiscalAfipAccessToken(e.target.value);
                    if (e.target.value.trim()) {
                      setFiscalClearOwnToken(false);
                    }
                  }}
                  placeholder={fiscalTokenConfigured ? "Pegar uno nuevo para reemplazar el actual" : "Pega el token de tu cuenta AfipSDK"}
                  disabled={loadingFiscalSettings || savingFiscalSettings}
                />
                <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  {fiscalTokenConfigured
                    ? fiscalUsingSharedTestToken
                      ? "Sandbox usando token compartido del sistema."
                      : `Token propio configurado${fiscalTokenLast4 ? ` terminado en ${fiscalTokenLast4}` : ""}.`
                    : "Cada kiosco usa su propia cuenta de AfipSDK. Solo en sandbox interno puede usarse un token compartido de prueba."}
                </div>
                {!fiscalUsingSharedTestToken && fiscalTokenConfigured ? (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm ${fiscalClearOwnToken ? "btn-red" : ""}`}
                    style={{ marginTop: "8px", border: "1px solid var(--border)" }}
                    onClick={() => {
                      setFiscalClearOwnToken((prev) => !prev);
                      setFiscalAfipAccessToken("");
                    }}
                    disabled={loadingFiscalSettings || savingFiscalSettings}
                  >
                    {fiscalClearOwnToken ? "Token propio se quitara al guardar" : "Quitar token propio"}
                  </button>
                ) : null}
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  INICIO DE ACTIVIDAD
                </label>
                <input className="input" value={fiscalInicioActividad} onChange={(e) => setFiscalInicioActividad(e.target.value)} placeholder="DD/MM/AAAA" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  INGRESOS BRUTOS
                </label>
                <input className="input" value={fiscalIngresosBrutos} onChange={(e) => setFiscalIngresosBrutos(e.target.value)} placeholder="Opcional" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  MONTO MINIMO
                </label>
                <input className="input" value={fiscalMinimumAmount} onChange={(e) => setFiscalMinimumAmount(e.target.value)} placeholder="0" disabled={loadingFiscalSettings || savingFiscalSettings} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  CONDICION IVA
                </label>
                <input className="input" value="Monotributo (V1)" disabled />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: fiscalSettingsError ? "var(--red)" : fiscalSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
                {loadingFiscalSettings
                  ? "Cargando facturacion..."
                  : fiscalSettingsError ||
                    fiscalSettingsMessage ||
                    (fiscalEnvironment === "PROD" && !fiscalProductionEnabled
                      ? "Produccion bloqueada en este entorno. Puedes dejarla preparada y habilitarla luego."
                      : fiscalEnvironment === "PROD" && !fiscalTokenConfigured
                        ? "Para produccion, cada kiosco necesita cargar su propio access token de AfipSDK."
                      : "Factura C por ahora. La venta nunca se bloquea si AFIP falla.")}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ border: "1px solid var(--border)" }}
                onClick={handleSaveFiscalSettings}
                disabled={loadingFiscalSettings || savingFiscalSettings}
              >
                {savingFiscalSettings ? "Guardando..." : "Guardar facturacion"}
              </button>
            </div>
          </div>
        </section>
      )}

          </div>
        </section>

        <section style={groupCardStyle}>
          <div style={{ marginBottom: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 700 }}>
              Catalogo y operacion
            </span>
            <h2 style={{ margin: 0, fontSize: "26px", fontWeight: 800 }}>Catalogo y reglas</h2>
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "14px", lineHeight: 1.6 }}>
              Precios, stock y vencimientos.
            </p>
          </div>

          <div style={sectionGridStyle}>

      {isOwner && (
        <section style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              💸 Precios
            </h2>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>Modo de precios</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                El stock no cambia. Solo define si precio y costo son compartidos o por sucursal.
              </div>
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
                <span style={{ fontSize: "12px", color: pricingMode === "SHARED" ? "rgba(255,255,255,0.9)" : "var(--text-3)" }}>
                  Editás una vez y se copia precio/costo al resto.
                </span>
              </button>
              <button
                type="button"
                className={`btn ${pricingMode === "BRANCH" ? "btn-green" : "btn-ghost"}`}
                style={{ border: "1px solid var(--border)", minHeight: "70px", justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start" }}
                onClick={() => setPricingMode("BRANCH")}
                disabled={loadingExpirySettings || savingPricingSettings}
              >
                <span style={{ fontWeight: 700 }}>Separados por sucursal</span>
                <span style={{ fontSize: "12px", color: pricingMode === "BRANCH" ? "rgba(255,255,255,0.9)" : "var(--text-3)" }}>
                  Cada sucursal conserva y edita sus valores propios.
                </span>
              </button>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: pricingMode === "SHARED" ? "rgba(34,197,94,0.08)" : "var(--surface-2)",
                border: `1px solid ${pricingMode === "SHARED" ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
                fontSize: "12px",
                color: "var(--text-2)",
                lineHeight: 1.5,
              }}
            >
              {pricingMode === "SHARED"
                ? "Al guardar, esta sucursal copia precio y costo al resto."
                : "Al separar, cada sucursal conserva sus valores."}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: pricingSettingsError ? "var(--red)" : pricingSettingsMessage ? "var(--green)" : "var(--text-3)" }}>
                {pricingSettingsError || pricingSettingsMessage || "Esto aplica a todo el kiosco, no solo a la sucursal actual."}
              </div>
              <button
                className="btn btn-ghost"
                style={{ border: "1px solid var(--border)" }}
                onClick={handleSavePricingSettings}
                disabled={loadingExpirySettings || savingPricingSettings || pricingMode === savedPricingMode}
              >
                {savingPricingSettings ? "Guardando..." : "Guardar modo de precios"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Expiry Alerts Section */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📅 Vencimientos
          </h2>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>Alerta de vencimiento</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
              Define cuántos dias antes queres ver la alerta.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ minWidth: "120px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Días de alerta
              </label>
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
            {loadingExpirySettings
              ? "Cargando configuración..."
              : expirySettingsError || expirySettingsMessage || "Usa 0 para avisar solo los lotes que vencen hoy, sin anticipación extra."}
          </div>
        </div>
      </section>

      {isOwner && (
        <section style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              📦 Reglas de Stock
            </h2>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>Permitir venta con stock en 0</div>
                <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  Permite vender y dejar faltante en negativo.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllowNegativeStock((prev) => !prev)}
                disabled={loadingCurrentBranch || savingStockRules}
                style={{
                  width: "52px",
                  height: "30px",
                  borderRadius: "99px",
                  border: "none",
                  background: allowNegativeStock ? "var(--green)" : "var(--border)",
                  position: "relative",
                  cursor: loadingCurrentBranch || savingStockRules ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    left: allowNegativeStock ? "25px" : "3px",
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: allowNegativeStock ? "rgba(34,197,94,0.08)" : "var(--surface-2)",
                border: `1px solid ${allowNegativeStock ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
                fontSize: "12px",
                color: "var(--text-2)",
                lineHeight: 1.5,
              }}
            >
              {allowNegativeStock
                ? "Activo: productos sin stock seguirán visibles en caja, con badges de Sin stock o Stock negativo."
                : "Inactivo: la sucursal mantiene el comportamiento actual y no deja vender cuando el stock vendible llega a 0."}
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

      {/* MercadoPago Section */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            💳 MercadoPago
          </h2>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {loadingCurrentBranch ? (
            <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando...</div>
          ) : !currentBranch?.mpUserId ? (
            // ── Estado 1: Sin conectar ───────────────────────────────────────
            <>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Conectar cuenta de MercadoPago</p>
                <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  Autorizá esta sucursal para cobrar con QR de MercadoPago. El dinero va directo
                  a tu cuenta — nosotros nunca lo tocamos.
                </p>
              </div>
              <a href={`/api/mp/auth?branchId=${branchId}`} style={{ textDecoration: "none" }}>
                <button
                  className="btn btn-green"
                  style={{ width: "100%", gap: 8 }}
                >
                  <span style={{ fontSize: 18 }}>📱</span>
                  Conectar mi cuenta de MercadoPago
                </button>
              </a>
            </>
          ) : !currentBranch?.mpPosId ? (
            // ── Estado 2: Tokens OK, POS pendiente ─────────────────────────────
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <p style={{ fontWeight: 600 }}>Cuenta conectada</p>
                  <p style={{ fontSize: "12px", color: "var(--text-3)" }}>ID: {currentBranch.mpUserId}</p>
                </div>
              </div>
                <div
                  style={{
                    background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: "var(--radius-sm, 6px)",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <p style={{ fontSize: "13px", color: "var(--amber)", fontWeight: 600 }}>
                  ⚠️ Falta configurar el punto de venta en MercadoPago
                </p>
                {mpSetupError && (
                  <p style={{ fontSize: "12px", color: "var(--red)" }}>{mpSetupError}</p>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "13px", borderColor: "var(--amber)", color: "var(--amber)" }}
                  onClick={handleMpSetupPos}
                  disabled={mpSetupLoading}
                >
                  {mpSetupLoading ? "Configurando..." : "🔄 Configurar ahora"}
                </button>
              </div>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "12px", color: "var(--text-3)" }}
                onClick={handleMpDisconnect}
              >
                Desconectar cuenta
              </button>
            </>
          ) : (
            // ── Estado 3: Todo listo ──────────────────────────────────────────
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(34,197,94,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  ✅
                </div>
                <div>
                  <p style={{ fontWeight: 700 }}>Listo para cobrar con QR</p>
                  <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: 2 }}>
                    Cuenta #{currentBranch.mpUserId} · Caja configurada
                  </p>
                </div>
              </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "12px", color: "var(--text-3)", alignSelf: "flex-start" }}
                onClick={handleMpDisconnect}
              >
                Desconectar cuenta
              </button>
            </>
          )}
        </div>
      </section>

      {/* Sucursales Section */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🏪 Mis Sucursales
          </h2>
          <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} onClick={() => setBranchModal(true)}>
            + Nueva
          </button>
        </div>

        {loadingBranches ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-3)" }}>Cargando...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
            {branches.map((branch) => (
              <a
                key={branch.id}
                href={`/${branch.id}/caja`}
                className="card"
                style={{
                  padding: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--surface)",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    background: branch.primaryColor || "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    flexShrink: 0,
                  }}
                >
                  🏪
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>{branch.name}</div>
                  <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                    Ir a la caja ›
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Categorías Section */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🏷️ Categorías
          </h2>
          <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} onClick={() => setCategoryModal("new")}>
            + Nueva
          </button>
        </div>

        {loadingCategories ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-3)" }}>Cargando...</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryModal(cat)}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${cat.color || "var(--border)"}`,
                  color: "var(--text)",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color || "gray" }} />
                {cat.name}
              </button>
            ))}
            {categories.length === 0 && (
              <div style={{ width: "100%", textAlign: "center", padding: "16px", color: "var(--text-3)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px dashed var(--border)" }}>
                No hay categorías. Creá una para organizar el catálogo de tu kiosco.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Branch Access Key Section (Phase 7) */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🔑 Acceso de Dispositivos (Solo Empleados)
          </h2>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: "1.5" }}>
            Usá este código para autorizar teléfonos o PCs de empleados sin compartir tu contraseña de dueño.
            También podés compartir el enlace directo para abrir el selector de empleados al instante.
          </p>
          
          <div style={{ 
            background: "var(--surface-2)", 
            padding: "12px", 
            borderRadius: "8px", 
            border: "1px solid var(--border)",
            fontSize: "18px",
            fontWeight: 800,
            textAlign: "center",
            letterSpacing: "0.1em",
            color: currentBranch?.accessKey ? "var(--primary)" : "var(--text-3)",
            fontFamily: "monospace"
          }}>
            {currentBranch?.accessKey || "SIN CÓDIGO GENERADO"}
          </div>

          {currentBranch?.accessKey && (
            <>
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
                }}
              >
                {accessEntryUrl || `/${currentBranch.accessKey}`}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ border: "1px solid var(--border)" }}
                  onClick={() => void copyAccessValue(currentBranch.accessKey!, "Codigo copiado.")}
                >
                  Copiar codigo
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ border: "1px solid var(--border)" }}
                  onClick={() => void copyAccessValue(accessEntryUrl, "Enlace copiado.")}
                  disabled={!accessEntryUrl}
                >
                  Copiar enlace
                </button>
                {accessEntryUrl && (
                  <a
                    href={accessEntryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", textDecoration: "none" }}
                  >
                    Abrir enlace
                  </a>
                )}
              </div>
            </>
          )}

          <button 
            className="btn btn-sm btn-ghost" 
            style={{ alignSelf: "center", border: "1px solid var(--border)" }}
            onClick={async () => {
              if (confirm("¿Generar un nuevo código? Los dispositivos viejos perderán el acceso.")) {
                const res = await fetch(`/api/branches/${branchId}/access-key`, {
                  method: "POST",
                  headers: {
                    "x-branch-id": branchId,
                  },
                });
                if (res.ok) {
                  const data = await res.json();
                  setCurrentBranch((prev) => (
                    prev ? { ...prev, accessKey: data.accessKey ?? null } : prev
                  ));
                  setBranches((prev) => prev.map((branch) => (
                    branch.id === branchId
                      ? { ...branch, accessKey: data.accessKey ?? null }
                      : branch
                  )));
                } else {
                  const data = await res.json().catch(() => null);
                  alert(data?.error || "No se pudo generar el cÃ³digo.");
                }
              }
            }}
          >
            {currentBranch?.accessKey ? "🔄 Generar nuevo código" : "✨ Generar primer código"}
          </button>
        </div>
      </section>

          </div>
        </section>

        <section style={groupCardStyle}>
          <div style={{ marginBottom: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 700 }}>
              Cuenta y equipo
            </span>
            <h2 style={{ margin: 0, fontSize: "26px", fontWeight: 800 }}>Cuenta y equipo</h2>
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "14px", lineHeight: 1.6 }}>
              Suscripcion, accesos y empleados.
            </p>
          </div>

          <div style={sectionGridStyle}>

      {/* Subscription Section */}
      <section style={{ marginBottom: 0 }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            💎 Mi Suscripción
          </h2>
        </div>
        {loadingSubscription ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-3)" }}>Cargando estado...</div>
        ) : (
          <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "15px" }}>Suscripción Mensual a Clikit</div>
                <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "2px" }}>
                  Estado: {' '}
                  {subscription?.status === "ACTIVE" && <span style={{ color: "var(--green)", fontWeight: 600 }}>Activa ✔️</span>}
                  {subscription?.status === "PENDING" && <span style={{ color: "var(--amber)", fontWeight: 600 }}>Pendiente / Procesando ⏳</span>}
                  {subscription?.status === "CANCELLED" && <span style={{ color: "var(--red)", fontWeight: 600 }}>Cancelada ❌</span>}
                  {(!subscription || subscription.status === "NOT_CONFIGURED") && <span style={{ color: "var(--text-3)" }}>No configurada</span>}
                </div>
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800 }}>{formatSubscriptionPrice(subscription?.amountArs ?? SUBSCRIPTION_PRICE_ARS)}<span style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 500 }}> por mes</span></div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
              {getSubscriptionPromoLabel(subscription?.amountArs ?? SUBSCRIPTION_PRICE_ARS)} {SUBSCRIPTION_CANCEL_LABEL}
            </div>
            
            {subscription?.managementUrl && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                <a 
                  href={subscription.managementUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-ghost" 
                  style={{ width: "100%", textDecoration: "none", textAlign: "center" }}
                >
                  💳 Gestionar en MercadoPago
                </a>
              </div>
            )}
            
            {subscription?.status !== "ACTIVE" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                <button 
                  onClick={handleCreateSubscription} 
                  disabled={creatingSubscription}
                  className="btn btn-sm btn-green" 
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {creatingSubscription ? "Generando link..." : (subscription && subscription.status !== "NOT_CONFIGURED" ? "Generar nuevo link de pago" : "Suscribirse ahora")}
                </button>
                {subscriptionError && (
                  <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px", textAlign: "center", marginBottom: 0 }}>
                    {subscriptionError}
                  </p>
                )}
              </div>
            )}
            
            {subscription?.status === "ACTIVE" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                <button 
                  onClick={() => setCancelModalOpen(true)} 
                  className="btn btn-sm btn-ghost" 
                  style={{ width: "100%", justifyContent: "center", color: "var(--red)", border: "1px solid rgba(239, 68, 68, 0.4)" }}
                >
                  Cancelar suscripción
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Empleados Section */}
      <section style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            👤 Empleados
          </h2>
          <button className="btn btn-sm btn-green" onClick={() => setEmployeeModal("new")}>
            + Nuevo
          </button>
        </div>

        {loadingEmployees ? (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>Cargando...</div>
        ) : employees.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              border: "1px dashed var(--border)",
              color: "var(--text-3)",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>👤</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Sin empleados</div>
            <div style={{ fontSize: "14px" }}>Agregá empleados para asignarles turnos</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {employees.map((emp) => (
              <button
                key={emp.id}
                className="card"
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  opacity: emp.active ? 1 : 0.5,
                  border: "none",
                  background: "var(--surface)",
                }}
                onClick={() => setEmployeeModal(emp)}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    color: "black",
                    flexShrink: 0,
                  }}
                >
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                    {emp.name}
                    {!emp.active && (
                      <span style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--red)", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        SUSPENDIDO
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: "10px", background: "rgba(34,197,94,0.1)", padding: "1px 4px", borderRadius: "4px" }}>
                        {emp.role === "MANAGER" ? "ENCARGADO" : "CAJERO"}
                      </span>
                      {emp.hasPin ? "PIN configurado" : "Sin PIN"}
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      📍 {emp.branches.map(b => b.name).join(", ")}
                    </div>
                  </div>
                </div>
                <span style={{ color: "var(--text-3)", fontSize: "18px" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

          </div>
        </section>
      </div>

      {/* Modals */}
      {cancelModalOpen && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999, padding: "16px" }} onClick={() => !cancelingSubscription && setCancelModalOpen(false)}>
            <div className="modal animate-slide-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "24px", padding: "24px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px" }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "var(--text)" }}>¿Cancelar suscripción?</h2>
              <p style={{ color: "var(--text-2)", lineHeight: 1.6, margin: 0, fontSize: "14px" }}>
                Perderás el acceso a las funciones principales del sistema cuando termine tu período de facturación actual. ¿Estás seguro que querés cancelarla?
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ flex: 1, border: "1px solid var(--border)", color: "var(--text)" }} 
                  onClick={() => setCancelModalOpen(false)}
                  disabled={cancelingSubscription}
                >
                  Volver
                </button>
                <button 
                  className="btn" 
                  style={{ flex: 1, backgroundColor: "var(--red)", color: "white", padding: "10px", border: "none" }} 
                  onClick={handleCancelSubscription}
                  disabled={cancelingSubscription}
                >
                  {cancelingSubscription ? "Cancelando..." : "Confirmar cancelación"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {employeeModal && (
        <ModalPortal>
          <EmployeeModal
            branchId={branchId}
            allBranches={branches}
            employee={employeeModal === "new" ? null : employeeModal}
            onClose={handleEmployeeModalClose}
            onSave={handleEmployeeModalSave}
          />
        </ModalPortal>
      )}

      {branchModal && (
        <ModalPortal>
          <BranchModal
            branchId={branchId}
            pricingMode={pricingMode}
            onClose={handleBranchModalClose}
            onSave={handleBranchModalSave}
          />
        </ModalPortal>
      )}

      {categoryModal && (
        <ModalPortal>
          <CategoryModal
            category={categoryModal}
            onClose={handleCategoryModalClose}
            onSave={handleCategoryModalSave}
          />
        </ModalPortal>
      )}

      {showTicketDemo && (
        <TicketModal
          branchId={branchId}
          initialTicket={ticketDemoData}
          onClose={() => setShowTicketDemo(false)}
        />
      )}
    </div>
  );
}
