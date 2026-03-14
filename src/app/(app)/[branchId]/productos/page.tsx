"use client";

import { useEffect, useState, useRef } from "react";
import { formatARS, applyPercentage } from "@/lib/utils";
import BarcodeScanner from "@/components/caja/BarcodeScanner";

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  emoji: string | null;
  barcode: string | null;
  stock: number | null;
  minStock: number | null;
  showInGrid: boolean;
}

const EMOJIS = ["🧃", "🥤", "🍫", "🍬", "🍭", "🥜", "🧀", "🍞", "🥛", "🧹", "🧴", "🪥", "📦", "💊", "🪙", "🎴"];

// ─── Product Form Modal ────────────────────────────────────────────────────────
function ProductModal({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || "");
  const [emoji, setEmoji] = useState(product?.emoji || "");
  const [barcode, setBarcode] = useState(product?.barcode || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [cost, setCost] = useState(product?.cost?.toString() || "");
  const [stock, setStock] = useState(product?.stock?.toString() || "");
  const [minStock, setMinStock] = useState(product?.minStock?.toString() || "");
  const [showInGrid, setShowInGrid] = useState(product?.showInGrid ?? true);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const toNum = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setLoading(true);

    if (isNew) {
      await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          emoji: emoji || null,
          barcode: barcode.trim() || null,
          price: toNum(price),
          cost: toNum(cost),
          stock: toNum(stock),
        }),
      });
    } else {
      await fetch(`/api/productos/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          emoji: emoji || null,
          barcode: barcode.trim() || null,
          price: toNum(price),
          cost: toNum(cost),
          stock: toNum(stock),
          minStock: toNum(minStock),
          showInGrid,
        }),
      });
    }

    setLoading(false);
    onSave();
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    await fetch(`/api/productos/${product!.id}`, { method: "DELETE" });
    setLoading(false);
    onSave();
  };

  return (
    <div 
        className="modal-overlay animate-fade-in" 
        onClick={onClose}
        style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }} // Alineado abajo para tel.
      >
        <div 
          className="modal animate-slide-up" 
          onClick={(e) => e.stopPropagation()}
          style={{ 
            maxHeight: "85dvh", // usa dvh y menor % para dejar espacio al teclado virtual
            overflowY: "auto", 
            padding: "20px",
            width: "100%",
            maxWidth: "500px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
              {isNew ? "Nuevo producto" : "Editar producto"}
            </h2>
          </div>

        {/* Emoji Picker */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
          <button
            style={{
              width: "56px",
              height: "56px",
              fontSize: "28px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onClick={() => setShowEmojiPicker((v) => !v)}
          >
            {emoji || "＋"}
          </button>
          <input
            className="input"
            placeholder="Nombre del producto *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
        </div>

        {showEmojiPicker && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              padding: "10px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              marginBottom: "12px",
            }}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                style={{ fontSize: "24px", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
                onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
              >
                {e}
              </button>
            ))}
            <button
              style={{ fontSize: "12px", color: "var(--text-3)", padding: "4px 8px", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => { setEmoji(""); setShowEmojiPicker(false); }}
            >
              Quitar
            </button>
          </div>
        )}

        {/* Price & Cost */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Precio *</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ textAlign: "right" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Costo</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={{ textAlign: "right" }}
            />
          </div>
        </div>

        {/* Stock */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Stock</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              style={{ textAlign: "right" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Stock mín.</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              style={{ textAlign: "right" }}
            />
          </div>
        </div>

        {/* Barcode */}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Código de barras</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              ref={barcodeRef}
              className="input"
              placeholder="Escaneá o escribí el código"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost"
              style={{ padding: "0 16px", flexShrink: 0, fontSize: "20px" }}
              onClick={() => setShowScanner(true)}
              title="Escanear con cámara"
            >
              📷
            </button>
          </div>
        </div>

        {/* showInGrid toggle */}
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
              marginBottom: "12px",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>Mostrar en caja</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Si está oculto no aparece al vender</div>
            </div>
            <button
              style={{
                width: "44px",
                height: "24px",
                borderRadius: "99px",
                background: showInGrid ? "var(--green)" : "var(--border)",
                border: "none",
                cursor: "pointer",
                transition: "background 0.2s",
                position: "relative",
                flexShrink: 0,
              }}
              onClick={() => setShowInGrid((v) => !v)}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: showInGrid ? "22px" : "2px",
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

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px" }}>
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
            disabled={loading || !name.trim() || !price}
          >
            {loading ? "..." : isNew ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
      
      {showScanner && (
        <BarcodeScanner
          onScan={(result) => {
            setBarcode(result);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

// ─── Main Products Page ────────────────────────────────────────────────────────
export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [percentStr, setPercentStr] = useState("15");
  const [modal, setModal] = useState<"new" | Product | null>(null);

  const pctMatch = parseInt(percentStr, 10);
  const percent = isNaN(pctMatch) ? 0 : pctMatch;

  const fetchProducts = async () => {
    setLoading(true);
    // We use showInGrid=false to get ALL products (including hidden)
    const res = await fetch("/api/productos?all=1");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchVisibility = showHidden ? true : p.showInGrid;
    return matchSearch && matchVisibility;
  });

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

  const hiddenCount = products.filter((p) => !p.showInGrid).length;

  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Productos</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowUpdateModal(true)}>
            +% Precios
          </button>
          <button className="btn btn-sm btn-green" onClick={() => setModal("new")}>
            + Nuevo
          </button>
        </div>
      </div>

      {/* Search & filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <input
          className="input"
          placeholder="🔍 Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {hiddenCount > 0 && (
          <button
            className={`btn btn-sm ${showHidden ? "btn-green" : "btn-ghost"}`}
            onClick={() => setShowHidden((v) => !v)}
            title="Mostrar ocultos"
            style={{ flexShrink: 0 }}
          >
            👁 {hiddenCount}
          </button>
        )}
      </div>

      {/* Product List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
          {filtered.map((p) => (
            <button
              key={p.id}
              className="card"
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "var(--surface)",
                opacity: p.showInGrid ? 1 : 0.5,
              }}
              onClick={() => setModal(p)}
            >
              {p.emoji && <div style={{ fontSize: "24px" }}>{p.emoji}</div>}
              {!p.emoji && (
                <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: "var(--surface-2)", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {p.name}
                  {!p.showInGrid && <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>oculto</span>}
                </div>
                {p.stock !== null && (
                  <div style={{ fontSize: "12px", color: p.stock > 0 ? "var(--text-3)" : "var(--red)" }}>
                    Stock: {p.stock}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>{formatARS(p.price)}</div>
              <span style={{ color: "var(--text-3)" }}>›</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
              {search ? "Sin resultados" : "Sin productos. ¡Creá el primero!"}
            </div>
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

      {/* Product Create/Edit Modal */}
      {modal && (
        <ProductModal
          product={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); fetchProducts(); }}
        />
      )}
    </div>
  );
}
