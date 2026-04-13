import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function PartnersWidget() {
  const [
    pendingCommissionsAgg,
    totalPartners,
    activeReferrals,
  ] = await Promise.all([
    prisma.commission.aggregate({
      _sum: { amount: true },
      where: { status: "PENDING" },
    }),
    prisma.partnerProfile.count({
      where: { isApproved: true },
    }),
    prisma.referral.count({
      where: { status: "ACTIVE" },
    }),
  ]);

  const pendingAmount = pendingCommissionsAgg._sum.amount || 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bento-card partners-card">
      <div className="bento-card-header">
        <span className="bento-card-title">Programa Partners</span>
        <Link href="/admin/partners" className="bento-link">Ver todos</Link>
      </div>

      <div className="partners-content">
        <div className="partner-stat">
          <span className="partner-stat-label">Comisiones a Pagar</span>
          <span className={`partner-stat-value ${pendingAmount > 0 ? "text-amber-400" : ""}`}>
            {formatCurrency(pendingAmount)}
          </span>
        </div>
        
        <div className="partner-metrics">
          <div className="metric">
            <span className="metric-value">{totalPartners}</span>
            <span className="metric-label">Partners</span>
          </div>
          <div className="metric">
            <span className="metric-value">{activeReferrals}</span>
            <span className="metric-label">Referidos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
