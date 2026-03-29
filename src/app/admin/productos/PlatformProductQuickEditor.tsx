"use client";

import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import ModalPortal from "@/components/ui/ModalPortal";
import { optimizeProductImage } from "@/lib/image-upload";

type PlatformProductStatusValue = "APPROVED" | "HIDDEN";

interface PlatformProductQuickEditorVariant {
  id?: string;
  name: string;
  barcode: string | null;
}

export interface PlatformProductQuickEditorItem {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  categoryName: string | null;
  presentation: string | null;
  description: string | null;
  image: string | null;
  status: PlatformProductStatusValue;
  variants: PlatformProductQuickEditorVariant[];
}

type SearchFilter =
  | "ALL"
  | "APPROVED"
  | "HIDDEN"
  | "WITH_VARIANTS"
  | "MISSING_IMAGE"
  | "MISSING_DESCRIPTION"
  | "MISSING_BRAND";

interface DraftState {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  categoryName: string;
  presentation: string;
  description: string;
  image: string;
  status: PlatformProductStatusValue;
  variants: PlatformProductQuickEditorVariant[];
}

function buildDraft(product?: PlatformProductQuickEditorItem | null, barcodeHint?: string): DraftState {
  const usesVariants = (product?.variants.length ?? 0) > 0;

  return {
    id: product?.id ?? "",
    barcode: usesVariants ? "" : product?.barcode ?? barcodeHint ?? "",
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    categoryName: product?.categoryName ?? "",
    presentation: product?.presentation ?? "",
    description: product?.description ?? "",
    image: product?.image ?? "",
    status: product?.status ?? "APPROVED",
    variants:
      product?.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        barcode: variant.barcode,
      })) ?? [],
  };
}

function looksLikeBarcode(value: string) {
  return /^\d{8,14}$/.test(value.trim());
}

const FIELD_LABELS: Record<string, string> = {
  barcode: "Codigo base",
  name: "Nombre",
  brand: "Marca",
  categoryName: "Categoria",
  presentation: "Presentacion",
  description: "Descripcion",
  image: "Imagen",
  status: "Estado",
  variants: "Variantes",
};

const LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "los", "y", "en", "con", "sin", "para", "por"]);
const LOWERCASE_UNITS = new Set(["ml", "l", "cc", "g", "gr", "kg", "u", "un"]);

