"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BarcodeScanner from "@/components/caja/BarcodeScanner";

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
  presentation: string | null;
  description: string | null;
  image: string | null;
  status: PlatformProductStatusValue;
  variants: PlatformProductQuickEditorVariant[];
}

interface DraftState {
  id: string;
  barcode: string;
  name: string;
  brand: string;
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

export default function PlatformProductQuickEditor({
  products,
}: {
  products: PlatformProductQuickEditorItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DraftState>(() => buildDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerTarget, setScannerTarget] = useState<"search" | "barcode" | null>(null);
  const [isPending, startTransition] = useTransition();
  const usesVariants = draft.variants.length > 0;

  const normalizedSearch = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedSearch) {
      return products.slice(0, 8);
    }

    return products
      .filter((product) => {
        const variantHaystack = product.variants
          .flatMap((variant) => [variant.name, variant.barcode ?? ""])
          .join(" ");
        const haystack = [
          product.barcode ?? "",
          product.name,
          product.brand ?? "",
          product.presentation ?? "",
          variantHaystack,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [normalizedSearch, products]);

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
    setDraft(buildDraft(product));
    setSearch(product.barcode ?? product.variants[0]?.barcode ?? product.name);
    setMessage(null);
    setError(null);
  };

  const startNewDraft = (barcodeHint?: string) => {
    setDraft(buildDraft(null, barcodeHint));
    setMessage(null);
    setError(null);
  };

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

  const addVariant = () => {
    setDraft((current) => ({
      ...current,
      barcode: "",
      variants: [...current.variants, { name: "", barcode: null }],
    }));
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
        const res = await fetch("/api/admin/platform-products", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...draft,
            barcode: usesVariants ? null : draft.barcode.trim() || null,
            variants: draft.variants.map((variant) => ({
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

        setMessage(draft.id ? "Producto actualizado." : "Producto global creado.");
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

  return (
    <>
      <section
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
              Busca por nombre o codigo, escanea desde la camara y edita variantes desde la misma ficha.
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => startNewDraft(search.trim())}>
            Nuevo rapido
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
                      {product.brand ? ` · ${product.brand}` : ""}
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

          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="input"
                  placeholder={usesVariants ? "Se elimina al usar variantes" : "Codigo de barras base"}
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
              <input
                className="input"
                placeholder="Nombre"
                value={draft.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
              <input
                className="input"
                placeholder="Marca"
                value={draft.brand}
                onChange={(e) => handleChange("brand", e.target.value)}
              />
              <input
                className="input"
                placeholder="Presentacion"
                value={draft.presentation}
                onChange={(e) => handleChange("presentation", e.target.value)}
              />
              <input
                className="input"
                placeholder="URL de imagen"
                value={draft.image}
                onChange={(e) => handleChange("image", e.target.value)}
              />
              <select
                className="input"
                value={draft.status}
                onChange={(e) => handleChange("status", e.target.value as PlatformProductStatusValue)}
              >
                <option value="APPROVED">Aprobado</option>
                <option value="HIDDEN">Oculto</option>
              </select>
            </div>

            <textarea
              className="input"
              placeholder="Descripcion"
              rows={4}
              value={draft.description}
              onChange={(e) => handleChange("description", e.target.value)}
              style={{ resize: "vertical" }}
            />

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
                    Cada variante puede tener su propio codigo de barras. Si hay variantes, el codigo principal se limpia.
                  </div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={addVariant}>
                  + Variante
                </button>
              </div>

              {draft.variants.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                  Sin variantes cargadas. Si el producto cambia por sabor, tamano o tipo, agregalas aca.
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
                      <input
                        className="input"
                        placeholder="Nombre de variante"
                        value={variant.name}
                        onChange={(e) => updateVariant(index, "name", e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Barcode de variante"
                        value={variant.barcode ?? ""}
                        onChange={(e) => updateVariant(index, "barcode", e.target.value)}
                      />
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
              <div style={{ color: error ? "#fca5a5" : message ? "#86efac" : "#94a3b8", fontSize: "14px" }}>
                {error || message || "Completa los campos y guarda."}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={() => startNewDraft()}>
                  Limpiar
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
      </section>

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
