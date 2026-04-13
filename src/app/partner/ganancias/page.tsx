import { getPartnerSession, buildLedger } from "@/lib/partner-service";
import Link from "next/link";
import React from "react";

export const metadata = {
  title: "Ganancias | Clikit Partner",
};

export default async function PartnerGananciasPage() {
  const profile = await getPartnerSession();
  const ledgerData = await buildLedger(profile.id);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="p-8 pb-20 fade-in w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>
            Ganancias y Retiros
          </h1>
          <p className="text-[#8fa3ba] text-sm">
            Tu historial financiero completo, unificado en tiempo real.
          </p>
        </div>
      </div>

      {/* BALANCE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {/* Disponible */}
        <div className="bg-[#0e121b] border border-[#22d98a]/20 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#22d98a] to-[#10b981]" />
          <div className="text-[#6b7e96] text-[11px] font-bold uppercase tracking-wider mb-2">
            Disponible para retirar
          </div>
          <div className="text-3xl font-bold font-mono text-[#22d98a]">
            {formatCurrency(ledgerData.availableBalance)}
          </div>
          <p className="text-[#8fa3ba] text-xs mt-3">
            Habilitado de forma inmediata.
          </p>
        </div>

        {/* Retirado Total */}
        <div className="bg-[#06080d] border border-white/5 rounded-2xl p-6">
          <div className="text-[#6b7e96] text-[11px] font-bold uppercase tracking-wider mb-2">
            Total Retirado
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {formatCurrency(ledgerData.payoutsPaid + ledgerData.payoutsReserved)}
          </div>
          <p className="text-[#8fa3ba] text-xs mt-3">
            Acumulado histórico liquidado.
          </p>
        </div>

        {/* Bruto Total */}
        <div className="bg-[#06080d] border border-white/5 rounded-2xl p-6">
          <div className="text-[#6b7e96] text-[11px] font-bold uppercase tracking-wider mb-2">
            Ingresos Brutos
          </div>
          <div className="text-2xl font-bold font-mono text-[#cbd5e1]">
            {formatCurrency(ledgerData.totalEarnings)}
          </div>
          <p className="text-[#8fa3ba] text-xs mt-3">
            Suma total generada.
          </p>
        </div>
      </div>

      {/* LEDGER TIMELINE */}
      <div className="bg-[#0e121b] border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 pb-4 border-b border-white/5">
          Libro Mayor (Historial)
        </h2>

        {ledgerData.ledger.length === 0 ? (
          <div className="text-center py-10 opacity-50">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm text-[#8fa3ba]">Aún no tenés movimientos registrados.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {ledgerData.ledger.map((entry) => (
              <div 
                key={entry.id} 
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    entry.type === "COMMISSION" 
                      ? "bg-[#22d98a]/10 text-[#22d98a]" 
                      : "bg-[#f87171]/10 text-[#f87171]"
                  }`}>
                    {entry.type === "COMMISSION" ? "↓" : "↑"}
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-white mb-0.5">
                      {entry.description}
                    </div>
                    <div className="text-[11px] text-[#8fa3ba]">
                      {entry.createdAt.toLocaleDateString("es-AR", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-[15px] font-bold font-mono ${
                    entry.type === "COMMISSION" ? "text-[#22d98a]" : "text-[#eef2f7]"
                  }`}>
                    {entry.type === "COMMISSION" ? "+" : ""}{formatCurrency(entry.amount)}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{
                    color: entry.status === "PENDING" ? "#fbbf24" : 
                           entry.status === "APPROVED" || entry.status === "PAID" ? "#22d98a" : "#f87171"
                  }}>
                    {entry.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
