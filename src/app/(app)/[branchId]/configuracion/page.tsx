"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import ThemeEditor from "@/components/ui/ThemeEditor";

interface Employee {
  id: string;
  name: string;
  pin: string | null;
  active: boolean;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
  showInGrid?: boolean;
}

interface Branch {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
  mpUserId: string | null;
  mpStoreId: string | null;
  mpPosId: string | null;
}

// ─── Employee Form Modal ───────────────────────────────────────────────────────
function EmployeeModal({
  employee,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !employee;
  const [name, setName] = useState(employee?.name || "");
  const [pin, setPin] = useState(employee?.pin || "");
  const [active, setActive] = useState(employee?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    if (isNew) {
      await fetch("/api/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin: pin || null }),
      });
    } else {
      await fetch(`/api/empleados/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin: pin || null, active }),
      });
    }
    setLoading(false);
    onSave();
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    await fetch(`/api/empleados/${employee!.id}`, { method: "DELETE" });
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
              placeholder="Ej: 1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: "20px" }}
            />
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
              <span style={{ fontWeight: 600 }}>Activo</span>
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
  onClose,
  onSave,
}: {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
          Tu catálogo actual se va a copiar a la nueva sucursal con el <strong style={{color: "var(--text)"}}>stock y precio en 0</strong> para que puedas configurarlo localmente.
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCurrentBranch, setLoadingCurrentBranch] = useState(true);

  const [employeeModal, setEmployeeModal] = useState<"new" | Employee | null>(null);
  const [branchModal, setBranchModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState<"new" | Category | null>(null);

  const [editBranchName, setEditBranchName] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editPrimaryColor, setEditPrimaryColor] = useState("#22c55e");
  const [editBgColor, setEditBgColor] = useState("#0f172a");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);

  // MercadoPago
  const [mpSetupLoading, setMpSetupLoading] = useState(false);
  const [mpSetupError, setMpSetupError] = useState<string | null>(null);

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

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    const res = await fetch("/api/empleados");
    if(res.ok) {
      const data = await res.json();
      setEmployees(data);
    }
    setLoadingEmployees(false);
  };

  const fetchBranches = async () => {
    setLoadingBranches(true);
    const res = await fetch("/api/branches");
    if(res.ok) {
      const data = await res.json();
      setBranches(data.branches || []);
    }
    setLoadingBranches(false);
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    const res = await fetch("/api/categorias");
    if(res.ok) {
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    }
    setLoadingCategories(false);
  };

  const fetchCurrentBranch = async () => {
    setLoadingCurrentBranch(true);
    const res = await fetch(`/api/branches`); // Reuse GET all or specific if needed
    if (res.ok) {
      const data = await res.json();
      const b = (data.branches as Branch[]).find(v => v.id === branchId);
      if (b) {
        setCurrentBranch(b);
        setEditBranchName(b.name);
        setEditLogoUrl(b.logoUrl || "");
        setEditPrimaryColor(b.primaryColor || "#22c55e");
        setEditBgColor(b.bgColor || "#0f172a");
      }
    }
    setLoadingCurrentBranch(false);
  };

  useEffect(() => {
    fetchEmployees();
    fetchBranches();
    fetchCategories();
    fetchCurrentBranch();
  }, [branchId]);

  const handleSaveBranchSettings = async () => {
    setSavingBranch(true);
    await fetch(`/api/branches/${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editBranchName,
        logoUrl: editLogoUrl || null,
        primaryColor: editPrimaryColor,
        bgColor: editBgColor,
      }),
    });
    setSavingBranch(false);
    window.location.reload();
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


  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh", paddingBottom: "100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <BackButton />
        <h1 style={{ fontSize: "20px", fontWeight: 800 }}>Configuración</h1>
        <div style={{ width: "60px" }} />{/* spacer to center title */}
      </div>

      {/* Identidad Visual Section */}
      <section style={{ marginBottom: "32px" }}>
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
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.secure_url) setEditLogoUrl(data.secure_url);
                  } catch (err) { console.error(err); }
                  setUploadingLogo(false);
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

          {/* Save name + logo button */}
          <button 
            className="btn btn-ghost btn-sm" 
            style={{ alignSelf: "flex-start" }}
            onClick={handleSaveBranchSettings}
            disabled={savingBranch || !editBranchName.trim()}
          >
            {savingBranch ? "Guardando..." : "Guardar nombre"}
          </button>
        </div>
      </section>

      {/* Theme Editor Section */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🎨 Tema
          </h2>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
          <ThemeEditor
            branchId={branchId}
            initialBg={editBgColor}
            initialAccent={editPrimaryColor}
            onSaved={() => window.location.reload()}
          />
        </div>
      </section>

      {/* MercadoPago Section */}
      <section style={{ marginBottom: "32px" }}>
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
              <a href="/api/mp/auth" style={{ textDecoration: "none" }}>
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
      <section style={{ marginBottom: "32px" }}>
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
      <section style={{ marginBottom: "32px" }}>
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

      {/* Security Section */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🔐 Seguridad y PINs
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
            gap: "10px",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>PIN por Empleado</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: "1.5" }}>
              En la sección <strong style={{ color: "var(--text)" }}>Empleados</strong> podés asignarle un PIN (de hasta 6 dígitos) a cada empleado. Al iniciar turno, si el empleado tiene PIN configurado, la app lo va a pedir antes de abrir la caja → <span style={{ fontSize: "14px" }}>🔐</span>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>PIN del Dueño 🏠</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: "1.5" }}>
              Para proteger operaciones como Gastos y Retiros, creá un empleado con nombre <strong style={{ color: "var(--text)" }}>"Dueño"</strong> en la lista de abajo y ponele un PIN. Ese PIN se va a pedir cuando querés hacer cambios sensibles estando en modo empleado.
            </div>
          </div>
        </div>
      </section>

      {/* Empleados Section */}
      <section>
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
                  <div style={{ fontWeight: 600 }}>{emp.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    {emp.pin ? "PIN configurado" : "Sin PIN"}
                    {" · "}
                    <span style={{ color: emp.active ? "var(--green)" : "var(--text-3)" }}>
                      {emp.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
                <span style={{ color: "var(--text-3)", fontSize: "18px" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {employeeModal && (
        <EmployeeModal
          employee={employeeModal === "new" ? null : employeeModal}
          onClose={handleEmployeeModalClose}
          onSave={handleEmployeeModalSave}
        />
      )}

      {branchModal && (
        <BranchModal
          onClose={handleBranchModalClose}
          onSave={handleBranchModalSave}
        />
      )}

      {categoryModal && (
        <CategoryModal
          category={categoryModal}
          onClose={handleCategoryModalClose}
          onSave={handleCategoryModalSave}
        />
      )}
    </div>
  );
}
