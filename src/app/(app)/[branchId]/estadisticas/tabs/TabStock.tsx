"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, EmptyState } from "@/components/stats";
import InventoryValuationPanel from "@/components/stats/InventoryValuationPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertaItem {
  tipo: "stock_bajo" | "sin_stock" | "vencido" | "por_vencer" | "reserva_pendiente";
  productoId: string;
  productoNombre: string;
  branchId: string;
  branchName: string;
  cantidad: number;
  detalle: string;
}

interface ReposicionItem {
  id: string;
  type: string;
  fecha: string;
  empleadoName: string | null;
  proveedorName: string | null;
  itemsCantidad: number;
  costoTotal: number;
}

interface ProductoTop {
  key: string;
  displayName: string;
  image: string | null;
  stock: number;
  minStock: number | null;
  valorizacion: number;
  precioVenta: number | null;
  margen: number | null;
}

interface StockData {
  meta: {
    scope: "branch" | "kiosco";
    scopeLabel: string;
    branchCount: number;
  };
  resumen: {
    valorizacionTotal: number;
    productosConStock: number;
    productosSinStock: number;
    productosStockBajo: number;
    productosVencidos: number;
    productosPorVencer: number;
    reservasPendientes: number;
    unidadesPendientesValorizar: number;
    capasAbiertas: number;
  };
  alertas: AlertaItem[];
  reposicionesRecientes: ReposicionItem[];
  productosTop: ProductoTop[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALERTA_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  stock_bajo: { emoji: "⚠️", color: "var(--amber)", label: "Stock bajo" },
  sin_stock: { emoji: "❌", color: "var(--red)", label: "Sin stock" },
  vencido: { emoji: "🕐", color: "var(--red)", label: "Vencido" },
  por_vencer: { emoji: "⏰", color: "var(--amber)", label: "Por vencer" },
  reserva_pendiente: { emoji: "📋", color: "var(--amber)", label: "Reserva pendiente" },
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StockScopeSelector({
  scope,
  setScope,
  canViewKiosco,
}: {
  scope: string;
  setScope: (s: "branch" | "kiosco") => void;
  canViewKiosco: boolean;
}) {
  if (!canViewKiosco) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        background: "rgba(15,23,42,0.6)",
        padding: 4,
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.16)",
        marginBottom: 16,
        width: "fit-content",
      }}
    >
      {[
        { value: "branch", label: "Sucursal" },
        { value: "kiosco", label: "Kiosco" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setScope(option.value as "branch" | "kiosco")}
          style={{
            border: "none",
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: scope === option.value ? "var(--primary)" : "transparent",
            color: scope === option.value ? "#04130a" : "var(--text-2)",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AlertasList({ alertas }: { alertas: AlertaItem[] }) {
  if (alertas.length === 0) {
    return (
      <div
        style={{
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 700, color: "var(--green)" }}>Sin alertas de stock</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
          Todo el inventario está en orden
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "16px" }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          marginBottom: 14,
        }}
      >
        ⚠️ Alertas de Stock ({alertas.length})
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {alertas.slice(0, 20).map((alerta, idx) => {
          const config = ALERTA_CONFIG[alerta.tipo] ?? ALERTA_CONFIG.stock_bajo;
          return (
            <div
              key={`${alerta.productoId}-${alerta.branchId}-${idx}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius)",
                border: `1px solid ${config.color}33`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{config.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-2)" }}>
                    {alerta.productoNombre}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {alerta.branchName} · {alerta.detalle}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: config.color,
                }}
              >
                {alerta.cantidad} u.
              </div>
            </div>
          );
        })}
        {alertas.length > 20 && (
          <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", marginTop: 4 }}>
            + {alertas.length - 20} alertas más
          </div>
        )}
      </div>
    </div>
  );
}

function ReposicionesTable({ reposiciones }: { reposiciones: ReposicionItem[] }) {
  if (reposiciones.length === 0) {
    return null;
  }

  const TYPE_LABEL: Record<string, string> = {
  RECEIVE: "📦 Recepción",
  CORRECTION: "✏️ Corrección",
  TRANSFER: "🔄 Transferencia",
};

  return (
    <div className="card" style={{ padding: "16px" }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          marginBottom: 14,
        }}
      >
        📋 Reposiciones Recientes
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Tipo</th>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Fecha</th>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Empleado</th>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Proveedor</th>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Items</th>
              <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Costo Total</th>
            </tr>
          </thead>
          <tbody>
            {reposiciones.slice(0, 10).map((rep) => (
              <tr key={rep.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 8px" }}>
                  <span style={{ fontSize: 12 }}>
                    {TYPE_LABEL[rep.type] ?? rep.type}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span style={{ color: "var(--text-2)" }}>
                    {formatDate(new Date(rep.fecha))}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span style={{ color: "var(--text-2)" }}>
                    {rep.empleadoName ?? "—"}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span style={{ color: "var(--text-2)" }}>
                    {rep.proveedorName ?? "—"}
                  </span>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <span style={{ color: "var(--text-2)" }}>{rep.itemsCantidad}</span>
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-2)" }}>
                    {formatARS(rep.costoTotal)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductosTopGrid({ productos }: { productos: ProductoTop[] }) {
  if (productos.length === 0) {
    return null;
  }

  return (
    <div className="card" style={{ padding: "16px" }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          marginBottom: 14,
        }}
      >
        📦 Productos con Mayor Valorización
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {productos.slice(0, 8).map((prod) => (
          <div
            key={prod.key}
            style={{
              background: "var(--surface-2)",
              borderRadius: "var(--radius-lg)",
              padding: "12px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {prod.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={prod.image}
                  alt={prod.displayName}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "8px",
                    objectFit: "cover",
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "8px",
                    background: "rgba(15,23,42,0.75)",
                    border: "1px dashed var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  📦
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--text-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {prod.displayName}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {prod.stock} u.
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>Valorizado en</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)" }}>
                {formatARS(prod.valorizacion)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabStock({
  periodo,
  currentDate,
}: {
  periodo: string;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"branch" | "kiosco">("branch");
  const [canViewKiosco, setCanViewKiosco] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
      });

      const res = await fetch(`/api/stats/stock?${params}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
      
      // Check if user can view kiosco scope
      setCanViewKiosco(json.meta?.canViewKioscoScope ?? false);
    } finally {
      setLoading(false);
    }
  }, [branchId, scope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Cargando stock...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Scope selector (only for owner) */}
      <StockScopeSelector
        scope={scope}
        setScope={setScope}
        canViewKiosco={canViewKiosco}
      />

      {/* Inventory Valuation Panel - Reuses existing component */}
      <InventoryValuationPanel branchId={branchId} />

      {/* KPIs de resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Productos con stock"
          value={String(data.resumen.productosConStock)}
          highlight
        />
        <KpiCard
          label="Productos sin stock"
          value={String(data.resumen.productosSinStock)}
          warning={data.resumen.productosSinStock > 0}
        />
        <KpiCard
          label="Stock bajo mínimo"
          value={String(data.resumen.productosStockBajo)}
          warning={data.resumen.productosStockBajo > 0}
        />
        <KpiCard
          label="Capas abiertas"
          value={String(data.resumen.capasAbiertas)}
          sub={`${data.resumen.unidadesPendientesValorizar} u. por valorizar`}
        />
      </div>

      {/* Alertas */}
      <AlertasList alertas={data.alertas} />

      {/* Reposiciones recientes */}
      <ReposicionesTable reposiciones={data.reposicionesRecientes} />

      {/* Productos top */}
      <ProductosTopGrid productos={data.productosTop} />
    </div>
  );
}
