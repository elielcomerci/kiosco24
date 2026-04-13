import { getPartnerSession, getPartnerLinkPerformance } from "@/lib/partner-service";
import CopyLinkButton from "@/components/partner/CopyLinkButton";
import React from "react";
// Import simple QR generator if needed, but since it requires client side rendering and a canvas,
// we'll just use a styled placeholder or an external image API for the server component to keep it clean.

export const metadata = {
  title: "Compartir Link | Clikit Partner",
};

export default async function PartnerLinkPage() {
  const profile = await getPartnerSession();
  const perf = await getPartnerLinkPerformance(profile.id);

  // The origin is statically known for this app, but ideally from process.env.NEXT_PUBLIC_APP_URL
  const referralLink = `https://kiosco.clikit.com.ar/register?ref=${profile.referralCode}`;
  
  // Usaremos un servicio de generación de QR público gratuito optimizado en Edge
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(referralLink)}&color=0e121b&bgcolor=ffffff`;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="p-8 pb-20 fade-in w-full max-w-4xl mx-auto flex flex-col items-center">
      <div className="text-center mb-10 w-full">
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          Herramientas de Adquisición
        </h1>
        <p className="text-[#8fa3ba] text-sm max-w-lg mx-auto">
          Cada Kiosco que se registre y pague con tu link te otorgará un <strong className="text-white">50% de comisión residual</strong>.
        </p>
      </div>

      {/* PERFORMANCE WIDGET */}
      <div className="w-full bg-[#0e121b] border border-[#22d98a]/20 rounded-2xl p-6 mb-8 relative overflow-hidden flex items-center justify-between">
        <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-[#22d98a] to-[#3b82f6]" />
        <div>
          <div className="text-[#6b7e96] text-[11px] font-bold uppercase tracking-wider mb-1">
            Impacto histórico de tu link
          </div>
          <div className="text-sm font-bold text-white">
            Tu enlace ya generó <span className="text-[#22d98a]">{perf.totalReferrals} Kioscos</span> y ha inyectado <span className="text-[#3b82f6] font-mono">{formatCurrency(perf.injectedMRR)}</span> Mensuales a la red.
          </div>
        </div>
        <div className="text-4xl">🚀</div>
      </div>

      {/* BIG HUB */}
      <div className="w-full bg-[#06080d] border border-white/10 rounded-3xl p-8 flex flex-col items-center shadow-2xl">
        <div className="bg-white p-4 rounded-2xl mb-8 shadow-[0_0_40px_rgba(34,217,138,0.15)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg" />
        </div>

        <div className="w-full max-w-md bg-[#0e121b] border border-white/10 rounded-xl p-4 mb-6 relative group overflow-hidden">
          <div className="text-[10px] uppercase font-bold text-[#6b7e96] tracking-wider mb-2">Tu enlace único (Compartilo por WhatsApp)</div>
          <div className="font-mono text-[13px] text-[#cbd5e1] break-all leading-tight">
            {referralLink}
          </div>
        </div>

        <div className="flex gap-4 w-full max-w-md">
          <CopyLinkButton referralLink={referralLink} />
        </div>
      </div>
    </div>
  );
}
