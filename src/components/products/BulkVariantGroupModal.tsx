"use client";

import { useMemo, useState } from "react";

import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";

type GroupCandidate = {
  id: string;
  name: string;
  barcode: string | null;
  internalCode: string | null;
  price: number;
  cost: number | null;
  stock: number | null;
  minStock: number | null;
  variants?: Array<{ id?: string }>;
};

export type BulkVariantGroupPayload = {
  baseProductId: string;
  parentName: string;
  variants: Array<{
    productId: string;
    name: string;
  }>;
};

type Props = {
  products: GroupCandidate[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: BulkVariantGroupPayload) => void | Promise<void>;
};

function getCommonPrefix(names: string[]) {
  if (names.length === 0) {
    return "";
  }

  const tokenized = names.map((name) => name.trim().split(/\s+/).filter(Boolean));
  const base = tokenized[0] ?? [];
  const prefix: string[] = [];

  for (let index = 0; index < base.length; index += 1) {
    const candidate = base[index];
    const lowerCandidate = candidate.toLocaleLowerCase("es-AR");
    if (tokenized.every((tokens) => (tokens[index] ?? "").toLocaleLowerCase("es-AR") === lowerCandidate)) {
      prefix.push(candidate);
      continue;
    }
    break;
  }

  return prefix.join(" ").trim();
}

function suggestParentName(products: GroupCandidate[]) {
  const prefix = getCommonPrefix(products.map((product) => product.name));
  if (prefix.length >= 3) {
    return prefix;
  }
  return products[0]?.name?.trim() ?? "";
}

function suggestVariantName(productName: string, parentName: string) {
  const trimmedProduct = productName.trim();
  const trimmedParent = parentName.trim();
  if (!trimmedParent) {
    return trimmedProduct;
  }

  const normalizedProduct = trimmedProduct.toLocaleLowerCase("es-AR");
  const normalizedParent = trimmedParent.toLocaleLowerCase("es-AR");

  if (!normalizedProduct.startsWith(normalizedParent)) {
    return trimmedProduct;
  }

  const remainder = trimmedProduct.slice(trimmedParent.length).replace(/^[\s\-_/.,]+/, "").trim();
  return remainder || trimmedProduct;
}

function buildInitialState(products: GroupCandidate[]) {
  const suggestedParent = suggestParentName(products);

  return {
    baseProductId: products[0]?.id ?? "",
    parentName: suggestedParent,
    variantNames: Object.fromEntries(
      products.map((product) => [product.id, suggestVariantName(product.name, suggestedParent)]),
    ) as Record<string, string>,
  };
}

