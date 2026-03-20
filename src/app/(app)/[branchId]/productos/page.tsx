"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { formatARS, applyPercentage } from "@/lib/utils";
import {
  BarcodeLookupResponse,
  BarcodeSuggestion,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import BackButton from "@/components/ui/BackButton";
import PrintablePage from "@/components/print/PrintablePage";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";

interface Variant {
  id?: string;
  name: string;
  barcode: string | null;
  stock: number | null;
  minStock: number | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  emoji: string | null;
  barcode: string | null;
  internalCode: string | null;
  image: string | null;
  brand: string | null;
  description: string | null;
  presentation: string | null;
  supplierName: string | null;
  notes: string | null;
  categoryId: string | null;
  stock: number | null;
  minStock: number | null;
  showInGrid: boolean;
  readyForSale?: boolean;
  platformProductId?: string | null;
  variants?: Variant[];
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

const EMOJIS = ["🧃", "🥤", "🍫", "🍬", "🍭", "🥜", "🧀", "🍞", "🥛", "🧹", "🧴", "🪥", "📦", "💊", "🪙", "🎴"];

// ─── Product Form Modal ────────────────────────────────────────────────────────
function ProductModal({
  product,
  categories,
  onClose,
  onSave,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || "");
  const [emoji, setEmoji] = useState(product?.emoji || "");
  const [barcode, setBarcode] = useState(product?.barcode || "");
  const [internalCode, setInternalCode] = useState(product?.internalCode || "");
  const [image, setImage] = useState(product?.image || "");
  const [brand, setBrand] = useState(product?.brand || "");
  const [description, setDescription] = useState(product?.description || "");
  const [presentation, setPresentation] = useState(product?.presentation || "");
  const [supplierName, setSupplierName] = useState(product?.supplierName || "");
  const [notes, setNotes] = useState(product?.notes || "");
  const [categoryId, setCategoryId] = useState(product?.categoryId || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [cost, setCost] = useState(product?.cost?.toString() || "");
  const [stock, setStock] = useState(product?.stock?.toString() || "");
  const [minStock, setMinStock] = useState(product?.minStock?.toString() || "");
  const [showInGrid, setShowInGrid] = useState(product?.showInGrid ?? true);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(product?.variants || []);
  const [hasVariants, setHasVariants] = useState((product?.variants?.length ?? 0) > 0);
  const [suggestion, setSuggestion] = useState<BarcodeSuggestion | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "ready">("idle");
  const [dismissedSuggestionCode, setDismissedSuggestionCode] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const toNum = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const applySuggestion = (nextSuggestion: BarcodeSuggestion) => {
    const suggestedVariants = (nextSuggestion.variants ?? []).map((variant) => ({
      name: variant.name,
      barcode: variant.barcode,
      stock: null,
      minStock: null,
    }));

      setName(nextSuggestion.name);
      setBrand(nextSuggestion.brand || "");
      setDescription(nextSuggestion.description || "");
      setPresentation(nextSuggestion.presentation || "");
      setBarcode(suggestedVariants.length > 0 ? "" : (nextSuggestion.code || ""));
    if (nextSuggestion.image) {
      setImage(nextSuggestion.image);
    }
    if (suggestedVariants.length > 0) {
      setHasVariants(true);
      setVariants(suggestedVariants);
      setStock("");
      setMinStock("");
    } else {
      setHasVariants(false);
    }
    setSuggestion(nextSuggestion);
    setLookupState("ready");
    setDismissedSuggestionCode(null);
  };

  useEffect(() => {
    const code = normalizeBarcodeCode(barcode);

    if (hasVariants || !canLookupBarcode(code)) {
      setSuggestion(null);
      setLookupState("idle");
      return;
    }

    if (dismissedSuggestionCode === code) {
      setSuggestion(null);
      setLookupState("idle");
      return;
    }

    setSuggestion(null);
    setLookupState("idle");

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLookupState("loading");

      try {
        const res = await fetch(`/api/platform-products/lookup?code=${encodeURIComponent(code)}`);
        const data = (await res.json()) as BarcodeLookupResponse;

        if (cancelled) return;

        if (data.found && data.suggestion) {
          setSuggestion(data.suggestion);
          setLookupState("ready");
        } else {
          setSuggestion(null);
          setLookupState("idle");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setSuggestion(null);
          setLookupState("idle");
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [barcode, dismissedSuggestionCode, hasVariants]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);

    const payload = {
      name: name.trim(),
      emoji: emoji || null,
      barcode: hasVariants ? null : (barcode.trim() || null),
      internalCode: internalCode.trim() || null,
      image: image || null,
      brand: brand.trim() || null,
      description: description.trim() || null,
      presentation: presentation.trim() || null,
      supplierName: supplierName.trim() || null,
      notes: notes.trim() || null,
      categoryId: categoryId || null,
      price: toNum(price),
      cost: toNum(cost),
      stock: hasVariants ? null : toNum(stock),
      minStock: hasVariants ? null : toNum(minStock),
      showInGrid,
      variants: hasVariants ? variants.map(v => ({
        id: v.id,
        name: v.name.trim(),
        barcode: v.barcode?.trim() || null,
        stock: toNum(v.stock?.toString() || ""),
        minStock: toNum(v.minStock?.toString() || "")
      })).filter(v => v.name) : []
    };

    if (isNew) {
      await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/productos/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Codigo de barras
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              ref={barcodeRef}
              className="input"
              placeholder={hasVariants ? "Las variantes llevan su propio codigo" : "Escanea o escribe el codigo"}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              style={{ flex: 1 }}
              autoFocus={isNew}
              disabled={hasVariants}
            />
            <button
              className="btn btn-ghost"
              style={{ padding: "0 16px", flexShrink: 0, fontSize: "20px" }}
              onClick={() => setShowScanner(true)}
              title="Escanear con camara"
              disabled={hasVariants}
            >
              📷
            </button>
          </div>
          {hasVariants && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
              Al usar variantes, el codigo principal se elimina y cada variante usa el suyo.
            </div>
          )}
          {lookupState === "loading" && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
              Buscando en la base general...
            </div>
          )}
          {lookupState === "ready" && suggestion && (
            <div
              style={{
                marginTop: "10px",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
                Base general
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {suggestion?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={suggestion.image ?? undefined}
                    alt={suggestion.name}
                    style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "10px",
                      background: "var(--surface)",
                      border: "1px dashed var(--border)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{suggestion?.name}</div>
                  {(suggestion?.brand || suggestion?.presentation || suggestion?.description) && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      {[suggestion?.brand, suggestion?.presentation, suggestion?.description].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setDismissedSuggestionCode(normalizeBarcodeCode(barcode));
                    setSuggestion(null);
                    setLookupState("idle");
                  }}
                >
                  Ocultar
                </button>
                <button className="btn btn-green" style={{ flex: 1 }} onClick={() => suggestion && applySuggestion(suggestion)}>
                  Usar
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Codigo interno
          </label>
          <input
            className="input"
            placeholder="SKU o referencia propia"
            value={internalCode}
            onChange={(e) => setInternalCode(e.target.value)}
          />
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

        {/* Categoría & Foto */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
              Categoría
            </label>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ width: "100%", background: "var(--surface)", cursor: "pointer" }}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
              Foto
            </label>
            <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "10px", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "var(--surface)" }}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : uploadingImage ? (
                <span className="animate-pulse" style={{ fontSize: "12px" }}>...</span>
              ) : (
                <span style={{ fontSize: "18px", opacity: 0.5 }}>📷</span>
              )}

              <input
                type="file"
                accept="image/*"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                disabled={uploadingImage}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.secure_url) setImage(data.secure_url);
                  } catch (err) {
                    console.error(err);
                  }
                  setUploadingImage(false);
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
              Marca
            </label>
            <input
              className="input"
              placeholder="Opcional"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
              Presentacion
            </label>
            <input
              className="input"
              placeholder="Ej: 500 ml"
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Proveedor habitual
          </label>
          <input
            className="input"
            placeholder="Opcional"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Descripcion
          </label>
          <textarea
            className="input"
            placeholder="Opcional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Notas internas
          </label>
          <textarea
            className="input"
            placeholder="Dato util para tu equipo: proveedor, ubicacion, compra minima..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              background: "var(--surface-2)",
              color: "var(--text-3)",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            Este producto queda fuera de la caja hasta que completes precio, costo unitario y stock.
          </div>

          {/* Price & Cost */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Precio</label>
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

        {/* Modificador de Variantes y Stock/Barcode alternativo */}
        <div style={{ marginBottom: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                const checked = e.target.checked;
                setHasVariants(checked);
                if (checked) {
                  setBarcode("");
                }
              }}
            />
            Tiene múltiples sabores/variantes
          </label>
        </div>

        {hasVariants ? (
          <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {variants.map((v, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", padding: "10px", borderRadius: "8px", background: "var(--surface)" }}>
                 <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                   <input 
                     className="input" 
                     placeholder="Nombre variante (ej: Naranja) *" 
                     value={v.name} 
                     onChange={(e) => {
                       const newV = [...variants];
                       newV[i].name = e.target.value;
                       setVariants(newV);
                     }} 
                     style={{flex: 1}} 
                   />
                   <button 
                     className="btn btn-sm btn-ghost" 
                     onClick={() => {
                        const newV = [...variants];
                        newV.splice(i, 1);
                        setVariants(newV);
                     }} 
                     style={{color: "var(--red)", fontSize: "16px"}}
                   >
                     🗑
                   </button>
                 </div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>CÓDIGO (OPCIONAL)</label>
                      <input 
                        className="input" 
                        placeholder="Código..." 
                        value={v.barcode || ""} 
                        onChange={(e) => {
                          const newV = [...variants];
                          newV[i].barcode = e.target.value;
                          setVariants(newV);
                        }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>STOCK</label>
                      <input 
                        className="input" 
                        type="number" 
                        placeholder="Stock..." 
                        value={v.stock?.toString() || ""} 
                        onChange={(e) => {
                          const newV = [...variants];
                          newV[i].stock = e.target.value ? parseInt(e.target.value) : null;
                          setVariants(newV);
                        }} 
                      />
                    </div>
                 </div>
              </div>
            ))}
            <button 
              className="btn btn-sm btn-ghost" 
              style={{ border: "1px dashed var(--border)", padding: "8px" }}
              onClick={() => setVariants([...variants, {name: "", barcode: null, stock: null, minStock: null}])}
            >
              + Agregar Variante
            </button>
          </div>
        ) : (
          <>
            {/* Stock Base */}
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

            {false && (
            <>
            {/* Barcode Base */}
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
              {lookupState === "loading" && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
                  Buscando datos sugeridos...
                </div>
              )}
              {lookupState === "ready" && suggestion && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
                    Datos sugeridos
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    {suggestion?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={suggestion?.image ?? undefined}
                        alt={suggestion?.name || "Producto"}
                        style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "10px",
                          background: "var(--surface)",
                          border: "1px dashed var(--border)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{suggestion?.name}</div>
                      {(suggestion?.brand || suggestion?.presentation || suggestion?.description) && (
                        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                          {[suggestion?.brand, suggestion?.presentation, suggestion?.description].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDismissedSuggestionCode(normalizeBarcodeCode(barcode));
                        setSuggestion(null);
                        setLookupState("idle");
                      }}
                    >
                      Ocultar
                    </button>
                    <button
                      className="btn btn-green"
                      style={{ flex: 1 }}
                      onClick={() => {
                        if (suggestion) {
                          applySuggestion(suggestion);
                        }
                      }}
                    >
                      Usar
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}

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
            disabled={loading || !name.trim()}
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [percentStr, setPercentStr] = useState("15");
  const [modal, setModal] = useState<"new" | Product | null>(null);
  // ─── Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulking, setBulking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pctMatch = parseInt(percentStr, 10);
  const percent = isNaN(pctMatch) ? 0 : pctMatch;

  const fetchProducts = async () => {
    setLoading(true);
    // We use showInGrid=false to get ALL products (including hidden)
    const res = await fetch("/api/productos?all=1");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    
    // Fetch categories para pasarlas al modal y mostrarlas
    const catRes = await fetch("/api/categorias");
    const catData = await catRes.json();
    setCategories(Array.isArray(catData) ? catData : []);

    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products.filter((p) => {
    const normalizedSearch = search.toLowerCase();
    const searchHaystack = [
      p.name,
      p.barcode,
      p.internalCode,
      p.brand,
      p.presentation,
      p.supplierName,
      p.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchSearch = searchHaystack.includes(normalizedSearch);
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

  const shortcuts = useMemo(
    () => [
      {
        key: "/",
        combo: "/",
        label: "Buscar producto",
        description: "Lleva el foco al buscador del catalogo.",
        group: "Productos",
        action: () => searchInputRef.current?.focus(),
      },
      {
        key: "n",
        combo: "Alt+N",
        label: "Nuevo producto",
        description: "Abre el formulario para crear un producto.",
        group: "Productos",
        alt: true,
        action: () => setModal("new"),
      },
      {
        key: "h",
        combo: "Alt+H",
        label: "Mostrar ocultos",
        description: "Alterna la vista de productos ocultos.",
        group: "Productos",
        alt: true,
        action: () => setShowHidden((prev) => !prev),
      },
    ],
    []
  );

  useRegisterShortcuts(shortcuts);

  // ─── Bulk selection helpers
  const toggleSelectionMode = () => {
    setSelectionMode((v) => !v);
    setSelected(new Set());
    setConfirmingDelete(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    // Delete products one by one (could be batched later)
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/productos/${id}`, { method: "DELETE" })
      )
    );
    setDeleting(false);
    setSelectionMode(false);
    setSelected(new Set());
    setConfirmingDelete(false);
    fetchProducts();
  };

  const handleBulkCategorize = async () => {
    if (selected.size === 0) return;
    setBulking(true);

    await fetch("/api/productos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: Array.from(selected),
        categoryId: bulkCategoryId || null, // null clears category
      }),
    });

    setBulking(false);
    setShowBulkCategoryModal(false);
    setSelectionMode(false);
    setSelected(new Set());
    fetchProducts();
  };

  return (
    <>
    <div className="screen-only" style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        {selectionMode ? (
          <button className="btn btn-sm btn-ghost" onClick={toggleSelectionMode} style={{ fontWeight: 600 }}>Cancelar</button>
        ) : (
          <BackButton />
        )}
        <h1 style={{ fontSize: "20px", fontWeight: 800 }}>Productos</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          {!selectionMode && (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowUpdateModal(true)}>+%</button>
              <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)" }} onClick={toggleSelectionMode}>☑</button>
              <button className="btn btn-sm btn-green" onClick={() => setModal("new")}>+ Nuevo</button>
            </>
          )}
        </div>
      </div>

      {/* Search & filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
          <input
            ref={searchInputRef}
            className="input"
            placeholder="🔍 Buscar por nombre, codigo o proveedor..."
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
          {filtered.map((p) => {
            const isSelected = selected.has(p.id);
            return selectionMode ? (
              // ─── Selection Mode Card
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  background: isSelected ? "rgba(var(--primary-rgb, 34, 197, 94), 0.08)" : "var(--surface)",
                  opacity: p.showInGrid ? 1 : 0.6,
                  transition: "border 0.15s, background 0.15s",
                }}
              >
                {/* Checkbox visual */}
                <div style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                  background: isSelected ? "var(--primary)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                  fontSize: "13px",
                  color: "white",
                  fontWeight: 800,
                }}>
                  {isSelected ? "✓" : ""}
                </div>
                {p.emoji && <div style={{ fontSize: "22px" }}>{p.emoji}</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    {[p.internalCode, p.barcode, p.supplierName].filter(Boolean).join(" · ") || "Sin codigo extra"}
                  </div>
                  {(() => {
                    const totalStock = p.variants && p.variants.length > 0
                      ? p.variants.reduce((acc, v) => acc + (v.stock || 0), 0)
                      : p.stock;
                    
                    return totalStock !== null && (
                      <div style={{ fontSize: "12px", color: totalStock > 0 ? "var(--text-3)" : "var(--red)" }}>
                        Stock: {totalStock}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)" }}>{formatARS(p.price)}</div>
              </button>
            ) : (
              // ─── Normal Card
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
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    {[p.internalCode, p.barcode, p.supplierName].filter(Boolean).join(" · ") || "Sin codigo extra"}
                  </div>
                  {(() => {
                    const totalStock = p.variants && p.variants.length > 0
                      ? p.variants.reduce((acc, v) => acc + (v.stock || 0), 0)
                      : p.stock;
                    
                    return totalStock !== null && (
                      <div style={{ fontSize: "12px", color: totalStock > 0 ? "var(--text-3)" : "var(--red)" }}>
                        Stock: {totalStock}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>{formatARS(p.price)}</div>
                <span style={{ color: "var(--text-3)" }}>›</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
              {search ? "Sin resultados" : "Sin productos. ¡Creá el primero!"}
            </div>
          )}
        </div>
      )}


      {/* ─── Floating Bulk Action Bar ────────────────────────────────────── */}
      {selectionMode && (
        <div
          style={{
            position: "fixed",
            bottom: "72px", // above BottomNav
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
            maxWidth: "480px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 500,
          }}
          className="animate-slide-up"
        >
          {/* Counter + Select All */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "15px" }}>
              {selected.size === 0
                ? "Seleccioná productos"
                : `${selected.size} seleccionado${selected.size > 1 ? "s" : ""}`}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={selectAll}
              style={{ fontSize: "13px" }}
            >
              {selected.size === filtered.length ? "Ninguno" : "Todos"}
            </button>
          </div>

          {/* Bulk Actions — shown only when at least 1 is selected */}
          {selected.size > 0 && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn-ghost"
                style={{
                  border: "1px solid var(--border)",
                  fontWeight: 600,
                  flex: 1,
                  fontSize: "14px"
                }}
                onClick={() => setShowBulkCategoryModal(true)}
              >
                🏷️ Asignar Categoría
              </button>

              <button
                className="btn"
                style={{
                  background: confirmingDelete ? "var(--red)" : "rgba(239,68,68,0.12)",
                  color: "var(--red)",
                  border: `1px solid var(--red)`,
                  fontWeight: 700,
                  flex: 1,
                  fontSize: "14px",
                  transition: "background 0.2s",
                }}
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting
                  ? "..."
                  : confirmingDelete
                  ? `⚠️ ¿Confirmar (${selected.size})?`
                  : `🗑 Eliminar (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Category Modal */}
      {showBulkCategoryModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowBulkCategoryModal(false)}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh", padding: "20px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Asignar Categoría</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "20px" }}>
              Seleccioná la categoría para los {selected.size} productos marcados.
            </p>

            <select
              className="input"
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              style={{ width: "100%", marginBottom: "20px", background: "var(--surface)", cursor: "pointer" }}
            >
              <option value="">Sin categoría (Quitar)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowBulkCategoryModal(false)}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleBulkCategorize} disabled={bulking}>
                {bulking ? "Asignando..." : "Confirmar"}
              </button>
            </div>
          </div>
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
          categories={categories}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); fetchProducts(); }}
        />
      )}
    </div>
    <PrintablePage
      title="Catalogo de productos"
      subtitle={new Date().toLocaleDateString("es-AR")}
      meta={[
        { label: "Items", value: String(filtered.length) },
        { label: "Ocultos", value: String(products.filter((p) => !p.showInGrid).length) },
      ]}
    >
      <section className="print-section">
        <div className="print-section__title">Resumen</div>
        <div className="print-kpis">
          <div className="print-kpi">
            <div className="print-kpi__label">Productos visibles</div>
            <div className="print-kpi__value">
              {products.filter((product) => product.showInGrid).length}
            </div>
            <div className="print-kpi__sub">Disponibles para vender</div>
          </div>
          <div className="print-kpi">
            <div className="print-kpi__label">Filtro actual</div>
            <div className="print-kpi__value">{filtered.length}</div>
            <div className="print-kpi__sub">
              {search ? `Busqueda: "${search}"` : showHidden ? "Incluye ocultos" : "Solo visibles"}
            </div>
          </div>
        </div>
      </section>

      <section className="print-section">
        <div className="print-section__title">Detalle de inventario</div>
        {filtered.length === 0 ? (
          <div className="print-note">No hay productos para imprimir con los filtros actuales.</div>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Codigo / Referencia</th>
                <th>Precio</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const totalStock =
                  product.variants && product.variants.length > 0
                    ? product.variants.reduce((acc, variant) => acc + (variant.stock || 0), 0)
                    : product.stock ?? 0;

                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{product.name}</div>
                      <div style={{ fontSize: "8.5pt", color: "#6b7280" }}>
                        {[product.brand, product.supplierName, product.description].filter(Boolean).join(" · ") ||
                          (product.showInGrid ? "Visible" : "Oculto")}
                      </div>
                    </td>
                    <td>
                      {[product.internalCode, product.barcode, product.presentation].filter(Boolean).join(" · ") || "Sin dato"}
                    </td>
                    <td>{formatARS(product.price)}</td>
                    <td>{totalStock}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </PrintablePage>
    </>
  );
}
