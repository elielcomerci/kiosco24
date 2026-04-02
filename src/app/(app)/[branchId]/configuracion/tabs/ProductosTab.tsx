/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import type { Category, Branch } from "../types";

interface ProductosTabProps {
  branchId: string;
  isOwner: boolean;
  currentBranch: any;
  loadingCurrentBranch: boolean;
  categories: Category[];
  loadingCategories: boolean;
  categoryModal: "new" | Category | null;
  // Handlers
  handleMpSetupPos: () => Promise<void>;
  handleMpDisconnect: () => Promise<void>;
  setCategoryModal: (v: "new" | Category | null) => void;
  handleCategorySave: (category: { name: string; color: string }) => Promise<void>;
  handleCategoryDelete: (categoryId: string) => Promise<void>;
}

export default function ProductosTab({
  branchId,
  isOwner,
  currentBranch,
  loadingCurrentBranch,
  categories,
  loadingCategories,
  categoryModal,
  handleMpSetupPos,
  handleMpDisconnect,
  setCategoryModal,
  handleCategorySave,
  handleCategoryDelete,
}: ProductosTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* MercadoPago */}
      {isOwner && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "20px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text-2)" }}>
            💳 MercadoPago
          </h3>

          {loadingCurrentBranch ? (
            <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando...</div>
          ) : !currentBranch?.mpUserId ? (
            <>
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Conectar cuenta de MercadoPago</p>
                <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  Autorizá esta sucursal para cobrar con QR de MercadoPago. El dinero va directo
                  a tu cuenta — nosotros nunca lo tocamos.
                </p>
              </div>
              <a href={`/api/mp/auth?branchId=${branchId}`} style={{ textDecoration: "none" }}>
                <button className="btn btn-green" style={{ width: "100%", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📱</span>
                  Conectar mi cuenta de MercadoPago
                </button>
              </a>
            </>
          ) : !currentBranch?.mpPosId ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "16px" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <p style={{ fontWeight: 600 }}>Cuenta conectada</p>
                  <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                    Falta configurar el punto de venta para usar la terminal de MercadoPago.
                  </p>
                </div>
              </div>
              <button
                onClick={handleMpSetupPos}
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Configurar punto de venta
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "16px" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <p style={{ fontWeight: 600 }}>Terminal configurada</p>
                  <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                    Punto de venta: {currentBranch.mpPosId}
                  </p>
                </div>
              </div>
              <button
                onClick={handleMpDisconnect}
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "center", color: "var(--red)" }}
              >
                Desconectar cuenta
              </button>
            </>
          )}
        </section>
      )}

      {/* Categorías */}
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
            🏷️ Categorías
          </h3>
          <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} onClick={() => setCategoryModal("new")}>
            + Nueva
          </button>
        </div>

        {loadingCategories ? (
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando...</div>
        ) : categories.length === 0 ? (
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
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🏷️</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Sin categorías</div>
            <div style={{ fontSize: "14px" }}>Creá categorías para organizar tus productos</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: cat.color || "gray" }} />
                <div style={{ flex: 1, fontWeight: 600 }}>{cat.name}</div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setCategoryModal(cat)}
                  style={{ border: "1px solid var(--border)" }}
                >
                  Editar
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleCategoryDelete(cat.id)}
                  style={{ color: "var(--red)", border: "1px solid rgba(239, 68, 68, 0.3)" }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Categoría */}
      {categoryModal && (
        <CategoryModal
          category={categoryModal === "new" ? null : categoryModal}
          onClose={() => setCategoryModal(null)}
          onSave={async (data) => {
            await handleCategorySave(data);
            setCategoryModal(null);
          }}
        />
      )}
    </div>
  );
}

// Modal de Categoría (inline para simplicidad)
function CategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: (data: { name: string; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(category?.color || "#22c55e");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onSave({ name, color });
    setLoading(false);
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
          {category ? "Editar categoría" : "Nueva categoría"}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              NOMBRE
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Bebidas"
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              COLOR
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: "60px", height: "40px", border: "none", cursor: "pointer" }}
            />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
