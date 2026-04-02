"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, BarChart, EmptyState } from "@/components/stats";
import type { Periodo } from "@/lib/stats-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VentaItem {
  id: string;
  ticketNumber: number | null;
  createdAt: string;
  total: number;
  paymentMethod: string;
  employeeName: string | null;
  voided: boolean;
  invoiceStatus: string | null;
  itemsCount: number;
}

interface VentasData {
  ventas: VentaItem[];
  totalVentas: number;
  cantidadVentas: number;
  ventasPorMetodo: Record<string, number>;
  ventasPorHora: Array<{ hora: number; cantidad: number; total: number }>;
  productosMasVendidos: Array<{ name: string; cantidad: number; total: number }>;
  productosMenosVendidos: Array<{ name: string; cantidad: number; total: number }>;
  categoriasTop: Array<{ name: string; cantidad: number; total: number }>;
  ventasFiado: { cantidad: number; total: number };
  facturasAfip: { emitidas: number; pendientes: number; fallidas: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METODO_LABEL: Record<string, string> = {
  CASH: "💵 Efectivo",
  MERCADOPAGO: "📱 MercadoPago",
  TRANSFER: "🏦 Transferencia",
  DEBIT: "💳 Débito",
  CREDIT_CARD: "🏧 Tarjeta",
  CREDIT: "📋 Fiado",
};

const INVOICE_LABEL: Record<string, string> = {
  ISSUED: "✅ Emitida",
  PENDING: "⏳ Pendiente",
  FAILED: "❌ Fallida",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}

function VentasFilterBar({
  metodo,
  setMetodo,
  search,
  setSearch,
}: {
  metodo: string;
  setMetodo: (m: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-3)",
            marginBottom: 4,
          }}
        >
          Método de pago
        </label>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          <option value="">Todos los métodos</option>
          <option value="CASH">Efectivo</option>
          <option value="MERCADOPAGO">MercadoPago</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="DEBIT">Débito</option>
          <option value="CREDIT_CARD">Tarjeta</option>
          <option value="CREDIT">Fiado</option>
        </select>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-3)",
            marginBottom: 4,
          }}
        >
          Buscar
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ticket o producto..."
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
          }}
        />
      </div>
    </div>
  );
}

