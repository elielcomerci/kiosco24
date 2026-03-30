"use client";

import { useEffect, useMemo, useState } from "react";

import { formatARS } from "@/lib/utils";

type ProductVariant = {
  id?: string;
  name: string;
  barcode: string | null;
  stock: number | null;
  availableStock?: number | null;
};

type ProductRecord = {
  id: string;
  name: string;
  image: string | null;
  barcode: string | null;
  stock: number | null;
  availableStock?: number | null;
  variants?: ProductVariant[];
};

type OptionRecord = {
  key: string;
  productId: string;
  variantId: string | null;
  label: string;
  image: string | null;
  barcode: string | null;
  stock: number;
};

type ManualLayerRecord = {
  id: string;
  quantity: number;
  unitCost: number;
  receivedAt: string;
};

type ManualValuationContext = {
  product: {
    id: string;
    name: string;
    image: string | null;
    barcode: string | null;
  };
  variant: {
    id: string;
    name: string;
    barcode: string | null;
  } | null;
  currentStock: number;
  automaticValuedUnits: number;
  manualValuedUnits: number;
  lockedManualValuedUnits: number;
  recommendedManualCapacity: number;
  editableManualLimit: number;
  manualLayers: ManualLayerRecord[];
  lockedManualLayers: ManualLayerRecord[];
};

type DraftLayer = {
  quantity: string;
  unitCost: string;
};

function createBlankLayer(): DraftLayer {
  return {
    quantity: "",
    unitCost: "",
  };
}

