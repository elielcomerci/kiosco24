"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarcodeLookupResponse,
  BarcodeSuggestion,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import BarcodeScanner from "./BarcodeScanner";

interface RestockItem {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
}

interface ProductVariant {
  id: string;
  name: string;
  barcode?: string | null;
}

interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  image?: string | null;
  brand?: string | null;
  description?: string | null;
  presentation?: string | null;
  variants?: ProductVariant[];
}

interface CreateProductDraft {
  code: string;
  name: string;
  brand: string;
  description: string;
  presentation: string;
  image: string | null;
}

interface SearchResult {
  product: Product;
  variant?: ProductVariant;
}

interface QuickRestockModalProps {
  products: Product[];
  branchId: string;
  employeeId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function buildDraft(code: string, suggestion: BarcodeSuggestion | null): CreateProductDraft {
  return {
    code,
    name: suggestion?.name || "",
    brand: suggestion?.brand || "",
    description: suggestion?.description || "",
    presentation: suggestion?.presentation || "",
    image: suggestion?.image || null,
  };
}

export default function QuickRestockModal({
  products,
  branchId,
  employeeId,
  onClose,
  onSuccess,
}: QuickRestockModalProps) {
  const [availableProducts, setAvailableProducts] = useState<Product[]>(products);
  const [items, setItems] = useState<RestockItem[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "ready" | "not-found">("idle");
  const [suggestion, setSuggestion] = useState<BarcodeSuggestion | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateProductDraft | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvailableProducts(products);
  }, [products]);

