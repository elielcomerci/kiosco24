"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatARS } from "@/lib/utils";

type InventoryScope = "branch" | "kiosco";

type InventoryValueData = {
  meta: {
    scope: InventoryScope;
    scopeLabel: string;
    canViewKioscoScope: boolean;
    branchesInScope: Array<{
      id: string;
      name: string;
    }>;
  };
  summary: {
    actualStock: number;
    valuedCapital: number;
    valuedUnits: number;
    potentialRevenue: number;
    valuedPotentialMargin: number;
    pendingUnits: number;
    pendingLines: number;
    uncoveredUnits: number;
    overtrackedUnits: number;
    negativePendingUnits: number;
    negativeReservations: number;
    pendingProducts: number;
    uncoveredProducts: number;
    unpricedUnits: number;
    layersCount: number;
    productsCount: number;
    branchCount: number;
  };
  products: Array<{
    key: string;
    displayName: string;
    productImage: string | null;
    actualStock: number;
    valuedUnits: number;
    valuedCapital: number;
    weightedAverageCost: number | null;
    potentialRevenue: number;
    valuedPotentialMargin: number;
    priceMin: number | null;
    priceMax: number | null;
    pricedBranchCount: number;
    unpricedUnits: number;
    pendingUnits: number;
    pendingLines: number;
    uncoveredUnits: number;
    overtrackedUnits: number;
    negativePendingUnits: number;
    negativeReservations: number;
    layersCount: number;
    latestReceivedAt: string | null;
    branches: Array<{
      branchId: string;
      branchName: string;
      actualStock: number;
      valuedUnits: number;
      valuedCapital: number;
      pendingUnits: number;
      pendingLines: number;
      uncoveredUnits: number;
      overtrackedUnits: number;
      negativePendingUnits: number;
      negativeReservations: number;
      currentPrice: number | null;
      potentialRevenue: number;
      valuedPotentialMargin: number;
      unpricedUnits: number;
      layersCount: number;
    }>;
    layers: Array<{
      id: string;
      sourceType: string;
      unitCost: number;
      remainingQuantity: number;
      totalValue: number;
      receivedAt: string;
      branchId: string;
      branchName: string;
    }>;
  }>;
};

