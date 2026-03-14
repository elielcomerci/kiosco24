"use client";

import { useEffect, useState } from "react";
import NumPad from "@/components/ui/NumPad";

interface Employee {
  id: string;
  name: string;
}

interface OpenShiftModalProps {
  onConfirm: (amount: number, employeeName: string) => void;
}

export default function OpenShiftModal({ onConfirm }: OpenShiftModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((data) => {
        // Only active employees
        const active = Array.isArray(data) ? data.filter((e: any) => e.active) : [];
        setEmployees(active);
        // Pre-select first employee if available
        if (active.length > 0) setSelectedEmployee(active[0].id);
        else setSelectedEmployee("owner");
      })
      .catch(() => setSelectedEmployee("owner"));
  }, []);

  const resolvedName =
    selectedEmployee === "owner"
      ? "Dueño"
      : selectedEmployee === "custom"
      ? customName.trim() || "Sin nombre"
      : employees.find((e) => e.id === selectedEmployee)?.name || "Dueño";

  const handleConfirm = async () => {
    if (!amount) return;
    setLoading(true);
    await onConfirm(parseFloat(amount), resolvedName);
    setLoading(false);
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal animate-slide-up">
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Abrir Turno</h2>
          <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
            Ingresá el dinero con el que abrís la caja y quién atiende.
          </p>
        </div>

        {/* Employee Selector */}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
            ¿Quién atiende?
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {/* Always show Dueño */}
            <button
              className={`btn btn-sm ${selectedEmployee === "owner" ? "btn-green" : "btn-ghost"}`}
              onClick={() => setSelectedEmployee("owner")}
            >
              🏠 Dueño
            </button>
            {/* Active employees */}
            {employees.map((emp) => (
              <button
                key={emp.id}
                className={`btn btn-sm ${selectedEmployee === emp.id ? "btn-green" : "btn-ghost"}`}
                onClick={() => setSelectedEmployee(emp.id)}
              >
                {emp.name}
              </button>
            ))}
            {/* Custom option */}
            <button
              className={`btn btn-sm ${selectedEmployee === "custom" ? "btn-green" : "btn-ghost"}`}
              onClick={() => setSelectedEmployee("custom")}
            >
              ✏️ Otro
            </button>
          </div>

          {selectedEmployee === "custom" && (
            <input
              className="input"
              placeholder="Nombre"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={{ marginTop: "8px", textAlign: "center" }}
              autoFocus
            />
          )}
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius)",
            padding: "16px",
            textAlign: "center",
            fontSize: "32px",
            fontWeight: 800,
            color: amount ? "var(--text)" : "var(--text-3)",
            minHeight: "56px",
          }}
        >
          {amount ? `$ ${amount}` : "Monto inicial"}
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <button
          className="btn btn-green"
          style={{ marginTop: "10px" }}
          onClick={handleConfirm}
          disabled={!amount || loading || (selectedEmployee === "custom" && !customName.trim())}
        >
          {loading ? "Abriendo..." : "Abrir Caja"}
        </button>
      </div>
    </div>
  );
}