  useEffect(() => {
    if (!showScanner) {
      inputRef.current?.focus();
    }
  }, [items.length, showScanner]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (!search.trim()) {
      setLookupState("idle");
      setSuggestion(null);
      setCreateDraft(null);
      return;
    }

    if (createDraft && normalizeBarcodeCode(search) !== createDraft.code) {
      setLookupState("idle");
      setSuggestion(null);
      setCreateDraft(null);
    }
  }, [createDraft, search]);

  const findMatchingProduct = (value: string) => {
    const term = value.toLowerCase();

    let foundProduct = availableProducts.find((product) => product.barcode === value);
    let foundVariant: ProductVariant | undefined;

    if (!foundProduct) {
      for (const product of availableProducts) {
        const variant = product.variants?.find((item) => item.barcode === value);
        if (variant) {
          foundProduct = product;
          foundVariant = variant;
          break;
        }
      }
    }

    if (!foundProduct) {
      const matches = availableProducts.filter((product) => product.name.toLowerCase().includes(term));
      if (matches.length === 1 && (!matches[0].variants || matches[0].variants.length === 0)) {
        foundProduct = matches[0];
      }
    }

    return { foundProduct, foundVariant };
  };

  const resetCreateFlow = () => {
    setLookupState("idle");
    setSuggestion(null);
    setCreateDraft(null);
  };

  const lookupBarcodeSuggestion = async (rawCode: string) => {
    const code = normalizeBarcodeCode(rawCode);
    if (!canLookupBarcode(code)) return;

    setLookupState("loading");
    setSuggestion(null);
    setCreateDraft(buildDraft(code, null));

    try {
      const res = await fetch(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`);
      const data = (await res.json()) as BarcodeLookupResponse;

      if (data.found && data.suggestion) {
        setSuggestion(data.suggestion);
        setCreateDraft(buildDraft(code, data.suggestion));
        setLookupState("ready");
      } else {
        setSuggestion(null);
        setCreateDraft(buildDraft(code, null));
        setLookupState("not-found");
      }
    } catch (error) {
      console.error(error);
      setSuggestion(null);
      setCreateDraft(buildDraft(code, null));
      setLookupState("not-found");
    }
  };

  const handleAddItem = (product: Product, variant?: ProductVariant) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === product.id && item.variantId === variant?.id
      );

      if (existingIndex !== -1) {
        return prev.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

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
  };

  const handleLookupOrAdd = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const { foundProduct, foundVariant } = findMatchingProduct(trimmed);
    if (foundProduct) {
      handleAddItem(foundProduct, foundVariant);
      setSearch("");
      resetCreateFlow();
      return;
    }

    await lookupBarcodeSuggestion(trimmed);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLookupOrAdd(search);
  };

  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];

    const term = search.toLowerCase();
    const results: SearchResult[] = [];

    for (const product of availableProducts) {
      if (product.name.toLowerCase().includes(term) || product.barcode === search) {
        results.push({ product });
      }

      for (const variant of product.variants || []) {
        if (variant.name.toLowerCase().includes(term) || variant.barcode === search) {
          results.push({ product, variant });
        }
      }
    }

    return results.slice(0, 5);
  }, [availableProducts, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = searchResults[selectedIndex];
      handleAddItem(result.product, result.variant);
      setSearch("");
      resetCreateFlow();
    }
  };

  const handleUpdateQuantity = (index: number, value: string) => {
    const quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 1) return;

    setItems((prev) => {
      const next = [...prev];
      next[index].quantity = quantity;
      return next;
    });
  };

  const handleRemove = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreateProduct = async () => {
    if (!createDraft || !createDraft.name.trim()) return;

    setCreatingProduct(true);

    try {
      const res = await fetch("/api/productos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          barcode: createDraft.code,
          image: createDraft.image,
          brand: createDraft.brand.trim() || null,
          description: createDraft.description.trim() || null,
          presentation: createDraft.presentation.trim() || null,
          price: 0,
          cost: null,
          stock: 0,
          minStock: null,
          showInGrid: false,
          variants: [],
        }),
      });

      if (!res.ok) {
        alert("No pudimos crear el producto.");
        return;
      }

      const created = await res.json();
      const createdProduct: Product = {
        id: created.id,
        name: created.name || createDraft.name.trim(),
        barcode: created.barcode || createDraft.code,
        image: created.image || createDraft.image,
        brand: created.brand || createDraft.brand || null,
        description: created.description || createDraft.description || null,
        presentation: created.presentation || createDraft.presentation || null,
        variants: [],
      };

      setAvailableProducts((prev) => [...prev, createdProduct]);
      handleAddItem(createdProduct);
      setSearch("");
      resetCreateFlow();
    } catch (error) {
      console.error(error);
      alert("Hubo un error creando el producto.");
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleSave = async () => {
    if (items.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch("/api/inventario/ingreso-rapido", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ items, note, employeeId }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        alert("Hubo un error guardando el ingreso de mercaderia.");
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      alert("Error de red.");
      setLoading(false);
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="modal-overlay animate-fade-in"
      onClick={onClose}
      style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div
        className="modal animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "600px", height: "85dvh", display: "flex", flexDirection: "column", padding: 0 }}
      >
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Recepcion de Mercaderia</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>
              Escanea o busca para anadir unidades al stock actual.
            </p>
          </div>
          <button className="btn btn-ghost" style={{ padding: "8px" }} onClick={onClose}>
            X
          </button>
        </div>

        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", position: "relative" }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px" }}>
            <input
              ref={inputRef}
              className="input"
              placeholder="Escanea o busca..."
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
              Cam
            </button>
          </form>

          {searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "16px",
                right: "16px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "0 0 var(--radius) var(--radius)",
                zIndex: 100,
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {searchResults.map((result, index) => (
                <button
                  key={`${result.product.id}-${result.variant?.id || "main"}`}
                  className="btn btn-ghost"
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-2)",
                    borderRadius: 0,
                    background: index === selectedIndex ? "var(--surface-2)" : "transparent",
                    borderColor: index === selectedIndex ? "var(--primary)" : "transparent",
                  }}
                  onClick={() => {
                    handleAddItem(result.product, result.variant);
                    setSearch("");
                    resetCreateFlow();
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                      {result.variant ? `${result.product.name} - ${result.variant.name}` : result.product.name}
                    </div>
                    {(result.variant?.barcode || result.product.barcode) && (
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {result.variant?.barcode || result.product.barcode}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {lookupState === "loading" && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-3)" }}>
              Buscando datos sugeridos...
            </div>
          )}

          {createDraft && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
                    {lookupState === "ready" ? "Datos sugeridos" : "Producto nuevo"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                    {lookupState === "ready"
                      ? "Se va a crear y agregar a esta recepcion."
                      : "No esta en tu catalogo. Podes crearlo ahora."}
                  </div>
                </div>
                {createDraft.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={createDraft.image}
                    alt={createDraft.name || createDraft.code}
                    style={{ width: "56px", height: "56px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <input
                  className="input"
                  placeholder="Nombre del producto *"
                  value={createDraft.name}
                  onChange={(e) => setCreateDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  style={{ gridColumn: "1 / -1" }}
                />
                <input
                  className="input"
                  placeholder="Marca"
                  value={createDraft.brand}
                  onChange={(e) => setCreateDraft((prev) => (prev ? { ...prev, brand: e.target.value } : prev))}
                />
                <input
                  className="input"
                  placeholder="Presentacion"
                  value={createDraft.presentation}
                  onChange={(e) => setCreateDraft((prev) => (prev ? { ...prev, presentation: e.target.value } : prev))}
                />
              </div>

              <textarea
                className="input"
                placeholder="Descripcion"
                value={createDraft.description}
                onChange={(e) => setCreateDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                rows={2}
                style={{ width: "100%", resize: "vertical" }}
              />

              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Se crea oculto hasta completar el precio.
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={resetCreateFlow} disabled={creatingProduct}>
                  Ocultar
                </button>
                <button
                  className="btn btn-green"
                  style={{ flex: 1 }}
                  onClick={handleCreateProduct}
                  disabled={creatingProduct || !createDraft.name.trim()}
                >
                  {creatingProduct ? "Creando..." : "Crear y agregar"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
              No hay productos escaneados.
              <br />
              <br />
              Escanea un codigo y se sumara a la lista.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {items.map((item, index) => (
                <div
                  key={`${item.productId}-${item.variantId || "main"}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "var(--surface)",
                    padding: "12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{item.name}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-3)", fontWeight: 600 }}>CANT:</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => handleUpdateQuantity(index, e.target.value)}
                      onKeyDown={handleQtyKeyDown}
                      style={{ width: "80px", textAlign: "center", fontSize: "16px", fontWeight: 700 }}
                      onFocus={(e) => e.target.select()}
                    />
                    <button className="btn btn-ghost" style={{ color: "var(--red)", padding: "8px" }} onClick={() => handleRemove(index)}>
                      Del
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
            placeholder="Nota o referencia"
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
              {loading ? "Guardando..." : `Guardar ingreso (${items.length} items)`}
            </button>
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(code) => {
            setSearch(code);
            setShowScanner(false);
            void handleLookupOrAdd(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
