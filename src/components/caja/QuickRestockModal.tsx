"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { formatARS } from "@/lib/utils";
import BarcodeScanner from "./BarcodeScanner";

interface RestockItem {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  variants?: { id: string; name: string; barcode?: string | null }[];
}

interface QuickRestockModalProps {
  products: Product[];
  employeeId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuickRestockModal({ products, employeeId, onClose, onSuccess }: QuickRestockModalProps) {
  const [items, setItems] = useState<RestockItem[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus logic: always keep focus on search input for rapid scanning
  useEffect(() => {
    if (!showScanner) {
      inputRef.current?.focus();
    }
  }, [items.length, showScanner]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;

    const term = search.toLowerCase();
    
    // 1. Find by exact barcode globally (Product or Variant)
    let foundProduct = products.find(p => p.barcode === search);
    let foundVariant = null;

    if (!foundProduct) {
      for (const p of products) {
        if (p.variants) {
          const v = p.variants.find(v => v.barcode === search);
          if (v) {
            foundProduct = p;
            foundVariant = v;
            break;
          }
        }
      }
    }

    // 2. Fallback to name search if barcode failed and there's a unique clear match
    if (!foundProduct) {
      const matches = products.filter(p => p.name.toLowerCase().includes(term));
      if (matches.length === 1 && (!matches[0].variants || matches[0].variants.length === 0)) {
        foundProduct = matches[0];
      }
      // Note: We don't auto-add variants by name search because it requires manual disambiguation
    }

    if (foundProduct) {
      handleAddItem(foundProduct, foundVariant);
      setSearch("");
    }
  };

  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];
    const term = search.toLowerCase();
    
    const results: { product: Product, variant?: any }[] = [];
    
    for (const p of products) {
      if (p.name.toLowerCase().includes(term) || p.barcode === search) {
        results.push({ product: p });
      }
      if (p.variants) {
        for (const v of p.variants) {
          if (v.name.toLowerCase().includes(term) || v.barcode === search) {
            results.push({ product: p, variant: v });
          }
        }
      }
    }
    return results.slice(0, 5); // Limit to top 5 matches
  }, [search, products]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % searchResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const res = searchResults[selectedIndex];
        handleAddItem(res.product, res.variant);
        setSearch("");
      }
    }
  };

  const handleAddItem = (product: Product, variant: any = null) => {
    let targetIndex = -1;
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.productId === product.id && i.variantId === variant?.id
      );

      if (existingIndex !== -1) {
        targetIndex = existingIndex;
        return prev.map((i, idx) =>
          idx === existingIndex
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      targetIndex = prev.length;
      return [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id,
          name: variant ? `${product.name} - ${variant.name}` : product.name,
          quantity: 1,
        },
      ];
    });
    setFocusIndex(targetIndex);
  };

  const handleUpdateQuantity = (index: number, val: string) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 1) return;
    
    setItems(prev => {
      const copy = [...prev];
      copy[index].quantity = qty;
      return copy;
    });
  };

  const handleRemove = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (items.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch("/api/inventario/ingreso-rapido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, note, employeeId }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        alert("Hubo un error guardando el ingreso de mercadería.");
        setLoading(false);
      }
    } catch (e) {
      alert("Error de red.");
      setLoading(false);
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.focus(); // Focus back to scanner/search
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ 
        width: "100%", maxWidth: "600px", height: "85dvh", display: "flex", flexDirection: "column", padding: 0 
      }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>📦 Recepción de Mercadería</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>Escaneá o buscá para añadir unidades al stock actual.</p>
          </div>
          <button className="btn btn-ghost" style={{ padding: "8px" }} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", position: "relative" }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px" }}>
            <input
              ref={inputRef}
              className="input"
              placeholder="🔍 Escaneá o buscá..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ flex: 1, height: "44px", fontSize: "16px" }}
              autoFocus
            />
            <button 
              type="button" 
              className="btn btn-black" 
              style={{ height: "44px", width: "44px", padding: 0 }}
              onClick={() => setShowScanner(true)}
            >
              📷
            </button>
          </form>

          {/* Manual Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div style={{ 
              position: "absolute", top: "100%", left: "16px", right: "16px", 
              background: "var(--surface)", border: "1px solid var(--border)", 
              borderRadius: "0 0 var(--radius) var(--radius)", zIndex: 100,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
              maxHeight: "200px", overflowY: "auto"
            }}>
              {searchResults.map((res, i) => (
                <button
                  key={`${res.product.id}-${res.variant?.id || 'main'}`}
                  className="btn btn-ghost"
                  style={{ 
                    width: "100%", justifyContent: "flex-start", padding: "12px 16px", 
                    borderBottom: "1px solid var(--border-2)", borderRadius: 0,
                    background: i === selectedIndex ? "var(--surface-2)" : "transparent",
                    borderColor: i === selectedIndex ? "var(--primary)" : "transparent"
                  }}
                  onClick={() => {
                    handleAddItem(res.product, res.variant);
                    setSearch("");
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                      {res.variant ? `${res.product.name} - ${res.variant.name}` : res.product.name}
                    </div>
                    {res.variant?.barcode || res.product.barcode ? (
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {res.variant?.barcode || res.product.barcode}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
              No hay productos escaneados.<br/><br/>
              Pistoleá el código de barras y se sumará a la lista.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--surface)", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{item.name}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-3)", fontWeight: 600 }}>CANT:</span>
                    <input
                      ref={(el) => { qtyRefs.current[i] = el; }}
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => handleUpdateQuantity(i, e.target.value)}
                      onKeyDown={(e) => handleQtyKeyDown(e, i)}
                      style={{ width: "80px", textAlign: "center", fontSize: "16px", fontWeight: 700 }}
                      onFocus={(e) => e.target.select()}
                    />
                    <button className="btn btn-ghost" style={{ color: "var(--red)", padding: "8px" }} onClick={() => handleRemove(i)}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
          <input
            className="input"
            placeholder="Nota o Referencia (ej: Factura N° 1234, Proveedor x)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginBottom: "16px", width: "100%" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button
              className="btn btn-green"
              style={{ flex: 2, height: "48px", fontSize: "16px" }}
              onClick={handleSave}
              disabled={loading || items.length === 0}
            >
              {loading ? "Guardando..." : `Guardar Ingreso (${items.length} items)`}
            </button>
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner 
          onScan={(code) => {
            setSearch(code);
            setShowScanner(false);
            // The handleSearchSubmit will trigger on the next render through a hidden submit or similar? 
            // Better: trigger search logic directly
            const term = code.toLowerCase();
            let foundProduct = products.find(p => p.barcode === code);
            let foundVariant = null;
            if (!foundProduct) {
              for (const p of products) {
                if (p.variants) {
                  const v = p.variants.find(v => v.barcode === code);
                  if (v) { foundProduct = p; foundVariant = v; break; }
                }
              }
            }
            if (foundProduct) {
              handleAddItem(foundProduct, foundVariant);
              setSearch("");
            } else {
              alert(`Código ${code} no encontrado.`);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