function normalizeTextSpacing(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hasText(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}

function formatCatalogWord(word: string, index: number): string {
  const clean = word.trim();
  if (!clean) {
    return clean;
  }

  if (/\d/.test(clean)) {
    return clean;
  }

  if (clean.includes("/")) {
    return clean
      .split("/")
      .map((chunk, chunkIndex) => formatCatalogWord(chunk, index === 0 && chunkIndex === 0 ? 0 : 1))
      .join("/");
  }

  if (clean.includes("-")) {
    return clean
      .split("-")
      .map((chunk, chunkIndex) => formatCatalogWord(chunk, index === 0 && chunkIndex === 0 ? 0 : 1))
      .join("-");
  }

  const lower = clean.toLocaleLowerCase("es-AR");
  if (LOWERCASE_UNITS.has(lower)) {
    return lower;
  }

  if (clean === clean.toUpperCase() && clean.length <= 4) {
    return clean.toUpperCase();
  }

  if (index > 0 && LOWERCASE_WORDS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function smartTitleCase(value: string): string {
  return normalizeTextSpacing(value)
    .split(" ")
    .map((word, index) => formatCatalogWord(word, index))
    .join(" ");
}

function normalizeDraft(draft: DraftState): DraftState {
  return {
    ...draft,
    barcode: draft.barcode.trim(),
    name: smartTitleCase(draft.name),
    brand: smartTitleCase(draft.brand),
    categoryName: smartTitleCase(draft.categoryName),
    presentation: normalizeTextSpacing(draft.presentation),
    description: normalizeTextSpacing(draft.description),
    image: draft.image.trim(),
    variants: draft.variants.map((variant) => ({
      ...variant,
      name: smartTitleCase(variant.name),
      barcode: variant.barcode?.trim() || null,
    })),
  };
}

function compareDrafts(current: DraftState, baseline: DraftState) {
  const normalizedCurrent = normalizeDraft(current);
  const normalizedBaseline = normalizeDraft(baseline);
  const changed: string[] = [];

  (["barcode", "name", "brand", "categoryName", "presentation", "description", "image", "status"] as const).forEach((field) => {
    if (normalizedCurrent[field] !== normalizedBaseline[field]) {
      changed.push(field);
    }
  });

  if (JSON.stringify(normalizedCurrent.variants) !== JSON.stringify(normalizedBaseline.variants)) {
    changed.push("variants");
  }

  return changed;
}

function FieldGroup({
  label,
  changed,
  hint,
  children,
}: {
  label: string;
  changed?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {label}
        </span>
        {changed && (
          <span
            style={{
              fontSize: "11px",
              color: "#38bdf8",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "999px",
              background: "rgba(56,189,248,.12)",
              border: "1px solid rgba(56,189,248,.18)",
            }}
          >
            Cambio
          </span>
        )}
      </div>
      {children}
      {hint && <span style={{ fontSize: "12px", color: "#94a3b8" }}>{hint}</span>}
    </label>
  );
}

export default function PlatformProductQuickEditor({
  products,
}: {
  products: PlatformProductQuickEditorItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("ALL");
  const [draft, setDraft] = useState<DraftState>(() => buildDraft());
  const [baselineDraft, setBaselineDraft] = useState<DraftState>(() => buildDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<"search" | "barcode" | null>(null);
  const [isPending, startTransition] = useTransition();
  const usesVariants = draft.variants.length > 0;
  const editParam = searchParams.get("edit");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    switch (searchFilter) {
      case "APPROVED":
        return products.filter((product) => product.status === "APPROVED");
      case "HIDDEN":
        return products.filter((product) => product.status === "HIDDEN");
      case "WITH_VARIANTS":
        return products.filter((product) => product.variants.length > 0);
      case "MISSING_IMAGE":
        return products.filter((product) => !hasText(product.image));
      case "MISSING_DESCRIPTION":
        return products.filter((product) => !hasText(product.description));
      case "MISSING_BRAND":
        return products.filter((product) => !hasText(product.brand));
      default:
        return products;
    }
  }, [products, searchFilter]);
  const matches = useMemo(() => {
    if (!normalizedSearch) {
      return filteredProducts;
    }

    return filteredProducts
      .map((product) => {
        const variantHaystack = product.variants
          .flatMap((variant) => [variant.name, variant.barcode ?? ""])
          .join(" ");
        const haystack = [
          product.barcode ?? "",
          product.name,
          product.brand ?? "",
          product.categoryName ?? "",
          product.presentation ?? "",
          product.description ?? "",
          variantHaystack,
        ]
          .join(" ")
          .toLowerCase();

        const exactBarcode =
          product.barcode === search.trim() || product.variants.some((variant) => variant.barcode === search.trim());
        const exactName = product.name.toLowerCase() === normalizedSearch;
        const startsWithName = product.name.toLowerCase().startsWith(normalizedSearch);
        const startsWithBarcode =
          (product.barcode ?? "").startsWith(search.trim()) ||
          product.variants.some((variant) => (variant.barcode ?? "").startsWith(search.trim()));

        if (exactBarcode) return { product, score: 0 };
        if (exactName) return { product, score: 1 };
        if (startsWithName) return { product, score: 2 };
        if (startsWithBarcode) return { product, score: 3 };
        if (haystack.includes(normalizedSearch)) return { product, score: 10 };
        return null;
      })
      .filter((item): item is { product: PlatformProductQuickEditorItem; score: number } => Boolean(item))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.product.name.localeCompare(right.product.name, "es");
      })
      .map((item) => item.product);
  }, [filteredProducts, normalizedSearch, search]);

  const exactBarcodeMatch = useMemo(() => {
    const trimmed = search.trim();
    if (!looksLikeBarcode(trimmed)) {
      return null;
    }

    return (
      products.find(
        (product) =>
          product.barcode === trimmed ||
          product.variants.some((variant) => variant.barcode === trimmed),
      ) ?? null
    );
  }, [products, search]);

  const loadProduct = (product: PlatformProductQuickEditorItem) => {
    const nextDraft = buildDraft(product);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setSearch(product.barcode ?? product.variants[0]?.barcode ?? product.name);
    setMessage(null);
    setError(null);
    setEditorOpen(true);
  };

  const startNewDraft = (barcodeHint?: string) => {
    const nextDraft = buildDraft(null, barcodeHint);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setMessage(null);
    setError(null);
    setEditorOpen(true);
    if (editParam) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("edit");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}#editor-rapido` : `${pathname}#editor-rapido`, { scroll: false });
    }
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setScannerTarget(null);
    if (editParam) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("edit");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}#editor-rapido` : `${pathname}#editor-rapido`, { scroll: false });
    }
  };

  useEffect(() => {
    if (!editParam) {
      return;
    }

    const product = products.find((item) => item.id === editParam);
    if (!product) {
      return;
    }

    const nextDraft = buildDraft(product);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setSearch(product.barcode ?? product.variants[0]?.barcode ?? product.name);
    setMessage(null);
    setError(null);
    setEditorOpen(true);
  }, [editParam, products]);

  const handleChange = (field: keyof Omit<DraftState, "variants">, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateVariant = (index: number, field: keyof PlatformProductQuickEditorVariant, value: string) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index
          ? {
              ...variant,
              [field]: field === "barcode" ? (value.trim() ? value : null) : value,
            }
          : variant,
      ),
    }));
  };

  const normalizeField = (field: keyof Omit<DraftState, "variants" | "id" | "status">) => {
    setDraft((current) => {
      const next = { ...current };

      if (field === "barcode" || field === "image") {
        next[field] = current[field].trim();
      } else if (field === "presentation" || field === "description") {
        next[field] = normalizeTextSpacing(current[field]);
      } else {
        next[field] = smartTitleCase(current[field]);
      }

      return next;
    });
  };

  const addVariant = () => {
    setDraft((current) => ({
      ...current,
      barcode: "",
      variants: [...current.variants, { name: "", barcode: null }],
    }));
  };

  const handleImageUpload = async (file: File) => {
    setError(null);
    setMessage(null);
    setUploadingImage(true);

    try {
      const optimizedFile = await optimizeProductImage(file);
      const formData = new FormData();
      formData.append("file", optimizedFile);
      formData.append("folder", "products");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "No se pudo subir la imagen.");
        return;
      }

      if (typeof data?.secure_url !== "string" || !data.secure_url) {
        setError("La subida no devolvio una URL valida.");
        return;
      }

      setDraft((current) => ({
        ...current,
        image: data.secure_url,
      }));
      setMessage("Imagen cargada. Guarda la ficha para publicarla.");
    } catch (uploadError) {
      console.error(uploadError);
      setError("No se pudo subir la imagen.");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeVariant = (index: number) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  };

  const handleSubmit = () => {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const normalizedDraft = normalizeDraft(draft);
        setDraft(normalizedDraft);
        const res = await fetch("/api/admin/platform-products", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...normalizedDraft,
            barcode: usesVariants ? null : normalizedDraft.barcode.trim() || null,
            variants: normalizedDraft.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              barcode: variant.barcode,
            })),
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "No se pudo guardar el producto.");
          return;
        }

        const savedProduct = data?.product as PlatformProductQuickEditorItem | undefined;
        const nextDraft = savedProduct ? buildDraft(savedProduct) : normalizedDraft;
        setDraft(nextDraft);
        setBaselineDraft(nextDraft);
        if (savedProduct) {
          setSearch(savedProduct.barcode ?? savedProduct.variants[0]?.barcode ?? savedProduct.name);
        }
        setMessage(draft.id ? "Producto actualizado." : "Producto global creado.");
        closeEditor();
        router.refresh();
      } catch (err) {
        console.error(err);
        setError("No se pudo guardar el producto.");
      }
    });
  };

  const canSave =
    draft.name.trim().length > 0 &&
    (draft.barcode.trim().length > 0 || draft.variants.some((variant) => variant.barcode?.trim()));
  const changedFields = useMemo(() => compareDrafts(draft, baselineDraft), [baselineDraft, draft]);
  const changedFieldSet = useMemo(() => new Set(changedFields), [changedFields]);
  const changedLabels = changedFields.map((field) => FIELD_LABELS[field] ?? field);
  const visibleProductsCount = filteredProducts.length;
  const hasDraftContext =
    Boolean(draft.id) ||
    draft.name.trim().length > 0 ||
    draft.barcode.trim().length > 0 ||
    draft.image.trim().length > 0 ||
    draft.variants.length > 0;

  return (
    <>
      <section
        id="editor-rapido"
        style={{
          background: "rgba(15,23,42,.82)",
          border: "1px solid rgba(148,163,184,.18)",
          borderRadius: "22px",
          padding: "20px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "24px" }}>Editor rapido</h2>
            <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
              Busca, corrige y publica desde una sola ficha.
            </div>
            {(message || error) && (
              <div style={{ color: error ? "#fca5a5" : "#86efac", fontSize: "13px", marginTop: "8px" }}>
                {error || message}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => startNewDraft(search.trim())}>
            Nuevo
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gap: "10px",
              alignContent: "start",
            }}
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                className="input"
                placeholder="Buscar por codigo o nombre"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) {
                    e.preventDefault();
                    loadProduct(matches[0]);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minWidth: "52px", paddingInline: "12px" }}
                onClick={() => setScannerTarget("search")}
                title="Escanear para buscar"
              >
                |||
              </button>
            </div>

            <div style={{ color: "#94a3b8", fontSize: "13px" }}>
              {normalizedSearch
                ? `${matches.length} resultado${matches.length === 1 ? "" : "s"} rapidos`
                : `${visibleProductsCount} ficha${visibleProductsCount === 1 ? "" : "s"} en este filtro`}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { value: "ALL", label: "Todo" },
                { value: "APPROVED", label: "Aprobados" },
                { value: "HIDDEN", label: "Ocultos" },
                { value: "WITH_VARIANTS", label: "Con variantes" },
                { value: "MISSING_IMAGE", label: "Sin foto" },
                { value: "MISSING_DESCRIPTION", label: "Sin descripcion" },
                { value: "MISSING_BRAND", label: "Sin marca" },
              ].map((option) => {
                const active = searchFilter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? "btn btn-secondary" : "btn btn-ghost"}
                    style={{ padding: "8px 12px" }}
                    onClick={() => setSearchFilter(option.value as SearchFilter)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {!exactBarcodeMatch && looksLikeBarcode(search.trim()) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => startNewDraft(search.trim())}
                style={{ justifyContent: "flex-start" }}
              >
                Crear nuevo con codigo {search.trim()}
              </button>
            )}

            <div style={{ display: "grid", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
              {matches.map((product) => {
                const isActive = draft.id === product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => loadProduct(product)}
                    style={{
                      display: "grid",
                      gap: "4px",
                      textAlign: "left",
                      padding: "12px",
                      borderRadius: "14px",
                      border: `1px solid ${isActive ? "#22c55e" : "rgba(148,163,184,.18)"}`,
                      background: isActive ? "rgba(34,197,94,.12)" : "rgba(30,41,59,.8)",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                      {product.barcode || product.variants[0]?.barcode || "Sin barcode base"}
                      {product.brand ? ` | ${product.brand}` : ""}
                      {product.categoryName ? ` | ${product.categoryName}` : ""}
                    </div>
                    {product.variants.length > 0 && (
                      <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                        {product.variants.length} variante{product.variants.length === 1 ? "" : "s"}
                      </div>
                    )}
                    <div style={{ fontSize: "12px", color: product.status === "HIDDEN" ? "#fca5a5" : "#86efac" }}>
                      {product.status === "HIDDEN" ? "Oculto" : "Aprobado"}
                    </div>
                  </button>
                );
              })}

              {matches.length === 0 && (
                <div style={{ color: "#94a3b8", fontSize: "14px" }}>No hay productos que coincidan.</div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "12px",
              alignContent: "start",
              padding: "18px",
              borderRadius: "18px",
              background: "rgba(30,41,59,.55)",
              border: "1px dashed rgba(148,163,184,.18)",
              color: "#cbd5e1",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "18px" }}>
              {draft.id ? "Ficha lista para editar" : "Abrir editor"}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.6 }}>
              Elegi un producto de la lista o crea uno nuevo. La ficha se abre en un modal para editar rapido y se cierra sola al guardar.
            </div>
            {hasDraftContext ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(true)}>
                  {draft.id ? "Seguir editando" : "Abrir borrador"}
                </button>
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                Usa <strong style={{ color: "#e2e8f0" }}>Nuevo</strong> o toca una ficha del lateral para abrir el editor.
              </div>
            )}
          </div>
        </div>
      </section>

      {editorOpen && (
        <ModalPortal>
          <div className="modal-overlay" onClick={closeEditor} style={{ padding: "20px" }}>
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(960px, 100%)",
                maxHeight: "calc(100vh - 40px)",
                overflowY: "auto",
                borderRadius: "24px",
                padding: "20px",
                background: "linear-gradient(180deg, rgba(15,23,42,.98), rgba(2,6,23,.98))",
                border: "1px solid rgba(148,163,184,.18)",
                boxShadow: "0 30px 80px rgba(2,6,23,.55)",
                display: "grid",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "22px" }}>
                    {draft.id ? "Editar producto global" : "Nuevo producto global"}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                    La ficha se guarda y vuelve sola al listado.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeEditor}
                  disabled={isPending || uploadingImage}
                >
                  Cerrar
                </button>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                padding: "14px 16px",
                borderRadius: "16px",
                background: "rgba(30,41,59,.8)",
                border: "1px solid rgba(148,163,184,.12)",
              }}
            >
              <label
                style={{
                  position: "relative",
                  width: "72px",
                  height: "72px",
                  borderRadius: "18px",
                  border: "1px dashed rgba(148,163,184,.18)",
                  background: "rgba(2,6,23,.5)",
                  overflow: "hidden",
                  cursor: uploadingImage ? "progress" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                title="Subir imagen"
              >
                {draft.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.image}
                    alt={draft.name || "Producto global"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : uploadingImage ? (
                  <span style={{ color: "#cbd5e1", fontSize: "12px", fontWeight: 700 }}>...</span>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textAlign: "center", padding: "8px" }}>
                    Subir foto
                  </span>
                )}

                <input
                  type="file"
                  accept="image/*"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: uploadingImage ? "progress" : "pointer" }}
                  disabled={uploadingImage}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      await handleImageUpload(file);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: "18px" }}>
                  {draft.name.trim() || "Producto nuevo"}
                </div>
                <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
                  {draft.id ? "Editando ficha global" : "Creando ficha global"}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: draft.status === "HIDDEN" ? "rgba(248,113,113,.12)" : "rgba(34,197,94,.12)",
                      color: draft.status === "HIDDEN" ? "#fca5a5" : "#86efac",
                      border: "1px solid rgba(148,163,184,.16)",
                    }}
                  >
                    {draft.status === "HIDDEN" ? "Oculto" : "Aprobado"}
                  </span>
                  {draft.variants.length > 0 && (
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: "rgba(56,189,248,.12)",
                        color: "#7dd3fc",
                        border: "1px solid rgba(56,189,248,.18)",
                      }}
                    >
                      {draft.variants.length} variante{draft.variants.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div style={{ color: "#cbd5e1", fontSize: "13px", marginTop: "6px", lineHeight: 1.5 }}>
                  Se sincronizan foto y textos. Stock y precios quedan en cada kiosco.
                </div>
                <div style={{ color: uploadingImage ? "#7dd3fc" : "#94a3b8", fontSize: "12px", marginTop: "6px" }}>
                  {uploadingImage ? "Subiendo imagen optimizada..." : "Toca la miniatura para subir una foto nueva."}
                </div>
              </div>
            </div>

            {changedFields.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(8,47,73,.55)",
                  border: "1px solid rgba(56,189,248,.18)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#e0f2fe" }}>Cambios sin guardar</div>
                    <div style={{ color: "#bae6fd", fontSize: "13px", marginTop: "4px" }}>
                      Comparado contra el ultimo guardado de esta ficha.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setDraft(normalizeDraft(draft))}
                    >
                      Normalizar textos
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setDraft(baselineDraft);
                        setMessage(null);
                        setError(null);
                      }}
                    >
                      Volver al ultimo guardado
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {changedLabels.map((label) => (
                    <span
                      key={label}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: "rgba(255,255,255,.08)",
                        border: "1px solid rgba(186,230,253,.18)",
                        color: "#e2e8f0",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <FieldGroup
                label={FIELD_LABELS.barcode}
                changed={changedFieldSet.has("barcode")}
                hint={usesVariants ? "Con variantes, el codigo principal se limpia." : undefined}
              >
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="input"
                    placeholder={usesVariants ? "Se limpia al usar variantes" : "Codigo de barras base"}
                    value={draft.barcode}
                    onChange={(e) => handleChange("barcode", e.target.value)}
                    disabled={usesVariants}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minWidth: "52px", paddingInline: "12px" }}
                    onClick={() => setScannerTarget("barcode")}
                    title="Escanear codigo principal"
                    disabled={usesVariants}
                  >
                    |||
                  </button>
                </div>
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.name} changed={changedFieldSet.has("name")}>
                <input
                  className="input"
                  placeholder="Nombre del producto"
                  value={draft.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  onBlur={() => normalizeField("name")}
                />
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.brand} changed={changedFieldSet.has("brand")}>
                <input
                  className="input"
                  placeholder="Marca"
                  value={draft.brand}
                  onChange={(e) => handleChange("brand", e.target.value)}
                  onBlur={() => normalizeField("brand")}
                />
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.categoryName} changed={changedFieldSet.has("categoryName")}>
                <input
                  className="input"
                  placeholder="Categoria"
                  value={draft.categoryName}
                  onChange={(e) => handleChange("categoryName", e.target.value)}
                  onBlur={() => normalizeField("categoryName")}
                />
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.presentation} changed={changedFieldSet.has("presentation")}>
                <input
                  className="input"
                  placeholder="Presentacion"
                  value={draft.presentation}
                  onChange={(e) => handleChange("presentation", e.target.value)}
                  onBlur={() => normalizeField("presentation")}
                />
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.image} changed={changedFieldSet.has("image")}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <input
                    className="input"
                    placeholder="URL de imagen"
                    value={draft.image}
                    onChange={(e) => handleChange("image", e.target.value)}
                    onBlur={() => normalizeField("image")}
                  />
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <label className="btn btn-secondary" style={{ cursor: uploadingImage ? "progress" : "pointer" }}>
                      {uploadingImage ? "Subiendo..." : "Subir archivo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={uploadingImage}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            await handleImageUpload(file);
                          }
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {draft.image && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleChange("image", "")}
                        disabled={uploadingImage}
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>
                </div>
              </FieldGroup>
              <FieldGroup label={FIELD_LABELS.status} changed={changedFieldSet.has("status")}>
                <select
                  className="input"
                  value={draft.status}
                  onChange={(e) => handleChange("status", e.target.value as PlatformProductStatusValue)}
                >
                  <option value="APPROVED">Aprobado</option>
                  <option value="HIDDEN">Oculto</option>
                </select>
              </FieldGroup>
            </div>

            <FieldGroup label={FIELD_LABELS.description} changed={changedFieldSet.has("description")}>
              <textarea
                className="input"
                placeholder="Descripcion corta"
                rows={4}
                value={draft.description}
                onChange={(e) => handleChange("description", e.target.value)}
                onBlur={() => normalizeField("description")}
                style={{ resize: "vertical" }}
              />
            </FieldGroup>

            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "14px 16px",
                borderRadius: "16px",
                background: "rgba(30,41,59,.8)",
                border: "1px solid rgba(148,163,184,.12)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Variantes</div>
                  <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                    Cada variante puede tener su propio codigo. Si agregas variantes, el codigo principal se limpia.
                  </div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={addVariant}>
                  + Variante
                </button>
              </div>
              {changedFieldSet.has("variants") && (
                <div style={{ fontSize: "12px", color: "#38bdf8", fontWeight: 700 }}>
                  Cambiaron las variantes desde el ultimo guardado.
                </div>
              )}

              {draft.variants.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                  Sin variantes. Agregalas solo si el producto cambia por sabor, tamano o tipo.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {draft.variants.map((variant, index) => (
                    <div
                      key={variant.id ?? `new-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                        gap: "8px",
                        alignItems: "center",
                      }}
                      >
                      <FieldGroup label={`Variante ${index + 1}`} changed={changedFieldSet.has("variants")}>
                        <input
                          className="input"
                          placeholder="Nombre de variante"
                          value={variant.name}
                          onChange={(e) => updateVariant(index, "name", e.target.value)}
                          onBlur={() =>
                            setDraft((current) => ({
                              ...current,
                              variants: current.variants.map((currentVariant, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...currentVariant,
                                      name: smartTitleCase(currentVariant.name),
                                    }
                                  : currentVariant,
                              ),
                            }))
                          }
                        />
                      </FieldGroup>
                      <FieldGroup label="Codigo variante" changed={changedFieldSet.has("variants")}>
                        <input
                          className="input"
                          placeholder="Barcode de variante"
                          value={variant.barcode ?? ""}
                          onChange={(e) => updateVariant(index, "barcode", e.target.value)}
                        />
                      </FieldGroup>
                      <button type="button" className="btn btn-ghost" onClick={() => removeVariant(index)}>
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ color: error ? "#fca5a5" : message ? "#86efac" : "#94a3b8", fontSize: "14px" }}>
                  {error || message || "Guarda cuando la ficha general este lista."}
                </div>
                {!error && !message && (
                  <div style={{ color: changedFields.length > 0 ? "#38bdf8" : "#94a3b8", fontSize: "13px" }}>
                    {changedFields.length > 0
                      ? `${changedFields.length} cambio${changedFields.length === 1 ? "" : "s"} sin guardar: ${changedLabels.join(", ")}`
                      : "Sin cambios pendientes."}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={() => startNewDraft()}>
                  Limpiar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeEditor}
                  disabled={isPending || uploadingImage}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!canSave || isPending}
                >
                  {isPending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear producto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
        </ModalPortal>
      )}

      {scannerTarget && (
        <BarcodeScanner
          onClose={() => setScannerTarget(null)}
          onScan={(result) => {
            if (scannerTarget === "search") {
              setSearch(result);
              const match =
                products.find(
                  (product) =>
                    product.barcode === result ||
                    product.variants.some((variant) => variant.barcode === result),
                ) ?? null;
              if (match) {
                loadProduct(match);
              }
            } else {
              handleChange("barcode", result);
            }
            setScannerTarget(null);
          }}
        />
      )}
    </>
  );
}
