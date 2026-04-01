"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatARS } from "@/lib/utils";
import { KpiCard, EmptyState } from "@/components/stats";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClienteItem {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  createdAt: string;
  ultimaCompra: string | null;
  ultimoPago: string | null;
  comprasCantidad: number;
  comprasTotal: number;
  pagosCantidad: number;
  pagosTotal: number;
  diasDeuda: number | null;
}

interface FiadosData {
  clientes: ClienteItem[];
  resumen: {
    totalClientes: number;
    clientesDeudores: number;
    deudaTotal: number;
    deudaVencida: number;
    pagosDelMes: number;
    pagosTotalMes: number;
  };
  movimientosRecientes: Array<{
    tipo: "compra" | "pago";
    clienteId: string;
    clienteNombre: string;
    fecha: string;
    monto: number;
    saldoPosterior: number;
  }>;
  topDeudores: Array<{
    id: string;
    name: string;
    balance: number;
    diasDeuda: number | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FiadosSearchBar({
  search,
  setSearch,
  estado,
  setEstado,
}: {
  search: string;
  setSearch: (s: string) => void;
  estado: string;
  setEstado: (e: string) => void;
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
          Buscar cliente
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre..."
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
          Estado
        </label>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
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
          <option value="deudores">Solo deudores</option>
          <option value="todos">Todos los clientes</option>
          <option value="sin_deuda">Sin deuda</option>
        </select>
      </div>
    </div>
  );
}

function TopDeudores({ topDeudores }: { topDeudores: FiadosData["topDeudores"] }) {
  if (topDeudores.length === 0) {
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
        ⚠️ Top Deudores
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {topDeudores.map((deudor, idx) => (
          <div
            key={deudor.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px",
              background: idx === 0
                ? "rgba(239,68,68,0.08)"
                : "rgba(15,23,42,0.5)",
              border: `1px solid ${idx === 0 ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-2)" }}>
                {idx + 1}. {deudor.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                {formatDays(deudor.diasDeuda)}
              </div>
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: idx === 0 ? "var(--red)" : "var(--text)",
              }}
            >
              {formatARS(deudor.balance)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MovimientosRecientes({ movimientos }: { movimientos: FiadosData["movimientosRecientes"] }) {
  if (movimientos.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="Sin movimientos"
        description="No hay movimientos recientes"
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
        📋 Movimientos Recientes
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {movimientos.slice(0, 10).map((mov, idx) => (
          <div
            key={`${mov.clienteId}-${mov.fecha}-${idx}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: mov.tipo === "compra" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  color: mov.tipo === "compra" ? "var(--red)" : "var(--green)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {mov.tipo === "compra" ? "−" : "+"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-2)" }}>
                  {mov.clienteNombre}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {mov.tipo === "compra" ? "Compra" : "Pago"} · {formatDate(new Date(mov.fecha))}
                </div>
              </div>
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: mov.tipo === "compra" ? "var(--red)" : "var(--green)",
              }}
            >
              {mov.tipo === "compra" ? "−" : "+"}{formatARS(mov.monto)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientesTable({
  clientes,
  page,
  setPage,
}: {
  clientes: ClienteItem[];
  page: number;
  setPage: (p: number) => void;
}) {
  const itemsPerPage = 20;
  const totalPages = Math.ceil(clientes.length / itemsPerPage);
  const paginatedClientes = clientes.slice((page - 1) * itemsPerPage, page * itemsPerPage);

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
        Clientes con cuenta corriente
      </h3>

      {clientes.length === 0 ? (
        <EmptyState emoji="📭" title="Sin clientes" description="No hay clientes para mostrar" />
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
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Cliente</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Teléfono</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Saldo</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Días deuda</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Compras</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Pagos</th>
                  <th style={{ padding: "8px", fontWeight: 700, color: "var(--text-3)" }}>Último movimiento</th>
                </tr>
              </thead>
              <tbody>
                {paginatedClientes.map((cliente) => (
                  <tr
                    key={cliente.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      opacity: cliente.balance <= 0 ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-2)" }}>
                        {cliente.name}
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {cliente.phone ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: cliente.balance > 0 ? "var(--red)" : "var(--green)",
                        }}
                      >
                        {cliente.balance > 0 ? formatARS(cliente.balance) : "$0"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {formatDays(cliente.diasDeuda)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{formatARS(cliente.comprasTotal)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {cliente.comprasCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600, color: "var(--green)" }}>
                        {formatARS(cliente.pagosTotal)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {cliente.pagosCantidad} ops
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {cliente.ultimoPago || cliente.ultimaCompra ? (
                        <span style={{ color: "var(--text-2)" }}>
                          {formatDate(new Date(cliente.ultimoPago! || cliente.ultimaCompra!))}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabFiados({
  periodo,
  currentDate,
}: {
  periodo: string;
  currentDate: string;
}) {
  const params = useParams();
  const branchId = params.branchId as string;

  const [data, setData] = useState<FiadosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("deudores");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        estado,
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/stats/fiados?${params}`, {
        headers: { "x-branch-id": branchId },
      });
      const json = await res.json();
      setData(json);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [branchId, search, estado]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
        Cargando fiados...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Buscador y filtros */}
      <FiadosSearchBar
        search={search}
        setSearch={setSearch}
        estado={estado}
        setEstado={setEstado}
      />

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <KpiCard
          label="Total clientes"
          value={String(data.resumen.totalClientes)}
          sub={`${data.resumen.clientesDeudores} con deuda`}
        />
        <KpiCard
          label="Deuda total"
          value={data.resumen.deudaTotal}
          warning={data.resumen.deudaTotal > 0}
          sub={`${data.resumen.clientesDeudores} clientes deudores`}
        />
        <KpiCard
          label="Deuda vencida"
          value={data.resumen.deudaVencida}
          warning={data.resumen.deudaVencida > 0}
          sub={data.resumen.deudaVencida > 0 ? "> 30 días" : "Sin deuda vencida"}
        />
        <KpiCard
          label="Pagos del mes"
          value={data.resumen.pagosTotalMes}
          sub={`${data.resumen.pagosDelMes} pagos recibidos`}
          highlight={data.resumen.pagosDelMes > 0}
        />
      </div>

      {/* Top deudores */}
      <TopDeudores topDeudores={data.topDeudores} />

      {/* Movimientos recientes */}
      <MovimientosRecientes movimientos={data.movimientosRecientes} />

      {/* Tabla de clientes */}
      <ClientesTable
        clientes={data.clientes}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}