function StatCard({
  label,
  value,
  sub,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight
          ? "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.03))"
          : "var(--surface)",
        border: `1px solid ${highlight ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: warning ? "var(--red)" : highlight ? "var(--green)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {sub ? <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</span> : null}
    </div>
  );
}

function formatPriceRange(product: InventoryValueData["products"][number]) {
  if (product.priceMin === null || product.priceMax === null) {
    return null;
  }

  if (product.priceMin === product.priceMax) {
    return formatARS(product.priceMin);
  }

  return `${formatARS(product.priceMin)} - ${formatARS(product.priceMax)}`;
}

export default function InventoryValuationPanel({ branchId }: { branchId: string }) {
  const [inventoryScope, setInventoryScope] = useState<InventoryScope>("branch");
  const [inventoryValue, setInventoryValue] = useState<InventoryValueData | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [expandedInventoryKeys, setExpandedInventoryKeys] = useState<string[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const loadInventoryValue = useCallback(async (scope: InventoryScope) => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const res = await fetch(`/api/stats/inventory-value?scope=${scope}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "No pudimos cargar la valorizacion de inventario.");
      }
      setInventoryValue(json as InventoryValueData);
    } catch (error) {
      console.error(error);
      setInventoryValue(null);
      setInventoryError(error instanceof Error ? error.message : "No pudimos cargar la valorizacion de inventario.");
    } finally {
      setInventoryLoading(false);
    }
  }, [branchId]);

  const handleOpenPanel = useCallback(() => {
    setIsOpen(true);
    if (!inventoryValue) {
      void loadInventoryValue(inventoryScope);
    }
  }, [inventoryScope, inventoryValue, loadInventoryValue]);

  const handleRefresh = useCallback(() => {
    setIsOpen(true);
    void loadInventoryValue(inventoryScope);
  }, [inventoryScope, loadInventoryValue]);

  const handleScopeChange = useCallback((nextScope: InventoryScope) => {
    setInventoryScope(nextScope);
    if (!isOpen) {
      return;
    }
    void loadInventoryValue(nextScope);
  }, [isOpen, loadInventoryValue]);

  useEffect(() => {
    setExpandedInventoryKeys([]);
    setShowAllProducts(false);
  }, [inventoryScope]);

  const toggleInventoryProduct = (key: string) => {
    setExpandedInventoryKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const products = useMemo(
    () => {
      if (!inventoryValue) return [];
      const limit = inventoryScope === "kiosco" ? 10 : 8;
      return showAllProducts ? inventoryValue.products : inventoryValue.products.slice(0, limit);
    },
    [inventoryScope, inventoryValue, showAllProducts],
  );

  if (!isOpen) {
    return (
      <div
        className="card"
        style={{
          padding: "16px",
          display: "grid",
          gap: "12px",
          background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(15,23,42,0.9))",
          border: "1px solid rgba(56,189,248,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-3)",
                marginBottom: 8,
              }}
            >
              Inventario valorizado
            </h3>
            <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              El cálculo completo de capas, reservas y valuación está desactivado por defecto para no gastar CPU en cada apertura de la pestaña.
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
              Se calcula solo cuando lo pedís.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={handleOpenPanel}
            disabled={inventoryLoading}
          >
            {inventoryValue ? "Ver valuación" : inventoryLoading ? "Cargando..." : "Cargar valuación"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        padding: "16px",
        display: "grid",
        gap: "14px",
        background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(15,23,42,0.9))",
        border: "1px solid rgba(56,189,248,0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
              marginBottom: 8,
            }}
          >
            Inventario valorizado
          </h3>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
            Capital real del stock, capas abiertas, faltantes de costo y reservas que quedaron pendientes por
            venta en negativo. Ahora tambien podes verlo consolidado por sucursal o por todo el kiosco.
          </div>
          {inventoryValue?.meta ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
              Alcance actual: {inventoryValue.meta.scopeLabel}
              {inventoryValue.meta.scope === "kiosco"
                ? ` · ${inventoryValue.summary.branchCount || inventoryValue.meta.branchesInScope.length} ${(inventoryValue.summary.branchCount || inventoryValue.meta.branchesInScope.length) === 1 ? "sucursal" : "sucursales"}`
                : ""}
            </div>
          ) : null}
          </div>

        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          {inventoryValue?.meta?.canViewKioscoScope ? (
            <div
              style={{
                display: "flex",
                gap: 6,
                background: "rgba(15,23,42,0.6)",
                padding: 4,
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.16)",
              }}
            >
              {([
                { value: "branch", label: "Sucursal" },
                { value: "kiosco", label: "Kiosco" },
              ] as Array<{ value: InventoryScope; label: string }>).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleScopeChange(option.value)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: inventoryScope === option.value ? "var(--primary)" : "transparent",
                    color: inventoryScope === option.value ? "#04130a" : "var(--text-2)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {inventoryLoading ? <div style={{ color: "var(--text-3)", fontSize: 13 }}>Actualizando...</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 10 }}
              onClick={() => setIsOpen(false)}
            >
              Ocultar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 10 }}
              onClick={handleRefresh}
              disabled={inventoryLoading}
            >
              Actualizar
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard
          label="Capital valorizado"
          value={inventoryValue ? formatARS(inventoryValue.summary.valuedCapital) : "-"}
          sub={inventoryValue ? `${inventoryValue.summary.layersCount} capas abiertas` : "Cargando"}
          highlight
        />
        <StatCard
          label="Venta potencial"
          value={inventoryValue ? formatARS(inventoryValue.summary.potentialRevenue) : "-"}
          sub={inventoryValue ? `${inventoryValue.summary.actualStock} u. fisicas detectadas` : "Cargando"}
        />
        <StatCard
          label="Margen potencial"
          value={inventoryValue ? formatARS(inventoryValue.summary.valuedPotentialMargin) : "-"}
          sub="Solo sobre unidades con costo real cargado"
          highlight
        />
        <StatCard
          label="Unidades con costo"
          value={inventoryValue ? String(inventoryValue.summary.valuedUnits) : "-"}
          sub={inventoryValue ? `${inventoryValue.summary.productsCount} articulos auditables` : "Cargando"}
        />
        <StatCard
          label="Unidades pendientes"
          value={inventoryValue ? String(inventoryValue.summary.pendingUnits) : "-"}
          sub={inventoryValue ? `${inventoryValue.summary.pendingLines} lineas sin costo` : "Cargando"}
          warning={Boolean(inventoryValue && inventoryValue.summary.pendingUnits > 0)}
        />
        <StatCard
          label="Pendiente por negativo"
          value={inventoryValue ? String(inventoryValue.summary.negativePendingUnits) : "-"}
          sub={
            inventoryValue
              ? `${inventoryValue.summary.negativeReservations} reservas esperando reposicion`
              : "Cargando"
          }
          warning={Boolean(inventoryValue && inventoryValue.summary.negativePendingUnits > 0)}
        />
        <StatCard
          label="Stock sin capa"
          value={inventoryValue ? String(inventoryValue.summary.uncoveredUnits) : "-"}
          sub={
            inventoryValue
              ? `${inventoryValue.summary.uncoveredProducts} productos para regularizar`
              : "Cargando"
          }
          warning={Boolean(inventoryValue && inventoryValue.summary.uncoveredUnits > 0)}
        />
        <StatCard
          label="Stock sin precio"
          value={inventoryValue ? String(inventoryValue.summary.unpricedUnits) : "-"}
          sub="No entra al potencial de venta hasta definir precio"
          warning={Boolean(inventoryValue && inventoryValue.summary.unpricedUnits > 0)}
        />
      </div>

      {products.length > 0 ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {inventoryValue && inventoryValue.products.length > products.length ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Mostrando {products.length} de {inventoryValue.products.length} articulos auditables.
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "6px 10px", borderRadius: 10 }}
                onClick={() => setShowAllProducts(true)}
              >
                Ver todos
              </button>
            </div>
          ) : null}

          {products.map((product) => {
            const priceLabel = formatPriceRange(product);
            const showExpanded = expandedInventoryKeys.includes(product.key);
            const canExpand =
              product.layers.length > 0 ||
              product.branches.length > 1 ||
              product.pendingUnits > 0 ||
              product.uncoveredUnits > 0 ||
              product.overtrackedUnits > 0 ||
              product.unpricedUnits > 0 ||
              product.negativePendingUnits > 0;

            return (
              <div
                key={product.key}
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "12px 0",
                  borderTop: "1px solid rgba(148,163,184,0.12)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  {product.productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.productImage}
                      alt={product.displayName}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "14px",
                        objectFit: "cover",
                        border: "1px solid rgba(148,163,184,0.18)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "14px",
                        background: "rgba(15,23,42,0.75)",
                        border: "1px dashed rgba(148,163,184,0.18)",
                      }}
                    />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{product.displayName}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
                      {product.actualStock} u. fisicas
                      {product.valuedUnits > 0 ? ` · ${product.valuedUnits} u. valorizadas` : ""}
                      {product.uncoveredUnits > 0 ? ` · ${product.uncoveredUnits} u. sin capa` : ""}
                      {priceLabel ? ` · precio ${priceLabel}` : ""}
                      {product.weightedAverageCost !== null ? ` · costo prom. ${formatARS(product.weightedAverageCost)}` : ""}
                      {product.pendingUnits > 0 ? ` · ${product.pendingUnits} u. pendientes` : ""}
                      {product.negativePendingUnits > 0 ? ` · ${product.negativePendingUnits} u. en negativo` : ""}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{formatARS(product.valuedCapital)}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                      Venta pot. {formatARS(product.potentialRevenue)}
                    </div>
                    <div
                      style={{
                        color:
                          product.overtrackedUnits > 0 || product.negativePendingUnits > 0
                            ? "var(--red)"
                            : product.pendingUnits > 0 || product.uncoveredUnits > 0 || product.unpricedUnits > 0
                              ? "var(--amber)"
                              : "var(--green)",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      Margen pot. {formatARS(product.valuedPotentialMargin)}
                    </div>
                    {canExpand ? (
                      <button
                        className="btn btn-ghost"
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          padding: "4px 8px",
                          borderRadius: 8,
                          border: "1px solid rgba(148,163,184,0.16)",
                        }}
                        onClick={() => toggleInventoryProduct(product.key)}
                      >
                        {showExpanded ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {showExpanded ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      marginLeft: "60px",
                      padding: "12px",
                      borderRadius: "14px",
                      background: "rgba(15,23,42,0.45)",
                      border: "1px solid rgba(148,163,184,0.12)",
                    }}
                  >
                    {inventoryValue?.meta.scope === "kiosco" && product.branches.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-3)",
                          }}
                        >
                          Sucursales
                        </div>
                        {product.branches.map((branch) => (
                          <div
                            key={`${product.key}:${branch.branchId}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: 8,
                              alignItems: "center",
                              padding: "8px 10px",
                              borderRadius: 12,
                              background: "rgba(15,23,42,0.55)",
                              border: "1px solid rgba(148,163,184,0.08)",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{branch.branchName}</div>
                              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                                {branch.actualStock} u. fisicas
                                {branch.currentPrice !== null ? ` · precio ${formatARS(branch.currentPrice)}` : ""}
                                {branch.pendingUnits > 0 ? ` · ${branch.pendingUnits} u. pendientes` : ""}
                                {branch.uncoveredUnits > 0 ? ` · ${branch.uncoveredUnits} u. sin capa` : ""}
                                {branch.negativePendingUnits > 0 ? ` · ${branch.negativePendingUnits} u. en negativo` : ""}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{formatARS(branch.valuedCapital)}</div>
                              <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                                Venta pot. {formatARS(branch.potentialRevenue)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {product.layers.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--text-3)",
                          }}
                        >
                          Capas abiertas
                        </div>
                        {product.layers.map((layer) => (
                          <div
                            key={layer.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>
                                {layer.remainingQuantity} u. a {formatARS(layer.unitCost)}
                              </div>
                              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
                                {layer.sourceType === "MANUAL_VALUATION" ? "Valorizacion manual" : "Ingreso"}
                                {inventoryValue?.meta.scope === "kiosco" ? ` · ${layer.branchName}` : ""}
                                {` · ${new Date(layer.receivedAt).toLocaleDateString("es-AR")}`}
                              </div>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{formatARS(layer.totalValue)}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {product.pendingUnits > 0 ? (
                      <div style={{ color: "var(--amber)", fontSize: 12 }}>
                        Quedan {product.pendingUnits} u. pendientes de valorizar en este producto.
                      </div>
                    ) : null}
                    {product.uncoveredUnits > 0 ? (
                      <div style={{ color: "var(--amber)", fontSize: 12 }}>
                        Hay {product.uncoveredUnits} u. fisicas sin capa contable asociada.
                      </div>
                    ) : null}
                    {product.unpricedUnits > 0 ? (
                      <div style={{ color: "var(--amber)", fontSize: 12 }}>
                        Hay {product.unpricedUnits} u. con costo auditado pero sin precio de venta definido.
                      </div>
                    ) : null}
                    {product.overtrackedUnits > 0 ? (
                      <div style={{ color: "var(--red)", fontSize: 12 }}>
                        Hay {product.overtrackedUnits} u. valorizadas por encima del stock actual.
                      </div>
                    ) : null}
                    {product.negativePendingUnits > 0 ? (
                      <div style={{ color: "var(--red)", fontSize: 12 }}>
                        Hay {product.negativePendingUnits} u. vendidas en negativo esperando costo real.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : inventoryError ? (
        <div style={{ color: "var(--red)", fontSize: 13 }}>
          {inventoryError}
        </div>
      ) : !inventoryLoading ? (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>
          Todavia no hay ingresos valorizados para este alcance.
        </div>
      ) : null}
    </div>
  );
}
