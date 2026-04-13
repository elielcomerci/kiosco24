import { prisma } from "@/lib/prisma";
import AdminAreaChart from "./AdminAreaChart";

export default async function MacroStatsWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeSubscriptions,
    gmvAgg,
    totalKioscos,
    ticketsThirtyDays,
  ] = await Promise.all([
    prisma.subscription.count({
      where: { status: "ACTIVE" },
    }),
    prisma.sale.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: thirtyDaysAgo }, voided: false },
    }),
    prisma.kiosco.count(),
    prisma.sale.count({
      where: { createdAt: { gte: thirtyDaysAgo }, voided: false },
    }),
  ]);

  const totalGmv = gmvAgg._sum.total || 0;

  // Formateador de moneda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Datos dummy para el gráfico (En el futuro esto se poblará desde un query de serie de tiempo)
  const chartData = [
    { name: "S1", value: totalGmv * 0.15 },
    { name: "S2", value: totalGmv * 0.25 },
    { name: "S3", value: totalGmv * 0.20 },
    { name: "S4", value: totalGmv * 0.40 },
  ];

  return (
    <div className="macro-bento-grid">
      <div className="bento-card gmv-card">
        <div className="bento-card-header">
          <span className="bento-card-title">Volumen Operado (30d)</span>
          <span className="bento-badge">Global</span>
        </div>
        <div className="bento-card-value highlight">{formatCurrency(totalGmv)}</div>
        <div className="bento-card-subtext">{ticketsThirtyDays.toLocaleString()} tickets emitidos en la red</div>
        
        <div className="bento-chart-container">
          <AdminAreaChart data={chartData} color="#3b82f6" height={100} />
        </div>
      </div>

      <div className="bento-card stats-card">
        <div className="bento-card-header">
          <span className="bento-card-title">Suscripciones Activas</span>
        </div>
        <div className="bento-card-value">{activeSubscriptions}</div>
        <div className="bento-card-subtext">Clientes de pago en la plataforma</div>
        <div className="bento-chart-container-small">
          <AdminAreaChart data={[
            { name: "Q1", value: Math.round(activeSubscriptions * 0.6) },
            { name: "Q2", value: Math.round(activeSubscriptions * 0.8) },
            { name: "Q3", value: Math.round(activeSubscriptions * 0.9) },
            { name: "Q4", value: activeSubscriptions },
          ]} color="#22c55e" height={60} />
        </div>
      </div>

      <div className="bento-card stats-card">
        <div className="bento-card-header">
          <span className="bento-card-title">Total de Kioscos</span>
        </div>
        <div className="bento-card-value text-white">{totalKioscos}</div>
        <div className="bento-card-subtext">Cuentas registradas histórico</div>
      </div>
    </div>
  );
}
