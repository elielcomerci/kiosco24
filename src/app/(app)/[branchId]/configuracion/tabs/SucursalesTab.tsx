/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import type { Branch } from "../types";

interface SucursalesTabProps {
  branchId: string;
  isOwner: boolean;
  branches: Branch[];
  loadingBranches: boolean;
  branchModal: boolean;
  pricingMode: "SHARED" | "BRANCH";
  // Handlers
  setBranchModal: (v: boolean) => void;
  handleBranchModalClose: () => void;
  handleBranchModalSave: () => Promise<void>;
}

export default function SucursalesTab({
  branchId,
  isOwner,
  branches,
  loadingBranches,
  branchModal,
  pricingMode,
  setBranchModal,
  handleBranchModalClose,
  handleBranchModalSave,
}: SucursalesTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Sucursales */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)" }}>
            🏬 Mis Sucursales
          </h3>
          {isOwner && (
            <button className="btn btn-sm btn-green" onClick={() => setBranchModal(true)}>
              + Nueva
            </button>
          )}
        </div>

        {loadingBranches ? (
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando...</div>
        ) : branches.length === 0 ? (
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🏬</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Sin sucursales</div>
            <div style={{ fontSize: "14px" }}>Creá una sucursal para empezar</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {branches.map((branch) => (
              <div
                key={branch.id}
                style={{
                  padding: "16px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius)",
                  border: branch.id === branchId ? "2px solid var(--primary)" : "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: branch.primaryColor || "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      fontWeight: 800,
                      color: "#fff",
                    }}
                  >
                    {branch.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px" }}>{branch.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                      {branch.id === branchId ? "● Sucursal actual" : "Sucursal"}
                    </div>
                  </div>
                </div>

                {branch.address && (
                  <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                    📍 {branch.address}
                  </div>
                )}

                <a
                  href={`/${branch.id}/caja`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px",
                    background: branch.id === branchId ? "var(--primary)" : "var(--surface)",
                    color: branch.id === branchId ? "#000" : "var(--text-2)",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                    marginTop: "4px",
                  }}
                >
                  {branch.id === branchId ? "✓ En esta sucursal" : "Ir a la caja ›"}
                </a>
              </div>
            ))}
          </div>
        )}

        {isOwner && pricingMode === "BRANCH" && branches.length > 1 && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "rgba(59, 130, 246, 0.08)",
              borderRadius: "12px",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              fontSize: "13px",
              color: "var(--text-2)",
              lineHeight: 1.5,
            }}
          >
            💡 <strong>Consejo:</strong> Tenés precios separados por sucursal. Cada sucursal puede tener sus propios precios y costos.
          </div>
        )}
      </section>

      {/* Modal de Sucursal */}
      {branchModal && (
        <BranchModal
          branchId={branchId}
          pricingMode={pricingMode}
          onClose={handleBranchModalClose}
          onSave={handleBranchModalSave}
        />
      )}
    </div>
  );
}

// Modal de Sucursal (inline)
function BranchModal({
  branchId,
  pricingMode,
  onClose,
  onSave,
}: {
  branchId: string;
  pricingMode: "SHARED" | "BRANCH";
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          name,
          address: address || null,
          phone: phone || null,
          pricingMode,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "No se pudo crear la sucursal.");
        setLoading(false);
        return;
      }
      await onSave();
    } catch (err) {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "24px",
          width: "100%",
          maxWidth: "400px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>
          Nueva Sucursal
        </h2>
        {error && (
          <div style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              NOMBRE *
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sucursal Centro"
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              DIRECCION
            </label>
            <input
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              TELEFONO
            </label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div style={{ padding: "12px", background: "var(--surface-2)", borderRadius: "8px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>
            💡 Los precios y costos se copiarán desde la sucursal actual.
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? "Creando..." : "Crear sucursal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
