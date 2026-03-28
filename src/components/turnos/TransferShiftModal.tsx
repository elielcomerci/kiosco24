"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import ModalPortal from "@/components/ui/ModalPortal";
import PinModal from "@/components/ui/PinModal";
import type { ShiftAssignee } from "@/components/turnos/OpenShiftModal";

interface Employee {
  id: string;
  name: string;
  hasPin: boolean;
}

type EmployeeApiResponse = {
  id?: string;
  name?: string;
  hasPin?: boolean;
};

interface TransferShiftModalProps {
  currentResponsibleName: string;
  onConfirm: (assignee: ShiftAssignee) => void | Promise<void>;
  onCancel: () => void;
}

function normalizeEmployees(data: unknown): Employee[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((entry: EmployeeApiResponse) => ({
      id: entry.id,
      name: entry.name,
      hasPin: Boolean(entry.hasPin),
    }))
    .filter((employee): employee is Employee => Boolean(employee.id && employee.name));
}

export default function TransferShiftModal({
  currentResponsibleName,
  onConfirm,
  onCancel,
}: TransferShiftModalProps) {
  const { branchId } = useParams() as { branchId: string };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("owner");
  const [loading, setLoading] = useState(false);
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
        const active = normalizeEmployees(data);
        setEmployees(active);
        if (active.length > 0) {
          setSelectedEmployee(active[0].id);
        } else {
          setSelectedEmployee("owner");
        }
      })
      .catch(() => setSelectedEmployee("owner"));
  }, [branchId]);

  const selectedEmp = employees.find((employee) => employee.id === selectedEmployee);
  const assignee: ShiftAssignee = selectedEmp
    ? { employeeId: selectedEmp.id, employeeName: selectedEmp.name }
    : { employeeId: null, employeeName: "Dueño" };

  const proceed = async () => {
    setLoading(true);
    await onConfirm(assignee);
    setLoading(false);
  };

  const handleConfirmClick = () => {
    if (selectedEmp?.hasPin) {
      setPinError(null);
      setShowPinModal(true);
      return;
    }

    void proceed();
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
      void proceed();
    } else {
      setPinError("PIN incorrecto. Intenta de nuevo.");
    }
  };

  return (
    <>
      <ModalPortal>
        <div className="modal-overlay animate-fade-in" onClick={onCancel}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Transferir turno</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
              La caja esta a nombre de {currentResponsibleName}. Elegi quien se hace cargo ahora.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              className={`btn btn-sm ${selectedEmployee === "owner" ? "btn-green" : "btn-ghost"}`}
              onClick={() => setSelectedEmployee("owner")}
            >
              Dueño
            </button>
            {employees.map((employee) => (
              <button
                key={employee.id}
                className={`btn btn-sm ${selectedEmployee === employee.id ? "btn-green" : "btn-ghost"}`}
                onClick={() => setSelectedEmployee(employee.id)}
              >
                {employee.name}
                {employee.hasPin && (
                  <span style={{ marginLeft: "4px", fontSize: "11px", opacity: 0.7 }}>PIN</span>
                )}
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            El proximo responsable sera <strong>{assignee.employeeName}</strong>.
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleConfirmClick} disabled={loading}>
              {loading ? "Transfiriendo..." : selectedEmp?.hasPin ? "Transferir con PIN" : "Transferir"}
            </button>
          </div>
          </div>
        </div>
      </ModalPortal>

      {showPinModal && (
        <PinModal
          title={`PIN de ${assignee.employeeName}`}
          subtitle="Ingresa el PIN para recibir el turno"
          onConfirm={handlePinConfirm}
          onCancel={() => setShowPinModal(false)}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </>
  );
}
