"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NumPad from "@/components/ui/NumPad";
import PinModal from "@/components/ui/PinModal";

interface Employee {
  id: string;
  name: string;
  hasPin: boolean; // We only expose whether they HAVE a pin, not the pin itself
}

interface OpenShiftModalProps {
  onConfirm: (amount: number, employeeName: string) => void;
}

export default function OpenShiftModal({ onConfirm }: OpenShiftModalProps) {
  const { branchId } = useParams() as { branchId: string };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // PIN verification flow
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    fetch("/api/empleados?activeOnly=true", {
      headers: {
        "x-branch-id": branchId,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        // Only active employees, add hasPin flag
        const active = Array.isArray(data)
          ? data.map((e: any) => ({
              id: e.id,
              name: e.name,
              hasPin: Boolean(e.hasPin),
            }))
          : [];
        setEmployees(active);
        if (active.length > 0) setSelectedEmployee(active[0].id);
        else setSelectedEmployee("owner");
      })
      .catch(() => setSelectedEmployee("owner"));
  }, [branchId]);

  const resolvedName =
    selectedEmployee === "owner"
      ? "Dueño"
      : selectedEmployee === "custom"
      ? customName.trim() || "Sin nombre"
      : employees.find((e) => e.id === selectedEmployee)?.name || "Dueño";

  const selectedEmp = employees.find((e) => e.id === selectedEmployee);

  const handleConfirmClick = async () => {
    if (!amount) return;
    // If selected employee has PIN, show PIN modal first
    if (selectedEmp?.hasPin) {
      setPinError(null);
      setShowPinModal(true);
      return;
    }
    // No PIN needed — proceed
    proceed();
  };

  const proceed = async () => {
    setLoading(true);
    await onConfirm(parseFloat(amount), resolvedName);
    setLoading(false);
  };

  const handlePinConfirm = async (pin: string) => {
    if (!selectedEmp) return;
    setPinLoading(true);
    setPinError(null);

    const res = await fetch("/api/empleados/verificar-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-branch-id": branchId,
      },
      body: JSON.stringify({ employeeId: selectedEmp.id, pin }),
    });
    const data = await res.json();
    setPinLoading(false);

    if (data.ok) {
      setShowPinModal(false);
      proceed();
    } else {
      setPinError("PIN incorrecto. Intentá de nuevo.");
    }
  };

  return (
    <>
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
                  {emp.hasPin && <span style={{ marginLeft: "4px", fontSize: "11px", opacity: 0.7 }}>🔐</span>}
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
            onClick={handleConfirmClick}
            disabled={!amount || loading || (selectedEmployee === "custom" && !customName.trim())}
          >
            {loading ? "Abriendo..." : selectedEmp?.hasPin ? "Abrir Caja 🔐" : "Abrir Caja"}
          </button>
        </div>
      </div>

      {/* PIN verification overlay */}
      {showPinModal && (
        <PinModal
          title={`PIN de ${resolvedName}`}
          subtitle="Ingresá tu PIN para confirmar"
          onConfirm={handlePinConfirm}
          onCancel={() => setShowPinModal(false)}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </>
  );
}
