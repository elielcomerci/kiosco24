"use client";

import { useEffect, useState } from "react";
import BackButton from "@/components/ui/BackButton";

interface Employee {
  id: string;
  name: string;
  pin: string | null;
  active: boolean;
}

interface Branch {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
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
                  background: active ? "var(--green)" : "var(--border)",
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

// ─── Main Config Page ─────────────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [employeeModal, setEmployeeModal] = useState<"new" | Employee | null>(null);
  const [branchModal, setBranchModal] = useState(false);

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

  useEffect(() => {
    fetchEmployees();
    fetchBranches();
  }, []);

  const handleEmployeeModalClose = () => setEmployeeModal(null);
  const handleEmployeeModalSave = () => { setEmployeeModal(null); fetchEmployees(); };

  const handleBranchModalClose = () => setBranchModal(false);
  const handleBranchModalSave = () => { setBranchModal(false); fetchBranches(); };

  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh", paddingBottom: "100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <BackButton />
        <h1 style={{ fontSize: "20px", fontWeight: 800 }}>Configuración</h1>
        <div style={{ width: "60px" }} />{/* spacer to center title */}
      </div>

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
    </div>
  );
}
