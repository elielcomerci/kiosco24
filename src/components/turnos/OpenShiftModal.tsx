"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";

import NumPad from "@/components/ui/NumPad";
import PinModal from "@/components/ui/PinModal";

interface Employee {
  id: string;
  name: string;
  hasPin: boolean;
}

export interface ShiftAssignee {
  employeeId: string | null;
  employeeName: string;
}

interface OpenShiftModalProps {
  onConfirm: (payload: { openingAmount: number; assignee: ShiftAssignee }) => void | Promise<void>;
}

export default function OpenShiftModal({ onConfirm }: OpenShiftModalProps) {
  const { branchId } = useParams() as { branchId: string };
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const sessionEmployeeId = (session?.user as any)?.employeeId as string | undefined;
  const sessionName = (session?.user as any)?.name as string | undefined;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("owner");
  const [amount, setAmount] = useState("");
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
        const active = Array.isArray(data)
          ? data.map((e: any) => ({
              id: e.id,
              name: e.name,
              hasPin: Boolean(e.hasPin),
            }))
          : [];
        setEmployees(active);

        if (userRole === "EMPLOYEE" && sessionEmployeeId) {
          setSelectedEmployee(sessionEmployeeId);
        } else if (active.length > 0) {
          setSelectedEmployee(active[0].id);
        } else {
          setSelectedEmployee("owner");
        }
      })
      .catch(() => {
        if (userRole === "EMPLOYEE" && sessionEmployeeId) {
          setSelectedEmployee(sessionEmployeeId);
        } else {
          setSelectedEmployee("owner");
        }
      });
  }, [branchId, userRole, sessionEmployeeId]);

  const selectedEmp = employees.find((e) => e.id === selectedEmployee);
  const resolvedAssignee: ShiftAssignee =
    userRole === "EMPLOYEE"
      ? {
          employeeId: sessionEmployeeId ?? null,
          employeeName: sessionName || selectedEmp?.name || "Empleado",
        }
      : selectedEmp
        ? { employeeId: selectedEmp.id, employeeName: selectedEmp.name }
        : { employeeId: null, employeeName: "Dueño" };

  const proceed = async () => {
    setLoading(true);
    await onConfirm({
      openingAmount: parseFloat(amount),
      assignee: resolvedAssignee,
    });
    setLoading(false);
  };

  const handleConfirmClick = async () => {
    if (!amount) return;

    if (selectedEmp?.hasPin && resolvedAssignee.employeeId) {
      setPinError(null);
      setShowPinModal(true);
      return;
    }

    proceed();
  };

  const handlePinConfirm = async (pin: string) => {
    if (!resolvedAssignee.employeeId) return;

    setPinLoading(true);
    setPinError(null);

    const res = await fetch("/api/empleados/verificar-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-branch-id": branchId,
      },
      body: JSON.stringify({ employeeId: resolvedAssignee.employeeId, pin }),
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
              Ingresá el dinero con el que abrís la caja y quién queda a cargo.
            </p>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: "6px",
              }}
            >
              Responsable del turno
            </label>

            {userRole === "EMPLOYEE" ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {resolvedAssignee.employeeName}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  className={`btn btn-sm ${selectedEmployee === "owner" ? "btn-green" : "btn-ghost"}`}
                  onClick={() => setSelectedEmployee("owner")}
                >
                  Dueño
                </button>
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
              </div>
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

          <button className="btn btn-green" style={{ marginTop: "10px" }} onClick={handleConfirmClick} disabled={!amount || loading}>
            {loading ? "Abriendo..." : selectedEmp?.hasPin ? "Abrir Caja 🔐" : "Abrir Caja"}
          </button>
        </div>
      </div>

      {showPinModal && (
        <PinModal
          title={`PIN de ${resolvedAssignee.employeeName}`}
          subtitle="Ingresá el PIN para confirmar"
          onConfirm={handlePinConfirm}
          onCancel={() => setShowPinModal(false)}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </>
  );
}