function VentasTable({
  ventas,
  page,
  setPage,
}: {
  ventas: VentaItem[];
  page: number;
  setPage: (p: number) => void;
}) {
  const itemsPerPage = 20;
  const totalPages = Math.ceil(ventas.length / itemsPerPage);
  const paginatedVentas = ventas.slice((page - 1) * itemsPerPage, page * itemsPerPage);

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
        Listado de ventas
      </h3>

      {ventas.length === 0 ? (
        <EmptyState emoji="📭" title="Sin ventas" description="No hay ventas en este período" />
      ) : (
        <>
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
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Fecha</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Ticket</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Empleado</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Método</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Items</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Total</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedVentas.map((venta) => (
                  <tr
                    key={venta.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: venta.voided ? 0.5 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{formatDate(new Date(venta.createdAt))}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {formatTime(new Date(venta.createdAt))}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {venta.ticketNumber ? (
                        <span style={{ fontWeight: 600 }}>#{venta.ticketNumber}</span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 12 }}>Sin ticket</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {venta.employeeName ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ fontSize: 12 }}>
                        {METODO_LABEL[venta.paymentMethod] ?? venta.paymentMethod}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ color: "var(--text-2)" }}>{venta.itemsCount}</span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: venta.voided ? "var(--red)" : "var(--text)",
                        }}
                      >
                        {formatARS(venta.total)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {venta.voided ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(239,68,68,0.15)",
                            color: "var(--red)",
                          }}
                        >
                          ANULADA
                        </span>
                      ) : venta.invoiceStatus ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background:
                              venta.invoiceStatus === "ISSUED"
                                ? "rgba(34,197,94,0.15)"
                                : venta.invoiceStatus === "FAILED"
                                ? "rgba(239,68,68,0.15)"
                                : "rgba(251,191,36,0.15)",
                            color:
                              venta.invoiceStatus === "ISSUED"
                                ? "var(--green)"
                                : venta.invoiceStatus === "FAILED"
                                ? "var(--red)"
                                : "var(--amber)",
                          }}
                        >
                          {INVOICE_LABEL[venta.invoiceStatus] ?? venta.invoiceStatus}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                ‹ Anterior
              </button>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Página {page} de {totalPages}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                Siguiente ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VentasPorHoraChart({ ventasPorHora }: { ventasPorHora: VentasData["ventasPorHora"] }) {
  const data = ventasPorHora
    .filter((h) => h.cantidad > 0)
    .map((h) => ({
      hora: `${String(h.hora).padStart(2, "0")}:00`,
      cantidad: h.cantidad,
      total: h.total,
    }));

  if (data.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="Sin datos"
        description="No hay ventas por hora para mostrar"
      />
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
        Ventas por hora del día
      </h3>
      <BarChart data={data} valueKey="total" labelKey="hora" />
    </div>
  );
}

function ProductosList({
  title,
  productos,
  emoji,
}: {
  title: string;
  productos: Array<{ name: string; cantidad: number; total: number }>;
  emoji: string;
}) {
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
        {emoji} {title}
      </h3>
      {productos.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          Sin datos
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {productos.map((p, idx) => (
            <div
              key={p.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: idx < productos.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: idx < 3 ? "var(--primary)" : "var(--surface-2)",
                    color: idx < 3 ? "#000" : "var(--text-3)",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ color: "var(--text-2)" }}>{p.name}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600 }}>{p.cantidad} ud.</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{formatARS(p.total)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FacturasAfipKpis({
  facturas,
}: {
  facturas: { emitidas: number; pendientes: number; fallidas: number };
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <KpiCard
        label="Emitidas"
        value={String(facturas.emitidas)}
        highlight
      />
      <KpiCard
        label="Pendientes"
        value={String(facturas.pendientes)}
        warning={facturas.pendientes > 0}
      />
      <KpiCard
        label="Fallidas"
        value={String(facturas.fallidas)}
        warning={facturas.fallidas > 0}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabVentas({
  periodo,
  currentDate,
}: {
  periodo: Periodo;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<VentasData | null>(null);
  const [loading, setLoading] = useState(false);
  const [metodo, setMetodo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        periodo,
        isoDate: currentDate,
      });
      if (metodo) params.set("metodo", metodo);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/stats/ventas?${params}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
      setPage(1); // Reset page on filter change
    } finally {
      setLoading(false);
    }
  }, [branchId, periodo, currentDate, metodo, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter ventas locally for voided status (always show, but highlight)
  const ventasFiltradas = useMemo(() => {
    if (!data) return [];
    return data.ventas;
  }, [data]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Cargando ventas...
      </div>
    );
  }

  if (!data) return null;

  const ticketPromedio = data.cantidadVentas > 0
    ? data.totalVentas / data.cantidadVentas
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <VentasFilterBar
        metodo={metodo}
        setMetodo={setMetodo}
        search={search}
        setSearch={setSearch}
      />

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Total ventas"
          value={data.totalVentas}
          sub={`${data.cantidadVentas} operaciones`}
        />
        <KpiCard
          label="Ticket promedio"
          value={ticketPromedio}
        />
        <KpiCard
          label="Ventas fiado"
          value={data.ventasFiado.total}
          sub={`${data.ventasFiado.cantidad} operaciones`}
          warning={data.ventasFiado.cantidad > 0}
        />
        <KpiCard
          label="Método top"
          value={(() => {
            const top = Object.entries(data.ventasPorMetodo).sort((a, b) => b[1] - a[1])[0];
            return top ? METODO_LABEL[top[0]] ?? top[0] : "—";
          })()}
          sub={(() => {
            const top = Object.entries(data.ventasPorMetodo).sort((a, b) => b[1] - a[1])[0];
            return top ? formatARS(top[1]) : "—";
          })()}
        />
      </div>

      {/* Facturas AFIP */}
      <FacturasAfipKpis facturas={data.facturasAfip} />

      {/* Ventas por hora */}
      <VentasPorHoraChart ventasPorHora={data.ventasPorHora} />

      {/* Productos más y menos vendidos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ProductosList
          title="Más vendidos"
          productos={data.productosMasVendidos}
          emoji="🏆"
        />
        <ProductosList
          title="Menos vendidos"
          productos={data.productosMenosVendidos}
          emoji="📉"
        />
      </div>

      {/* Tabla de ventas */}
      <VentasTable
        ventas={ventasFiltradas}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}
