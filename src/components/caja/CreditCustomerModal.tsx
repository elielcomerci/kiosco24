"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ModalPortal from "@/components/ui/ModalPortal";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

interface CreditCustomerModalProps {
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}

export default function CreditCustomerModal({ onClose, onSelect }: CreditCustomerModalProps) {
  const params = useParams();
  const branchId = params.branchId as string;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const searchLower = search.toLowerCase();

  useEffect(() => {
    fetch("/api/fiados/customers", {
      headers: { "x-branch-id": branchId }
    })
      .then((r) => r.json())
      .then((data) => setCustomers(data))
      .finally(() => setLoading(false));
  }, [branchId]);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(searchLower) ||
    c.phone?.toLowerCase().includes(searchLower) ||
    false
  );

  const handleAddNew = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/fiados/customers", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-branch-id": branchId
      },
      body: JSON.stringify({
        name: newName.trim(),
        phone: newPhone.trim() || null,
      }),
    });
    const customer = await res.json();
    onSelect(customer);
  };

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>📋 ¿A quién le fiaste?</h2>

        <input
          className="input"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div style={{ overflowY: "auto", maxHeight: "300px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {loading && <p style={{ color: "var(--text-3)", textAlign: "center" }}>Cargando...</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: "var(--text-3)", textAlign: "center", padding: "20px 0" }}>
              No encontrado
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              className="btn btn-ghost"
              style={{ justifyContent: "space-between", alignItems: "center" }}
              onClick={() => onSelect(c)}
            >
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span>{c.name}</span>
                {c.phone && (
                  <span style={{ color: "var(--text-3)", fontSize: "12px" }}>{c.phone}</span>
                )}
              </span>
              {c.balance > 0 ? (
                <span style={{ color: "var(--amber)", fontSize: "13px" }}>
                  Debe ${c.balance.toLocaleString("es-AR")}
                </span>
              ) : (
                <span style={{ color: "var(--text-3)", fontSize: "13px" }}>Sin deuda</span>
              )}
            </button>
          ))}
        </div>

        {/* Add new */}
        {!addingNew ? (
          <button
            className="btn btn-ghost btn-full"
            onClick={() => setAddingNew(true)}
            style={{ borderStyle: "dashed" }}
          >
            + Nuevo cliente
          </button>
        ) : (
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
              <input
                className="input"
                placeholder="Nombre del cliente"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAddNew()}
              />
              <input
                className="input"
                placeholder="Teléfono opcional"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNew()}
              />
            </div>
            <button
              className="btn btn-green"
              onClick={handleAddNew}
              disabled={!newName.trim()}
              style={{ alignSelf: "stretch" }}
            >
              ✓
            </button>
          </div>
        )}

        <button className="btn btn-ghost btn-full" onClick={onClose}>
          Cancelar
        </button>
        </div>
      </div>
    </ModalPortal>
  );
}
