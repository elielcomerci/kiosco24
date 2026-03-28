"use client";

import { useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";

export interface CategoryRecord {
  id: string;
  name: string;
  color: string | null;
  showInGrid?: boolean;
}

interface CategoryModalProps {
  category: "new" | CategoryRecord;
  onClose: () => void;
  onSave: (savedCategory: CategoryRecord | null) => void;
}

export default function CategoryModal({
  category,
  onClose,
  onSave,
}: CategoryModalProps) {
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

    const res = await fetch(isNew ? "/api/categorias" : `/api/categorias/${category.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo guardar la categoria.");
      setLoading(false);
      return;
    }

    const savedCategory = (await res.json()) as CategoryRecord;
    setLoading(false);
    onSave(savedCategory);
  };

  const handleDelete = async () => {
    if (isNew) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/categorias/${category.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo eliminar la categoria.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onSave(null);
  };

  return (
    <ModalPortal>
      <div
        className="modal-overlay animate-fade-in"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
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
            gap: "16px",
          }}
        >
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
          {isNew ? "Nueva Categoria" : "Editar Categoria"}
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
                cursor: "pointer",
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
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-3)", lineHeight: "1.2" }}>
                  Desactiva esto para ocultar la categoria de los botones principales.
                </p>
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
    </ModalPortal>
  );
}
