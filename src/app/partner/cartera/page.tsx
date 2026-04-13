import { getPartnerSession, getPartnerReferrals } from "@/lib/partner-service";
import React from "react";

export const metadata = {
  title: "Mi Cartera | Clikit Partner",
};

export default async function PartnerCarteraPage() {
  const profile = await getPartnerSession();
  const referrals = await getPartnerReferrals(profile.id);

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
            Cartera de Clientes
          </h1>
          <p className="text-[#8fa3ba] text-sm">
            Monitoreá la salud y el flujo de ingresos de tu red de kioscos.
          </p>
        </div>
        <div className="bg-[#22d98a]/10 text-[#22d98a] px-4 py-2 rounded-full text-xs font-bold border border-[#22d98a]/20">
          {referrals.length} en total
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="text-center py-20 bg-[#0e121b] border border-white/5 rounded-2xl">
          <div className="text-4xl mb-4">🤝</div>
          <h3 className="text-lg font-bold text-white mb-2">Aún no hay kioscos en tu red</h3>
          <p className="text-sm text-[#8fa3ba]">Compartí tu link para empezar a sumar referidos y generar ingresos pasivos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {referrals.map((client) => {
            const isGreen = client.state === "GENERANDO";
            const isYellow = client.state === "ACTIVO_SIN_CONSUMO";
            const isRed = client.state === "INACTIVO";

            return (
              <div 
                key={client.referralId}
                className="bg-[#0e121b] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all relative overflow-hidden"
              >
                {/* Indicador de estado superior */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  isGreen ? "bg-gradient-to-r from-[#22d98a] to-[#10b981]" :
                  isYellow ? "bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]" :
                  "bg-gradient-to-r from-[#f87171] to-[#ef4444]"
                }`} />

                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">
                      {client.kioscoName || "Kiosco sin nombre"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        isGreen ? "bg-[#22d98a]" : isYellow ? "bg-[#fbbf24]" : "bg-[#f87171]"
                      }`} style={{ boxShadow: `0 0 8px ${isGreen ? "#22d98a" : isYellow ? "#fbbf24" : "#f87171"}` }} />
                      <span className="text-[11px] font-bold text-[#8fa3ba] uppercase tracking-wider">
                        {isGreen ? "Generando Ingresos" : isYellow ? "Activo (Sin Facturación)" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-end mt-6 pt-4 border-t border-white/5">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#6b7e96] tracking-wider mb-1">Impacto (MRR)</div>
                    <div className={`text-lg font-mono font-bold ${isGreen ? "text-[#22d98a]" : "text-[#cbd5e1]"}`}>
                      {isGreen ? "+" : ""}{formatCurrency(client.mrrGenerated)}<span className="text-xs text-[#6b7e96] ml-1">/mes</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-[#6b7e96] tracking-wider mb-1">Alta de cuenta</div>
                    <div className="text-xs font-bold text-[#8fa3ba]">
                      {client.activatedAt.toLocaleDateString("es-AR", { month: "short", day: "numeric", year: "numeric"})}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}