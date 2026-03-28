"use client";

import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";

interface CajaTotalsStats {
  enCaja: number;
  ganancia: number | null;
  hasCosts: boolean;
  openingAmount?: number;
  ventasEfectivo?: number;
  ventasMp?: number;
  ventasDebito?: number;
  ventasTransferencia?: number;
  ventasTarjeta?: number;
  ventasFiado?: number;
  totalVentas?: number;
  totalGastos?: number;
  totalRetiros?: number;
}

export default function CajaTotalsBreakdownModal({
  stats,
  onClose,
}: {
  stats: CajaTotalsStats;
  onClose: () => void;
}) {
  const paymentRows = [
    { label: "Efectivo", value: stats.ventasEfectivo ?? 0, icon: "💵" },
    { label: "MercadoPago", value: stats.ventasMp ?? 0, icon: "📱" },
    { label: "Debito", value: stats.ventasDebito ?? 0, icon: "💳" },
    { label: "Transferencia", value: stats.ventasTransferencia ?? 0, icon: "🏦" },
    { label: "Tarjeta de credito", value: stats.ventasTarjeta ?? 0, icon: "🏧" },
    { label: "Fiado", value: stats.ventasFiado ?? 0, icon: "📋" },
  ].filter((row) => row.value > 0);

  const totalVentas = stats.totalVentas ?? paymentRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
        <div
          className="modal animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "420px", width: "95%", maxHeight: "85dvh", overflowY: "auto", padding: "20px" }}
        >
        <div style={{ display: "grid", gap: "6px", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0 }}>Caja del turno</h2>
          <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
            Desglose rapido del efectivo esperado y los medios de pago registrados en este turno.
          </div>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            display: "grid",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ color: "var(--text-2)" }}>Apertura</span>
            <strong>{formatARS(stats.openingAmount ?? 0)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ color: "var(--text-2)" }}>Ventas en efectivo</span>
            <strong style={{ color: "var(--primary)" }}>+ {formatARS(stats.ventasEfectivo ?? 0)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ color: "var(--text-2)" }}>Gastos</span>
            <strong style={{ color: "var(--red)" }}>- {formatARS(stats.totalGastos ?? 0)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ color: "var(--text-2)" }}>Retiros</span>
            <strong style={{ color: "var(--red)" }}>- {formatARS(stats.totalRetiros ?? 0)}</strong>
          </div>
          <div style={{ height: "1px", background: "var(--border)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "16px" }}>
            <span style={{ fontWeight: 700 }}>En caja</span>
            <strong style={{ color: "var(--primary)" }}>{formatARS(stats.enCaja)}</strong>
          </div>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            display: "grid",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Medios de pago</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Total vendido en este turno: {formatARS(totalVentas)}
              </div>
            </div>
          </div>

          {paymentRows.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
              Todavia no hay ventas registradas en este turno.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {paymentRows.map((row) => {
                const pct = totalVentas > 0 ? Math.round((row.value / totalVentas) * 100) : 0;
                return (
                  <div key={row.label} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "13px" }}>
                      <span style={{ color: "var(--text-2)" }}>
                        {row.icon} {row.label}
                      </span>
                      <strong>
                        {formatARS(row.value)}
                        <span style={{ color: "var(--text-3)", fontWeight: 500, marginLeft: "6px" }}>{pct}%</span>
                      </strong>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "999px",
                        overflow: "hidden",
                        background: "var(--surface)",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          borderRadius: "999px",
                          background: "var(--primary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {stats.hasCosts && stats.ganancia !== null && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "14px",
            }}
          >
            <span style={{ color: "var(--text-2)" }}>Ganancia estimada</span>
            <strong style={{ color: stats.ganancia >= 0 ? "var(--primary)" : "var(--red)" }}>
              {formatARS(stats.ganancia)}
            </strong>
          </div>
        )}

        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onClose}>
          Cerrar
        </button>
        </div>
      </div>
    </ModalPortal>
  );
}
