"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PlatformProductStatusValue = "APPROVED" | "HIDDEN";

export interface PlatformProductQuickEditorItem {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  presentation: string | null;
  description: string | null;
  image: string | null;
  status: PlatformProductStatusValue;
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
}

function buildDraft(product?: PlatformProductQuickEditorItem | null, barcodeHint?: string): DraftState {
  return {
    id: product?.id ?? "",
    barcode: product?.barcode ?? barcodeHint ?? "",
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    presentation: product?.presentation ?? "",
    description: product?.description ?? "",
    image: product?.image ?? "",
    status: product?.status ?? "APPROVED",
  };
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
  const [isPending, startTransition] = useTransition();

  const normalizedSearch = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedSearch) {
      return products.slice(0, 8);
    }

    return products
      .filter((product) => {
        const haystack = [
          product.barcode,
          product.name,
          product.brand ?? "",
          product.presentation ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [normalizedSearch, products]);

  const exactBarcodeMatch = useMemo(() => {
    if (!/^\d{8,14}$/.test(search.trim())) {
      return null;
    }

    return products.find((product) => product.barcode === search.trim()) ?? null;
  }, [products, search]);

  const loadProduct = (product: PlatformProductQuickEditorItem) => {
    setDraft(buildDraft(product));
    setSearch(product.barcode);
    setMessage(null);
    setError(null);
  };

  const startNewDraft = (barcodeHint?: string) => {
    setDraft(buildDraft(null, barcodeHint));
    setMessage(null);
    setError(null);
  };

  const handleChange = (field: keyof DraftState, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
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
          body: JSON.stringify(draft),
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

  const canSave = draft.barcode.trim().length > 0 && draft.name.trim().length > 0;

  return (
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
            Busca por nombre o codigo para editar, o crea uno nuevo en segundos.
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
          <input
            className="input"
            placeholder="Buscar por codigo o nombre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {!exactBarcodeMatch && /^\d{8,14}$/.test(search.trim()) && (
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
                    {product.barcode}
                    {product.brand ? ` · ${product.brand}` : ""}
                  </div>
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
            <input
              className="input"
              placeholder="Codigo de barras"
              value={draft.barcode}
              onChange={(e) => handleChange("barcode", e.target.value)}
            />
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
  );
}
