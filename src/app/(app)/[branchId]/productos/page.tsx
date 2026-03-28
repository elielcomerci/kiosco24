"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatARS, applyPercentage } from "@/lib/utils";
import {
  BarcodeLookupResponse,
  BarcodeSuggestion,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import CategoryModal, { type CategoryRecord } from "@/components/config/CategoryModal";
import BackButton from "@/components/ui/BackButton";
import PrintablePage from "@/components/print/PrintablePage";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";

interface Variant {
  id?: string;
  name: string;
  barcode: string | null;
  stock: number | null;
  availableStock?: number | null;
  minStock: number | null;
  expiredQuantity?: number;
  expiringSoonQuantity?: number;
  nextExpiryOn?: string | null;
  hasTrackedLots?: boolean;
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
  availableStock?: number | null;
  minStock: number | null;
  showInGrid: boolean;
  readyForSale?: boolean;
  platformProductId?: string | null;
  expiredQuantity?: number;
  expiringSoonQuantity?: number;
  nextExpiryOn?: string | null;
  hasTrackedLots?: boolean;
  variants?: Variant[];
}

type LotDraft = {
  id?: string;
  quantity: string;
  expiresOn: string;
  existing?: boolean;
};

type ProductModalSavePayload = {
  openStockAfter?: boolean;
  productId?: string;
  productName?: string;
  hasVariants?: boolean;
};

type StockModalPreset = {
  initialSearch?: string;
  initialMode?: "sumar" | "corregir";
  spotlightProductId?: string | null;
  entryNote?: string | null;
};

type Category = CategoryRecord;
const AUTO_SUGGESTED_CATEGORY_COLOR = "#64748b";

const EMOJIS = ["🧃", "🥤", "🍫", "🍬", "🍭", "🥜", "🧀", "🍞", "🥛", "🧹", "🧴", "🪥", "📦", "💊", "🪙", "🎴"];

function lotOwnerKey(productId: string, variantId?: string | null) {
  return variantId ? `variant:${variantId}` : `product:${productId}`;
}

function parseStockQuantity(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function validLotRows(rows: LotDraft[], includeExisting: boolean) {
  return rows.filter((row) => {
    if (!includeExisting && row.existing) {
      return false;
    }

    const quantity = parseStockQuantity(row.quantity);
    return Boolean(quantity && row.expiresOn);
  });
}

function serializeLotRows(rows: LotDraft[] | undefined, includeExisting: boolean) {
  return JSON.stringify(
    validLotRows(rows ?? [], includeExisting).map((row) => ({
      quantity: parseStockQuantity(row.quantity),
      expiresOn: row.expiresOn,
    })),
  );
}

function formatExpiryBadge(product: Product) {
  if ((product.expiredQuantity ?? 0) > 0) {
    return `${product.expiredQuantity} vencido${product.expiredQuantity === 1 ? "" : "s"}`;
  }

  if ((product.expiringSoonQuantity ?? 0) > 0 && product.nextExpiryOn) {
    const formattedDate = new Date(product.nextExpiryOn).toLocaleDateString("es-AR");
    return `${product.expiringSoonQuantity} vence${product.expiringSoonQuantity === 1 ? "" : "n"} ${formattedDate}`;
  }

  return null;
}

function renderExpiryBadge(product: Product) {
  const label = formatExpiryBadge(product);
  if (!label) {
    return null;
  }

  const isExpired = (product.expiredQuantity ?? 0) > 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        color: isExpired ? "var(--red)" : "var(--amber)",
        background: isExpired ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
        border: `1px solid ${isExpired ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
      }}
    >
      {isExpired ? "Vencido" : "Próximo"}
      <span style={{ fontWeight: 600 }}>{label}</span>
    </span>
  );
}

// ─── Product Form Modal ────────────────────────────────────────────────────────
function ProductModal({
  product,
  branchId,
  categories,
  onClose,
  onSave,
  onCategoriesChange,
}: {
  product: Product | null;
  branchId: string;
  categories: Category[];
  onClose: () => void;
  onSave: (payload?: ProductModalSavePayload) => void;
  onCategoriesChange: (categories: Category[]) => void;
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
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(product?.variants || []);
  const [hasVariants, setHasVariants] = useState((product?.variants?.length ?? 0) > 0);
  const [suggestion, setSuggestion] = useState<BarcodeSuggestion | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "ready">("idle");
  const [dismissedSuggestionCode, setDismissedSuggestionCode] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const normalizedBarcode = normalizeBarcodeCode(barcode);
  const productHasTrackedLots = Boolean(product?.hasTrackedLots);
  const lookupCode =
    !hasVariants &&
    canLookupBarcode(normalizedBarcode) &&
    dismissedSuggestionCode !== normalizedBarcode
      ? normalizedBarcode
      : null;
  const visibleSuggestion =
    lookupCode &&
    suggestion &&
    normalizeBarcodeCode(suggestion.code) === lookupCode
      ? suggestion
      : null;
  const effectiveLookupState =
    !lookupCode ? "idle" : visibleSuggestion ? "ready" : lookupState === "loading" ? "loading" : "idle";

  const toNum = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const findCategoryByName = (categoryName: string, sourceCategories: Category[] = categories) => {
    const normalizedCategoryName = categoryName.trim().toLocaleLowerCase("es-AR");
    return (
      sourceCategories.find(
        (category) =>
          category.name.trim().toLocaleLowerCase("es-AR") === normalizedCategoryName,
      ) ?? null
    );
  };

  const refreshCategories = async (selectedCategoryId?: string) => {
    const catRes = await fetch("/api/categorias", {
      headers: { "x-branch-id": branchId },
    });
    if (!catRes.ok) {
      alert("No se pudieron actualizar las categorias.");
      return null;
    }

    const catData = await catRes.json();
    const nextCategories = Array.isArray(catData) ? (catData as Category[]) : [];
    onCategoriesChange(nextCategories);

    if (selectedCategoryId) {
      setCategoryId(selectedCategoryId);
    }

    return nextCategories;
  };

  const ensureSuggestionCategory = async (categoryName: string) => {
    const trimmedCategoryName = categoryName.trim();
    if (!trimmedCategoryName) {
      return null;
    }

    const existingCategory = findCategoryByName(trimmedCategoryName);
    if (existingCategory) {
      setCategoryId(existingCategory.id);
      return existingCategory.id;
    }

    const res = await fetch("/api/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({
        name: trimmedCategoryName,
        color: AUTO_SUGGESTED_CATEGORY_COLOR,
        showInGrid: true,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "No se pudo crear la categoria sugerida.");
    }

    const savedCategory = (await res.json()) as Category;
    await refreshCategories(savedCategory.id);
    return savedCategory.id;
  };

  const applySuggestion = async (nextSuggestion: BarcodeSuggestion) => {
    setApplyingSuggestion(true);

    try {
    const suggestedVariants = (nextSuggestion.variants ?? []).map((variant) => ({
      name: variant.name,
      barcode: variant.barcode,
      stock: null,
      minStock: null,
    }));

      if (nextSuggestion.categoryName) {
        await ensureSuggestionCategory(nextSuggestion.categoryName);
      }

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
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "No se pudo aplicar la sugerencia.");
    } finally {
      setApplyingSuggestion(false);
    }
  };

  useEffect(() => {
    if (!lookupCode) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLookupState("loading");

      try {
        const res = await fetch(`/api/platform-products/lookup?code=${encodeURIComponent(lookupCode)}`);
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
  }, [lookupCode]);

  const handleSave = async (openStockAfter = false) => {
    if (!name.trim()) return;
    setLoading(true);
    setSaveError(null);

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

    try {
      const res = await (isNew ? fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(payload),
      }) : fetch(`/api/productos/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(payload),
      }));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSaveError(data?.error || "No se pudo guardar el producto.");
        return;
      }

      onSave({
        openStockAfter,
        productId: typeof data?.id === "string" ? data.id : product?.id,
        productName: typeof data?.name === "string" ? data.name : name.trim(),
        hasVariants: Array.isArray(data?.variants) ? data.variants.length > 0 : hasVariants,
      });
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo guardar el producto.");
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/productos/${product!.id}`, {
        method: "DELETE",
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSaveError(data?.error || "No se pudo eliminar el producto.");
        return;
      }

      onSave();
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo eliminar el producto.");
      return;
    } finally {
      setLoading(false);
    }
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
          {effectiveLookupState === "loading" && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
              Buscando en la base general...
            </div>
          )}
          {effectiveLookupState === "ready" && visibleSuggestion && (
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
                {visibleSuggestion.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={visibleSuggestion.image ?? undefined}
                    alt={visibleSuggestion.name}
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
                  <div style={{ fontWeight: 700 }}>{visibleSuggestion.name}</div>
                  {(visibleSuggestion.brand || visibleSuggestion.presentation || visibleSuggestion.description) && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      {[suggestion?.brand, suggestion?.presentation, suggestion?.description].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {visibleSuggestion.categoryName && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      Categoria sugerida: {visibleSuggestion.categoryName}
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
                  }}
                >
                  Ocultar
                </button>
                <button
                  className="btn btn-green"
                  style={{ flex: 1 }}
                  onClick={() => visibleSuggestion && void applySuggestion(visibleSuggestion)}
                  disabled={applyingSuggestion}
                >
                  {applyingSuggestion ? "Aplicando..." : "Usar"}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block" }}>
                Categoría
              </label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0 }}
                onClick={() => setShowCategoryModal(true)}
              >
                + Nueva
              </button>
            </div>
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
              disabled={!isNew && productHasTrackedLots}
            />
            Tiene múltiples sabores/variantes
          </label>
          {!isNew && productHasTrackedLots && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--amber)" }}>
              Este producto ya tiene vencimientos cargados. La estructura de variantes queda bloqueada en esta versión.
            </div>
          )}
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
                     disabled={Boolean(v.id && v.hasTrackedLots)}
                     title={v.id && v.hasTrackedLots ? "Quitá los vencimientos desde Cargar stock antes de eliminar esta variante." : undefined}
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
                        disabled={Boolean(v.id && v.hasTrackedLots)}
                      />
                    </div>
                 </div>
                 {v.id && v.hasTrackedLots && (
                   <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--amber)" }}>
                     Esta variante tiene vencimientos cargados. Ajustá su stock desde Cargar stock.
                   </div>
                 )}
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
                  disabled={!isNew && productHasTrackedLots}
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
            {!isNew && productHasTrackedLots && (
              <div style={{ marginTop: "-4px", marginBottom: "12px", fontSize: "12px", color: "var(--amber)" }}>
                Este producto tiene vencimientos cargados. Ajustá el stock desde Cargar stock para no romper el desglose por lotes.
              </div>
            )}

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
              {effectiveLookupState === "loading" && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
                  Buscando datos sugeridos...
                </div>
              )}
              {effectiveLookupState === "ready" && visibleSuggestion && (
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
                    {visibleSuggestion!.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={visibleSuggestion!.image ?? undefined}
                        alt={visibleSuggestion!.name || "Producto"}
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
                      <div style={{ fontWeight: 700 }}>{visibleSuggestion!.name}</div>
                      {(visibleSuggestion!.brand || visibleSuggestion!.presentation || visibleSuggestion!.description) && (
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
                      }}
                    >
                      Ocultar
                    </button>
                    <button
                      className="btn btn-green"
                      style={{ flex: 1 }}
                      onClick={() => {
                        if (visibleSuggestion) {
                          void applySuggestion(visibleSuggestion);
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

        {isNew && (
          <div style={{ marginBottom: "12px", fontSize: "12px", color: "var(--text-3)" }}>
            {hasVariants
              ? "Tip: podés usar Crear y cargar stock para dejar cada variante lista con su stock y vencimientos enseguida."
              : "Tip: podés usar Crear y cargar stock para dejar el producto listo en el mismo flujo."}
          </div>
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
        {saveError && (
          <div style={{ fontSize: "12px", color: "var(--red)", marginBottom: "8px" }}>
            {saveError}
          </div>
        )}
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
          {isNew && (
            <button
              className="btn btn-ghost"
              style={{ flex: 2, border: "1px solid var(--border)" }}
              onClick={() => void handleSave(true)}
              disabled={loading || !name.trim()}
            >
              {loading ? "..." : "Crear y cargar stock"}
            </button>
          )}
          <button
            className="btn btn-green"
            style={{ flex: isNew ? 1.6 : 2 }}
            onClick={() => void handleSave(false)}
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
      {showCategoryModal && (
        <CategoryModal
          category="new"
          onClose={() => setShowCategoryModal(false)}
          onSave={(savedCategory) => {
            setShowCategoryModal(false);
            void refreshCategories(savedCategory?.id ?? undefined);
          }}
        />
      )}
    </div>
  );
}

// ─── StockLoadingModal ────────────────────────────────────────────────────────
function StockLoadingModal({
  products,
  branchId,
  onClose,
  onSaved,
  initialSearch = "",
  initialMode = "sumar",
  spotlightProductId = null,
  entryNote = null,
}: {
  products: Product[];
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
  initialSearch?: string;
  initialMode?: "sumar" | "corregir";
  spotlightProductId?: string | null;
  entryNote?: string | null;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"sumar" | "corregir">(initialMode);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
  const [lotInputs, setLotInputs] = useState<Record<string, LotDraft[]>>({});
  const [loadedLots, setLoadedLots] = useState<Record<string, LotDraft[]>>({});
  const [openLotPanels, setOpenLotPanels] = useState<Record<string, boolean>>({});
  const [lotLoading, setLotLoading] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const eligible = products
    .filter((p) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").includes(q) ||
        (p.internalCode || "").includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.supplierName || "").toLowerCase().includes(q)
      );
    })
    .sort((left, right) => {
      if (!spotlightProductId) {
        return 0;
      }

      if (left.id === spotlightProductId) {
        return -1;
      }

      if (right.id === spotlightProductId) {
        return 1;
      }

      return 0;
    });

  const setQty = (
    key: string,
    val: string,
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => setter((prev) => ({ ...prev, [key]: val }));

  const getInputValue = (productId: string, variantId?: string | null) =>
    variantId ? (variantInputs[variantId] ?? "") : (inputs[productId] ?? "");

  const getRows = (productId: string, variantId?: string | null) =>
    lotInputs[lotOwnerKey(productId, variantId)] ?? [];

  const getLotSum = (productId: string, variantId?: string | null) =>
    validLotRows(getRows(productId, variantId), mode === "corregir")
      .reduce((sum, row) => sum + (parseStockQuantity(row.quantity) ?? 0), 0);

  const computeTargetStock = (currentStock: number | null, productId: string, variantId?: string | null) => {
    const inputVal = getInputValue(productId, variantId);
    const parsedInput = parseStockQuantity(inputVal);
    const lotSum = getLotSum(productId, variantId);

    if (mode === "sumar") {
      const additionWithoutExpiry = parsedInput ?? 0;
      if (additionWithoutExpiry === 0 && lotSum === 0) {
        return null;
      }

      return (currentStock ?? 0) + additionWithoutExpiry + lotSum;
    }

    if (parsedInput !== null) {
      return parsedInput;
    }

    if (lotSum > 0) {
      return currentStock ?? 0;
    }

    return null;
  };

  const getRowError = (currentStock: number | null, productId: string, variantId?: string | null) => {
    if (mode !== "corregir") {
      return null;
    }

    const targetStock = computeTargetStock(currentStock, productId, variantId);
    if (targetStock === null) {
      return null;
    }

    const lotSum = getLotSum(productId, variantId);
    return lotSum > targetStock ? "Los lotes superan el stock final." : null;
  };

  const hasRowChanges = (currentStock: number | null, productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    const inputValue = getInputValue(productId, variantId);
    const currentRows = lotInputs[key];
    const baseline = mode === "corregir" ? serializeLotRows(loadedLots[key], true) : JSON.stringify([]);
    const current = serializeLotRows(currentRows, mode === "corregir");

    return Boolean(
      inputValue.trim() ||
      current !== baseline ||
      (mode === "sumar" && validLotRows(currentRows ?? [], false).length > 0) ||
      (mode === "corregir" && computeTargetStock(currentStock, productId, variantId) !== null && current !== baseline),
    );
  };

  const affectedRows = products.flatMap((product) =>
    product.variants && product.variants.length > 0
      ? product.variants.map((variant) => ({
          product,
          currentStock: variant.stock,
          variantId: variant.id ?? null,
        }))
      : [{ product, currentStock: product.stock, variantId: null }],
  );

  const changesCount = affectedRows.filter((row) =>
    hasRowChanges(row.currentStock, row.product.id, row.variantId),
  ).length;

  const hasInvalidRows = affectedRows.some((row) =>
    Boolean(getRowError(row.currentStock, row.product.id, row.variantId)),
  );

  const loadLots = async (productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    if (loadedLots[key]) {
      setOpenLotPanels((prev) => ({ ...prev, [key]: !prev[key] }));
      return;
    }

    setLotLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams({ productId });
      if (variantId) {
        params.set("variantId", variantId);
      }

      const res = await fetch(`/api/inventario/lotes?${params.toString()}`, {
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json().catch(() => null);
      const mappedLots = Array.isArray(data?.lots)
        ? data.lots.map((lot: { id: string; quantity: number; expiresOn: string }) => ({
            id: lot.id,
            quantity: String(lot.quantity),
            expiresOn: String(lot.expiresOn).slice(0, 10),
            existing: true,
          }))
        : [];

      setLoadedLots((prev) => ({ ...prev, [key]: mappedLots }));
      setLotInputs((prev) => ({ ...prev, [key]: mappedLots }));
      setOpenLotPanels((prev) => ({ ...prev, [key]: true }));
    } finally {
      setLotLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const addLotRow = (productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { quantity: "", expiresOn: "", existing: false }],
    }));
  };

  const updateLotRow = (
    productId: string,
    index: number,
    field: "quantity" | "expiresOn",
    value: string,
    variantId?: string | null,
  ) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const removeLotRow = (productId: string, index: number, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const handleSaveAll = async () => {
    setSaveError(null);
    if (hasInvalidRows) {
      setSaveError("Revisá los productos donde los lotes superan el stock final.");
      return;
    }

    setSaving(true);
    try {
      const items: Array<{
        productId: string;
        variantId?: string;
        quantityWithoutExpiry: number;
        lots: Array<{ quantity: number; expiresOn: string }>;
      }> = [];

      for (const p of products) {
        if (p.variants && p.variants.length > 0) {
          for (const v of p.variants) {
            if (!v.id || !hasRowChanges(v.stock, p.id, v.id)) {
              continue;
            }

            const targetStock = computeTargetStock(v.stock, p.id, v.id);
            const rows = getRows(p.id, v.id);
            const lots = validLotRows(rows, mode === "corregir").map((row) => ({
              quantity: parseStockQuantity(row.quantity) ?? 0,
              expiresOn: row.expiresOn,
            }));
            const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
            const quantityWithoutExpiry =
              mode === "sumar"
                ? (parseStockQuantity(getInputValue(p.id, v.id)) ?? 0)
                : Math.max((targetStock ?? (v.stock ?? 0)) - lotQuantity, 0);

            items.push({
              productId: p.id,
              variantId: v.id,
              quantityWithoutExpiry,
              lots,
            });
          }
        } else {
          if (!hasRowChanges(p.stock, p.id)) {
            continue;
          }

          const targetStock = computeTargetStock(p.stock, p.id);
          const rows = getRows(p.id);
          const lots = validLotRows(rows, mode === "corregir").map((row) => ({
            quantity: parseStockQuantity(row.quantity) ?? 0,
            expiresOn: row.expiresOn,
          }));
          const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
          const quantityWithoutExpiry =
            mode === "sumar"
              ? (parseStockQuantity(getInputValue(p.id)) ?? 0)
              : Math.max((targetStock ?? (p.stock ?? 0)) - lotQuantity, 0);

          items.push({
            productId: p.id,
            quantityWithoutExpiry,
            lots,
          });
        }
      }

      if (items.length === 0) {
        setSaveError("No hay cambios para guardar.");
        return;
      }

      const res = await fetch("/api/inventario/ingreso-rapido", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify({ mode, items }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error || "No se pudieron guardar los cambios de stock.");
        return;
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const renderLotsPanel = (product: Product, currentStock: number | null, variant?: Variant) => {
    const key = lotOwnerKey(product.id, variant?.id);
    const rows = getRows(product.id, variant?.id);
    const existingRows = rows.filter((row) => row.existing);
    const visibleRows = mode === "sumar" ? rows.filter((row) => !row.existing) : rows;
    const rowError = getRowError(currentStock, product.id, variant?.id);

    return (
      <div
        style={{
          marginTop: "10px",
          padding: "12px",
          borderRadius: "12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {mode === "sumar" && existingRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
              Lotes actuales
            </div>
            {existingRows.map((row, index) => (
              <div key={`${key}-current-${index}`} style={{ fontSize: "12px", color: "var(--text-2)" }}>
                {row.quantity} u. → {new Date(`${row.expiresOn}T00:00:00`).toLocaleDateString("es-AR")}
              </div>
            ))}
          </div>
        )}

        {visibleRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {visibleRows.map((row, visibleIndex) => {
              const rowIndex = mode === "sumar"
                ? rows.findIndex((candidate) => candidate === row)
                : visibleIndex;
              return (
                <div key={`${key}-${rowIndex}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    placeholder="Cant."
                    value={row.quantity}
                    onChange={(e) => updateLotRow(product.id, rowIndex, "quantity", e.target.value, variant?.id)}
                    style={{ width: "92px", textAlign: "right" }}
                  />
                  <input
                    className="input"
                    type="date"
                    value={row.expiresOn}
                    onChange={(e) => updateLotRow(product.id, rowIndex, "expiresOn", e.target.value, variant?.id)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ padding: "0 10px" }}
                    onClick={() => removeLotRow(product.id, rowIndex, variant?.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ border: "1px solid var(--border)" }}
            onClick={() => addLotRow(product.id, variant?.id)}
          >
            + Fecha
          </button>
          <span style={{ fontSize: "11px", color: rowError ? "var(--red)" : "var(--text-3)" }}>
            {rowError || (mode === "sumar"
              ? "Los lotes se suman arriba del stock actual."
              : "Si no tocás el total, se usa el stock físico actual.")}
          </span>
        </div>
      </div>
    );
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
        style={{ maxHeight: "92dvh", width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "0", padding: "0", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>📦 Cargar Stock</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Filter + mode */}
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "8px", borderBottom: "1px solid var(--border)" }}>
          <input
            className="input"
            placeholder="🔍 Filtrar por nombre, marca, código, proveedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {entryNote && (
            <div style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>
              {entryNote}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            {(["sumar", "corregir"] as const).map((m) => (
              <button
                key={m}
                className={`btn btn-sm ${mode === m ? "btn-green" : "btn-ghost"}`}
                style={{ flex: 1, fontWeight: 600 }}
                onClick={() => setMode(m)}
              >
                {m === "sumar" ? "➕ Sumar" : "✏️ Establecer"}
              </button>
            ))}
          </div>
          {mode === "sumar" ? (
            <div style={{ fontSize: "11px", color: "var(--text-3)" }}>Ingresá cuántas unidades llegaron. Se suman al stock actual.</div>
          ) : (
            <div style={{ fontSize: "11px", color: "var(--text-3)" }}>Ingresá el stock correcto total. Reemplaza el valor actual.</div>
          )}
        </div>

        {/* Product list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {eligible.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>Sin resultados para &quot;{search}&quot;</div>
          ) : (
            eligible.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "10px 14px",
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {p.emoji && <span style={{ fontSize: "18px" }}>{p.emoji}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    {(p.brand || p.supplierName) && (
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{[p.brand, p.supplierName].filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                </div>

                {/* Simple product */}
                {(!p.variants || p.variants.length === 0) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-3)", flex: 1 }}>
                        Stock físico: {p.stock ?? 0}
                        {typeof p.availableStock === "number" && p.availableStock !== p.stock ? ` · Vendible: ${p.availableStock}` : ""}
                      </span>
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        placeholder={mode === "sumar" ? "+0" : "nuevo"}
                        value={inputs[p.id] ?? ""}
                        onChange={(e) => setQty(p.id, e.target.value, setInputs)}
                        style={{ width: "80px", textAlign: "right" }}
                      />
                      {(() => {
                        const result = computeTargetStock(p.stock, p.id);
                        return result !== null ? (
                          <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--green)", minWidth: "48px" }}>= {result}</span>
                        ) : null;
                      })()}
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ border: "1px solid var(--border)" }}
                        onClick={() => void loadLots(p.id)}
                      >
                        {lotLoading[lotOwnerKey(p.id)] ? "..." : "📅"}
                      </button>
                    </div>
                    {openLotPanels[lotOwnerKey(p.id)] && renderLotsPanel(p, p.stock)}
                  </div>
                )}

                {/* Variants */}
                {p.variants && p.variants.length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {p.variants.map((v) => {
                      const val = v.id ? (variantInputs[v.id] ?? "") : "";
                      const result = v.id ? computeTargetStock(v.stock, p.id, v.id) : null;
                      return (
                        <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)" }}>
                              {v.name} <span style={{ color: "var(--text-3)", fontSize: "11px" }}>({v.stock ?? 0})</span>
                              {typeof v.availableStock === "number" && v.availableStock !== v.stock && (
                                <span style={{ color: "var(--text-3)", fontSize: "11px" }}> · Vendible {v.availableStock}</span>
                              )}
                            </span>
                            <input
                              className="input"
                              type="number"
                              inputMode="numeric"
                              placeholder={mode === "sumar" ? "+0" : "nuevo"}
                              value={val}
                              onChange={(e) => setQty(v.id ?? "", e.target.value, setVariantInputs)}
                              style={{ width: "72px", textAlign: "right" }}
                            />
                            {result !== null && (
                              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", minWidth: "40px" }}>= {result}</span>
                            )}
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ border: "1px solid var(--border)" }}
                              onClick={() => void loadLots(p.id, v.id)}
                            >
                              {lotLoading[lotOwnerKey(p.id, v.id)] ? "..." : "📅"}
                            </button>
                          </div>
                          {openLotPanels[lotOwnerKey(p.id, v.id)] && renderLotsPanel(p, v.stock, v)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)", flex: 1 }}>
            {changesCount > 0 ? `${changesCount} cambio${changesCount !== 1 ? "s" : ""} pendiente${changesCount !== 1 ? "s" : ""}` : "Sin cambios"}
          </span>
          {saveError && (
            <span style={{ fontSize: "12px", color: "var(--red)", flex: 1.2 }}>
              {saveError}
            </span>
          )}
          <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-green"
            style={{ flexShrink: 0 }}
            onClick={handleSaveAll}
            disabled={saving || changesCount === 0 || hasInvalidRows}
          >
            {saving ? "Guardando..." : `Guardar${changesCount > 0 ? ` (${changesCount})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ReplicarModal ────────────────────────────────────────────────────────────
type Collision = { productId: string; branchId: string; productName: string; branchName: string; emoji: string | null };

function ReplicarModal({
  products,
  branches,
  sourceBranchId,
  onClose,
  onDone,
}: {
  products: Product[];
  branches: { id: string; name: string }[];
  sourceBranchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [copyPrice, setCopyPrice] = useState(true);
  const [copyStock, setCopyStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [overwriteConfig, setOverwriteConfig] = useState<Record<string, "overwrite" | "skip">>({});

  const toggleBranch = (id: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReplicar = async () => {
    if (selectedBranches.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inventario/replicar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": sourceBranchId },
        body: JSON.stringify({
          productIds: products.map((p) => p.id),
          targetBranchIds: Array.from(selectedBranches),
          copyPrice,
          copyStock,
          overwriteConfig: Object.keys(overwriteConfig).length > 0 ? overwriteConfig : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Error al replicar");
        return;
      }
      
      const data = await res.json();
      if (data.requiresConfirmation && data.collisions) {
        setCollisions(data.collisions);
        // Pre-fill everything with 'skip' by default to prevent accidental overrides
        const initialConfig: Record<string, "overwrite" | "skip"> = {};
        for (const c of data.collisions as Collision[]) {
          initialConfig[`${c.productId}:${c.branchId}`] = "skip";
        }
        setOverwriteConfig((prev) => ({ ...initialConfig, ...prev }));
      } else {
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (collisions.length > 0 && !done) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--red)" }}>⚠️ Algunos ya existen</h2>
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px", lineHeight: 1.4 }}>
              Intentás enviar productos que ya existen en la base de datos de destino. ¿Qué hacemos con ellos?
            </p>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "40dvh", paddingRight: "4px" }}>
            {collisions.map((c) => {
              const key = `${c.productId}:${c.branchId}`;
              const action = overwriteConfig[key] || "skip";
              return (
                <div key={key} style={{ border: `2px solid ${action === "overwrite" ? "var(--red)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "12px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: "8px", transition: "all 0.2s" }}>
                  <div style={{ fontSize: "14px", lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{c.emoji ? `${c.emoji} ` : ""}{c.productName}</span> 
                    <span style={{ color: "var(--text-3)" }}> en </span> 
                    <span style={{ fontWeight: 600 }}>{c.branchName}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button 
                      className={`btn btn-sm ${action === "skip" ? "btn-outline" : "btn-ghost"}`} 
                      style={{ flex: 1, borderColor: action === "skip" ? "var(--text-2)" : undefined, color: action === "skip" ? "var(--text-1)" : "var(--text-3)" }}
                      onClick={() => setOverwriteConfig(prev => ({ ...prev, [key]: "skip" }))}
                    >
                      Saltar (Conservar)
                    </button>
                    <button 
                      className={`btn btn-sm ${action === "overwrite" ? "btn-outline" : "btn-ghost"}`} 
                      style={{ flex: 1, borderColor: action === "overwrite" ? "var(--red)" : undefined, color: action === "overwrite" ? "var(--red)" : "var(--text-3)" }}
                      onClick={() => setOverwriteConfig(prev => ({ ...prev, [key]: "overwrite" }))}
                    >
                      Sobrescribir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCollisions([])}>Volver</button>
            <button className="btn btn-green" style={{ flex: 2 }} onClick={handleReplicar} disabled={loading}>
              {loading ? "Replicando..." : "Confirmar y Replicar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>↗ Replicar catálogo</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
            <div style={{ fontWeight: 700 }}>{products.length} productos procesados</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "8px" }}>Las sucursales seleccionadas han sido actualizadas.</div>
            <button className="btn btn-green" style={{ marginTop: "16px", width: "100%" }} onClick={onDone}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "14px", color: "var(--text-2)" }}>
              Replicar <strong>{products.length}</strong> producto{products.length !== 1 ? "s" : ""} a:
            </div>

            {branches.map((b) => (
              <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", border: `2px solid ${selectedBranches.has(b.id) ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", cursor: "pointer", background: selectedBranches.has(b.id) ? "rgba(var(--primary-rgb,34,197,94),.08)" : "var(--surface)" }}>
                <input type="checkbox" checked={selectedBranches.has(b.id)} onChange={() => toggleBranch(b.id)} />
                <span style={{ fontWeight: 600 }}>{b.name}</span>
              </label>
            ))}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input type="checkbox" checked={copyPrice} onChange={(e) => setCopyPrice(e.target.checked)} />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>{copyPrice ? "✅ Sincronizar" : "❌ No sincronizar"} precio actual</span>
              </label>
              
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input type="checkbox" checked={copyStock} onChange={(e) => setCopyStock(e.target.checked)} />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>{copyStock ? "✅ Usar" : "❌ Empezará en 0"} stock actual como valor inicial</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleReplicar} disabled={loading || selectedBranches.size === 0}>
                {loading ? "Replicando..." : `Replicar a ${selectedBranches.size} sucursal${selectedBranches.size !== 1 ? "es" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TransferirStockModal ─────────────────────────────────────────────────────
function TransferirStockModal({
  products,
  branches,
  sourceBranchId,
  onClose,
  onDone,
}: {
  products: Product[];
  branches: { id: string; name: string }[];
  sourceBranchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [targetBranchId, setTargetBranchId] = useState(branches[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [variantQty, setVariantQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQty = (key: string, val: string, setter: React.Dispatch<React.SetStateAction<Record<string, string>>>) =>
    setter((prev) => ({ ...prev, [key]: val }));

  const buildItems = () => {
    const items: { productId: string; variantId?: string; quantity: number }[] = [];
    for (const p of products) {
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const qty = parseInt(variantQty[v.id ?? ""] ?? "0");
          if (qty > 0) items.push({ productId: p.id, variantId: v.id, quantity: qty });
        }
      } else {
        const qty = parseInt(quantities[p.id] ?? "0");
        if (qty > 0) items.push({ productId: p.id, quantity: qty });
      }
    }
    return items;
  };

  const totalItems = buildItems().length;

  const handleTransferir = async () => {
    const items = buildItems();
    if (items.length === 0 || !targetBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventario/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": sourceBranchId },
        body: JSON.stringify({ items, targetBranchId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Error al transferir");
      } else {
        onDone();
      }
    } finally {
      setLoading(false);
    }
  };

  const productsWithStock = products.filter((p) => {
    if (p.variants && p.variants.length > 0) return p.variants.some((v) => (v.stock ?? 0) > 0);
    return (p.stock ?? 0) > 0;
  });

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>⇄ Transferir Stock</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Sucursal destino</label>
          <select className="input" value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} style={{ width: "100%", background: "var(--surface)", cursor: "pointer" }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Cantidad a transferir</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "320px" }}>
          {productsWithStock.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", background: "var(--surface)" }}>
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</div>
              {p.variants && p.variants.length > 0 ? (
                p.variants.filter((v) => (v.stock ?? 0) > 0).map((v) => {
                  const qty = parseInt(variantQty[v.id ?? ""] ?? "0");
                  const maxStock = v.stock ?? 0;
                  const isOver = qty > maxStock;
                  return (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)" }}>{v.name} <span style={{ color: "var(--text-3)" }}>(stock: {maxStock})</span></span>
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={maxStock}
                        placeholder="0"
                        value={variantQty[v.id ?? ""] ?? ""}
                        onChange={(e) => setQty(v.id ?? "", e.target.value, setVariantQty)}
                        style={{ width: "72px", textAlign: "right", borderColor: isOver ? "var(--red)" : undefined }}
                      />
                    </div>
                  );
                })
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ flex: 1, fontSize: "13px", color: "var(--text-3)" }}>Stock disponible: {p.stock}</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={p.stock ?? 0}
                    placeholder="0"
                    value={quantities[p.id] ?? ""}
                    onChange={(e) => setQty(p.id, e.target.value, setQuantities)}
                    style={{ width: "72px", textAlign: "right", borderColor: parseInt(quantities[p.id] ?? "0") > (p.stock ?? 0) ? "var(--red)" : undefined }}
                  />
                </div>
              )}
            </div>
          ))}
          {productsWithStock.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-3)" }}>No hay productos con stock para transferir</div>
          )}
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: "13px", padding: "8px 12px", background: "rgba(239,68,68,.1)", borderRadius: "var(--radius-sm)" }}>{error}</div>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-green" style={{ flex: 2 }} onClick={handleTransferir} disabled={loading || totalItems === 0 || !targetBranchId}>
            {loading ? "Transfiriendo..." : `Transferir ${totalItems > 0 ? `(${totalItems} ítem${totalItems !== 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Products Page ────────────────────────────────────────────────────────
export default function ProductosPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";

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

  // ─── Multi-branch state
  interface Branch { id: string; name: string; }
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockModalPreset, setStockModalPreset] = useState<StockModalPreset | null>(null);
  const [showReplicarModal, setShowReplicarModal] = useState(false);
  const [showTransferirModal, setShowTransferirModal] = useState(false);

  const fetchBranches = useCallback(async () => {
    if (branchesLoaded) return;
    try {
      const res = await fetch("/api/branches", { headers: { "x-branch-id": branchId } });
      if (res.ok) {
        const data = await res.json();
        setBranches(Array.isArray(data) ? data : []);
      }
    } finally {
      setBranchesLoaded(true);
    }
  }, [branchId, branchesLoaded]);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);

  const pctMatch = parseInt(percentStr, 10);
  const percent = isNaN(pctMatch) ? 0 : pctMatch;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    // We use showInGrid=false to get ALL products (including hidden)
    const res = await fetch("/api/productos?all=1", {
      headers: { "x-branch-id": branchId },
    });
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    
    // Fetch categories para pasarlas al modal y mostrarlas
    const catRes = await fetch("/api/categorias", {
      headers: { "x-branch-id": branchId },
    });
    const catData = await catRes.json();
    setCategories(Array.isArray(catData) ? catData : []);

    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchProducts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchProducts]);

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
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
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
        fetch(`/api/productos/${id}`, {
          method: "DELETE",
          headers: { "x-branch-id": branchId },
        })
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
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
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

  const handleProductModalSave = async (payload?: ProductModalSavePayload) => {
    setModal(null);
    await fetchProducts();

    if (payload?.openStockAfter && payload.productId) {
      setStockModalPreset({
        initialSearch: payload.productName ?? "",
        initialMode: "corregir",
        spotlightProductId: payload.productId,
        entryNote: payload.hasVariants
          ? "Producto creado. Definí el stock final y, si querés, cargá vencimientos por variante."
          : "Producto creado. Definí el stock final y, si querés, cargá vencimientos ahora.",
      });
      setShowStockModal(true);
      return;
    }

    setStockModalPreset(null);
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
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!selectionMode && (
            <>
              <button
                className="btn btn-sm btn-ghost"
                style={{ border: "1px solid var(--border)", fontWeight: 600 }}
                onClick={() => {
                  setStockModalPreset(null);
                  setShowStockModal(true);
                }}
                title="Cargar stock"
              >📦 Stock</button>
              {isOwner && branches.length > 1 && (
                <>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600 }}
                    onClick={() => setShowReplicarModal(true)}
                    title="Replicar productos a otra sucursal"
                  >↗ Replicar</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600 }}
                    onClick={() => setShowTransferirModal(true)}
                    title="Transferir stock entre sucursales"
                  >⇄ Transferir</button>
                </>
              )}
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
            const expiryBadge = renderExpiryBadge(p);
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
                  {expiryBadge}
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
                  {expiryBadge}
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
          branchId={branchId}
          categories={categories}
          onClose={() => setModal(null)}
          onSave={handleProductModalSave}
          onCategoriesChange={setCategories}
        />
      )}

      {/* ─── StockLoadingModal ──────────────────────────────────────────────── */}
      {showStockModal && (() => {
        // Products eligible: all visible (+ those with stock even if hidden)
        const stockProducts = products;
        return (
          <StockLoadingModal
            products={stockProducts}
            branchId={branchId}
            onClose={() => {
              setShowStockModal(false);
              setStockModalPreset(null);
            }}
            onSaved={fetchProducts}
            initialSearch={stockModalPreset?.initialSearch}
            initialMode={stockModalPreset?.initialMode}
            spotlightProductId={stockModalPreset?.spotlightProductId}
            entryNote={stockModalPreset?.entryNote}
          />
        );
      })()}

      {/* ─── ReplicarModal ──────────────────────────────────────────────────── */}
      {showReplicarModal && (
        <ReplicarModal
          products={selectionMode && selected.size > 0 ? products.filter(p => selected.has(p.id)) : filtered}
          branches={branches.filter(b => b.id !== branchId)}
          sourceBranchId={branchId}
          onClose={() => setShowReplicarModal(false)}
          onDone={() => { setShowReplicarModal(false); fetchProducts(); }}
        />
      )}

      {/* ─── TransferirStockModal ───────────────────────────────────────────── */}
      {showTransferirModal && (
        <TransferirStockModal
          products={selectionMode && selected.size > 0 ? products.filter(p => selected.has(p.id)) : filtered}
          branches={branches.filter(b => b.id !== branchId)}
          sourceBranchId={branchId}
          onClose={() => setShowTransferirModal(false)}
          onDone={() => { setShowTransferirModal(false); fetchProducts(); }}
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
