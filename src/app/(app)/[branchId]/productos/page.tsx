"use client";

import { useEffect, useState } from "react";
import { formatARS, applyPercentage } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  emoji: string | null;
  stock: number | null;
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [percentStr, setPercentStr] = useState("15");

  const pctMatch = parseInt(percentStr, 10);
  const percent = isNaN(pctMatch) ? 0 : pctMatch;

  const fetchProducts = async () => {
    setLoading(true);
    const res = await fetch("/api/productos");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleApplyUpdate = async () => {
    if (percent === 0) return;
    setLoading(true);
    await fetch("/api/productos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: filtered.map((p) => p.id),
        percentage: percent,
      }),
    });
    setShowUpdateModal(false);
    fetchProducts();
  };

  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Productos</h1>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowUpdateModal(true)}>
          +% Actualizar
        </button>
      </div>

      <input
        className="input"
        placeholder="🔍 Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "16px" }}
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
          {filtered.map((p) => (
            <div key={p.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
              {p.emoji && <div style={{ fontSize: "24px" }}>{p.emoji}</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {p.stock !== null && (
                  <div style={{ fontSize: "12px", color: p.stock > 0 ? "var(--text-3)" : "var(--red)" }}>
                    Stock: {p.stock}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>{formatARS(p.price)}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>No hay resultados</div>
          )}
        </div>
      )}

      {/* Update Prices Modal */}
      {showUpdateModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowUpdateModal(false)}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Actualizar precios</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
              Aplica un % a los {filtered.length} productos filtrados. Los nuevos precios se redondean a los $10.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="number"
                className="input"
                value={percentStr}
                onChange={(e) => setPercentStr(e.target.value)}
                style={{ flex: 1, fontSize: "24px", fontWeight: 800, textAlign: "center" }}
              />
              <span style={{ fontSize: "24px", fontWeight: 800 }}>%</span>
            </div>

            <div className="separator" style={{ margin: "4px 0" }} />

            <div style={{ overflowY: "auto", maxHeight: "250px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.1em" }}>Vista previa</h3>
              {filtered.slice(0, 10).map((p) => {
                const newPrice = applyPercentage(p.price, percent);
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontWeight: 600 }}>
                      <span style={{ color: "var(--text-3)", textDecoration: "line-through", marginRight: "6px" }}>{formatARS(p.price)}</span>
                      <span style={{ color: "var(--green)" }}>{formatARS(newPrice)}</span>
                    </span>
                  </div>
                );
              })}
              {filtered.length > 10 && (
                <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "12px", paddingTop: "8px" }}>
                  y {filtered.length - 10} más...
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowUpdateModal(false)}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleApplyUpdate} disabled={percent === 0 || loading}>
                {loading ? "..." : "Confirmar todos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