export default function BulkVariantGroupModal({ products, loading = false, onClose, onConfirm }: Props) {
  const initialState = useMemo(() => buildInitialState(products), [products]);
  const [baseProductId, setBaseProductId] = useState(() => initialState.baseProductId);
  const [parentName, setParentName] = useState(() => initialState.parentName);
  const [variantNames, setVariantNames] = useState<Record<string, string>>(() => initialState.variantNames);

  const hasNestedVariants = useMemo(
    () => products.some((product) => (product.variants?.length ?? 0) > 0),
    [products],
  );

  const duplicateVariantNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    products.forEach((product) => {
      const value = (variantNames[product.id] ?? "").trim().toLocaleLowerCase("es-AR");
      if (!value) {
        return;
      }
      if (seen.has(value)) {
        duplicates.add(value);
        return;
      }
      seen.add(value);
    });

    return duplicates;
  }, [products, variantNames]);

  const canSubmit =
    !loading &&
    !hasNestedVariants &&
    baseProductId.length > 0 &&
    parentName.trim().length >= 2 &&
    products.length >= 2 &&
    products.every((product) => (variantNames[product.id] ?? "").trim().length >= 1) &&
    duplicateVariantNames.size === 0;

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={loading ? undefined : onClose}>
        <div
          className="modal animate-slide-up"
          onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: "720px", width: "min(720px, 96vw)", maxHeight: "88dvh", overflowY: "auto", padding: "22px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>Agrupar en variantes</h2>
              <p style={{ color: "var(--text-2)", fontSize: "14px", lineHeight: 1.45 }}>
                Esta acciÃ³n es manual y solo afecta a los productos seleccionados de este kiosco. Uno de ellos se convierte en el producto padre y los demÃ¡s se absorben como variantes, conservando codigo, stock, minimo, precio y costo.
              </p>
            </div>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cerrar
            </button>
          </div>

          {hasNestedVariants ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid rgba(239,68,68,.24)",
                background: "rgba(239,68,68,.08)",
                color: "var(--red)",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              La selecciÃ³n incluye productos que ya tienen variantes. Por ahora solo se pueden agrupar productos simples.
            </div>
          ) : null}

          <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Producto base</label>
              <select
                className="input"
                value={baseProductId}
                onChange={(event) => setBaseProductId(event.target.value)}
                disabled={loading}
                style={{ cursor: "pointer" }}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-3)" }}>
                Esa ficha conserva su ID y se convierte en el contenedor de variantes.
              </div>
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Producto padre</label>
              <input
                className="input"
                value={parentName}
                onChange={(event) => setParentName(event.target.value)}
                placeholder="Ej: Jugo Tang"
                disabled={loading}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Variantes seleccionadas: <strong style={{ color: "var(--text)" }}>{products.length}</strong>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ border: "1px solid var(--border)" }}
                disabled={loading}
                onClick={() =>
                  setVariantNames(
                    Object.fromEntries(
                      products.map((product) => [product.id, suggestVariantName(product.name, parentName)]),
                    ),
                  )
                }
              >
                Sugerir nombres
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
            {products.map((product) => {
              const variantName = variantNames[product.id] ?? "";
              const normalizedVariantName = variantName.trim().toLocaleLowerCase("es-AR");
              const hasDuplicate = duplicateVariantNames.has(normalizedVariantName);

              return (
                <div
                  key={product.id}
                  style={{
                    border: `1px solid ${hasDuplicate ? "rgba(239,68,68,.28)" : "var(--border)"}`,
                    borderRadius: "14px",
                    padding: "12px",
                    background: hasDuplicate ? "rgba(239,68,68,.06)" : "var(--surface-2)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{product.name}</div>
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-3)", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {product.id === baseProductId ? <span style={{ color: "var(--green)", fontWeight: 800 }}>Base</span> : null}
                        <span>Stock: {product.stock ?? 0}</span>
                        <span>Min: {product.minStock ?? 0}</span>
                        <span>Precio: {formatARS(product.price)}</span>
                        {typeof product.cost === "number" ? <span>Costo: {formatARS(product.cost)}</span> : null}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", textAlign: "right" }}>
                      {product.internalCode ? <div>Interno: {product.internalCode}</div> : null}
                      {product.barcode ? <div>Codigo: {product.barcode}</div> : null}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Nombre de variante</label>
                    <input
                      className="input"
                      value={variantName}
                      onChange={(event) =>
                        setVariantNames((prev) => ({
                          ...prev,
                          [product.id]: event.target.value,
                        }))
                      }
                      placeholder="Ej: Naranja"
                      disabled={loading}
                    />
                    {hasDuplicate ? (
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--red)", fontWeight: 700 }}>
                        El nombre de variante estÃ¡ repetido dentro de esta agrupaciÃ³n.
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button
              className="btn btn-green"
              style={{ flex: 2 }}
              disabled={!canSubmit}
              onClick={() =>
                void onConfirm({
                  baseProductId,
                  parentName: parentName.trim(),
                  variants: products.map((product) => ({
                    productId: product.id,
                    name: (variantNames[product.id] ?? "").trim() || product.name,
                  })),
                })
              }
            >
              {loading ? "Agrupando..." : "Crear producto con variantes"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
