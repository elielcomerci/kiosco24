"use client";

import { useEffect, useState } from "react";

interface Employee {
  id: string;
  name: string;
  pin: string | null;
  active: boolean;
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
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>
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

// ─── Main Config Page ─────────────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | Employee | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    const res = await fetch("/api/empleados");
    const data = await res.json();
    setEmployees(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleModalClose = () => setModal(null);
  const handleModalSave = () => { setModal(null); fetchEmployees(); };

  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Configuración</h1>
      </div>

      {/* Empleados Section */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            👤 Empleados
          </h2>
          <button className="btn btn-sm btn-green" onClick={() => setModal("new")}>
            + Nuevo
          </button>
        </div>

        {loading ? (
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
                onClick={() => setModal(emp)}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    color: "white",
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

      {/* Modal */}
      {modal && (
        <EmployeeModal
          employee={modal === "new" ? null : modal}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