function parsePositiveInt(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function InventoryValuationModal({
  branchId,
  products,
  onClose,
  onSaved,
}: {
  branchId: string;
  products: ProductRecord[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ManualValuationContext | null>(null);
  const [draftLayers, setDraftLayers] = useState<DraftLayer[]>([createBlankLayer()]);

  const options = useMemo<OptionRecord[]>(() => {
    const flattened: OptionRecord[] = [];

    for (const product of products) {
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          const stock = variant.availableStock ?? variant.stock ?? 0;
          if (stock <= 0) {
            continue;
          }

          flattened.push({
            key: `${product.id}:${variant.id ?? "variant"}`,
            productId: product.id,
            variantId: variant.id ?? null,
            label: `${product.name} · ${variant.name}`,
            image: product.image,
            barcode: variant.barcode ?? product.barcode,
            stock,
          });
        }
        continue;
      }

      const stock = product.availableStock ?? product.stock ?? 0;
      if (stock <= 0) {
        continue;
      }

      flattened.push({
        key: `${product.id}:base`,
        productId: product.id,
        variantId: null,
        label: product.name,
        image: product.image,
        barcode: product.barcode,
        stock,
      });
    }

    return flattened.sort((left, right) => left.label.localeCompare(right.label, "es-AR"));
  }, [products]);

  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es-AR");
    if (!normalizedSearch) {
      return options.slice(0, 24);
    }

    return options
      .filter((option) =>
        [option.label, option.barcode]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("es-AR")
          .includes(normalizedSearch),
      )
      .slice(0, 24);
  }, [options, search]);

  useEffect(() => {
    if (!selectedKey && filteredOptions[0]) {
      setSelectedKey(filteredOptions[0].key);
    }
  }, [filteredOptions, selectedKey]);

  useEffect(() => {
    const selected = options.find((option) => option.key === selectedKey);
    if (!selected) {
      setContext(null);
      return;
    }

    const loadContext = async () => {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          productId: selected.productId,
        });
        if (selected.variantId) {
          query.set("variantId", selected.variantId);
        }

        const response = await fetch(`/api/inventario/valoracion-manual?${query.toString()}`, {
          headers: { "x-branch-id": branchId },
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || "No pudimos cargar la valorizacion manual.");
        }

        setContext(data as ManualValuationContext);
        const nextDraft =
          Array.isArray(data?.manualLayers) && data.manualLayers.length > 0
            ? (data.manualLayers as ManualLayerRecord[]).map((layer) => ({
                quantity: String(layer.quantity),
                unitCost: String(layer.unitCost),
              }))
            : [createBlankLayer()];
        setDraftLayers(nextDraft);
      } catch (fetchError) {
        console.error(fetchError);
        setContext(null);
        setDraftLayers([createBlankLayer()]);
        setError(fetchError instanceof Error ? fetchError.message : "No pudimos cargar la valorizacion manual.");
      } finally {
        setLoading(false);
      }
    };

    void loadContext();
  }, [branchId, options, selectedKey]);

  const totalDraftQuantity = draftLayers.reduce((sum, layer) => sum + (parsePositiveInt(layer.quantity) ?? 0), 0);
  const hasValidLayer = draftLayers.some(
    (layer) => parsePositiveInt(layer.quantity) !== null && parseMoney(layer.unitCost) !== null,
  );
  const exceedsLimit = Boolean(context && totalDraftQuantity > context.editableManualLimit);

  const handleLayerChange = (index: number, field: keyof DraftLayer, value: string) => {
    setDraftLayers((current) => current.map((layer, idx) => (idx === index ? { ...layer, [field]: value } : layer)));
  };

  const handleSave = async () => {
    const selected = options.find((option) => option.key === selectedKey);
    if (!selected || !context) {
      return;
    }

    const normalizedLayers = draftLayers
      .map((layer) => ({
        quantity: parsePositiveInt(layer.quantity),
        unitCost: parseMoney(layer.unitCost),
      }))
      .filter(
        (
          layer,
        ): layer is {
          quantity: number;
          unitCost: number;
        } => layer.quantity !== null && layer.unitCost !== null,
      );

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/inventario/valoracion-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          productId: selected.productId,
          variantId: selected.variantId,
          layers: normalizedLayers,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No pudimos guardar la valorizacion manual.");
      }

      setContext(data as ManualValuationContext);
      const nextDraft =
        Array.isArray(data?.manualLayers) && data.manualLayers.length > 0
          ? (data.manualLayers as ManualLayerRecord[]).map((layer) => ({
              quantity: String(layer.quantity),
              unitCost: String(layer.unitCost),
            }))
          : [createBlankLayer()];
      setDraftLayers(nextDraft);
      onSaved?.();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "No pudimos guardar la valorizacion manual.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "980px",
          width: "100%",
          maxHeight: "92dvh",
          overflow: "hidden",
          padding: 0,
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto",
        }}
      >
        <div
          style={{
            padding: "18px 20px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800 }}>Valorar stock</h2>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
              Carga capas manuales de costo para unidades que todavia no tienen valorizacion.
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto o variante"
            autoFocus
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
            minHeight: 0,
          }}
        >
          <div
            style={{
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
              padding: "12px",
              display: "grid",
              gap: "8px",
              alignContent: "start",
            }}
          >
            {filteredOptions.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: "13px" }}>No encontramos productos con stock para valorizar.</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.key}
                  className="btn btn-ghost"
                  style={{
                    justifyContent: "flex-start",
                    border: selectedKey === option.key ? "1px solid rgba(56,189,248,0.35)" : "1px solid var(--border)",
                    background: selectedKey === option.key ? "rgba(56,189,248,0.08)" : "var(--surface)",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "10px",
                    alignItems: "center",
                  }}
                  onClick={() => setSelectedKey(option.key)}
                >
                  {option.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={option.image}
                      alt={option.label}
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "12px",
                        objectFit: "cover",
                        border: "1px solid rgba(148,163,184,0.18)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "12px",
                        border: "1px dashed rgba(148,163,184,0.18)",
                        background: "rgba(15,23,42,0.75)",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px" }}>{option.label}</div>
                    <div style={{ color: "var(--text-3)", fontSize: "12px", marginTop: 2 }}>
                      {option.stock} u. en stock
                      {option.barcode ? ` · ${option.barcode}` : ""}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ overflowY: "auto", padding: "16px 18px", display: "grid", gap: "14px", alignContent: "start" }}>
            {loading ? (
              <div style={{ color: "var(--text-3)", fontSize: "13px" }}>Cargando contexto...</div>
            ) : context ? (
              <>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.72)",
                    border: "1px solid rgba(148,163,184,0.16)",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 800 }}>
                    {context.variant ? `${context.product.name} · ${context.variant.name}` : context.product.name}
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.5 }}>
                    Stock actual: {context.currentStock} u. · Capas automaticas: {context.automaticValuedUnits} u. · Manuales cargadas: {context.manualValuedUnits} u.
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: "13px", lineHeight: 1.5 }}>
                    Recomendado para valorizar manualmente ahora: {context.recommendedManualCapacity} u.
                    {context.editableManualLimit !== context.recommendedManualCapacity
                      ? ` Puedes mantener hasta ${context.editableManualLimit} u. manuales para corregir lo que ya cargaste.`
                      : ""}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    padding: "14px 16px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.42)",
                    border: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>Capas manuales</div>
                      <div style={{ color: "var(--text-3)", fontSize: "12px", marginTop: 2 }}>
                        Ejemplo: 10 unidades a $1200 y 8 unidades a $1250.
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ border: "1px solid var(--border)" }}
                      onClick={() => setDraftLayers((current) => [...current, createBlankLayer()])}
                    >
                      + Capa
                    </button>
                  </div>

                  {draftLayers.map((layer, index) => (
                    <div
                      key={`draft-layer-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr auto",
                        gap: "10px",
                        alignItems: "end",
                      }}
                    >
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)" }}>Cantidad</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          step={1}
                          value={layer.quantity}
                          onChange={(event) => handleLayerChange(index, "quantity", event.target.value)}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)" }}>Costo unitario</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={layer.unitCost}
                          onChange={(event) => handleLayerChange(index, "unitCost", event.target.value)}
                        />
                      </label>
                      <button
                        className="btn btn-ghost"
                        style={{ border: "1px solid var(--border)", height: "44px" }}
                        onClick={() =>
                          setDraftLayers((current) =>
                            current.length === 1 ? [createBlankLayer()] : current.filter((_, idx) => idx !== index),
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", fontSize: "13px" }}>
                    <div style={{ color: exceedsLimit ? "var(--red)" : "var(--text-2)" }}>
                      Total en borrador: {totalDraftQuantity} u.
                    </div>
                    <div style={{ color: "var(--text-3)" }}>
                      Limite editable: {context.editableManualLimit} u.
                    </div>
                  </div>

                  {context.manualLayers.length > 0 && (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)" }}>Actualmente cargadas</div>
                      {context.manualLayers.map((layer) => (
                        <div key={layer.id} style={{ fontSize: "12px", color: "var(--text-2)" }}>
                          {layer.quantity} u. a {formatARS(layer.unitCost)} · {new Date(layer.receivedAt).toLocaleDateString("es-AR")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: "13px" }}>Selecciona un producto para valorizar.</div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid var(--border)",
            display: "grid",
            gap: "8px",
          }}
        >
          {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>{error}</div>}
          {exceedsLimit && (
            <div style={{ color: "var(--red)", fontSize: "13px" }}>
              El total cargado supera el limite editable para este producto.
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            <button
              className="btn btn-green"
              onClick={() => void handleSave()}
              disabled={!context || saving || exceedsLimit || !hasValidLayer}
            >
              {saving ? "Guardando..." : "Guardar valorizacion"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
