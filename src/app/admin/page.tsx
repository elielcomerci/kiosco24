import { Suspense } from "react";
import AdminRentabilityCalculator from "@/components/admin/AdminRentabilityCalculator";
import MacroStatsWidget from "@/components/admin/widgets/MacroStatsWidget";
import OperationsHealthWidget from "@/components/admin/widgets/OperationsHealthWidget";
import PartnersWidget from "@/components/admin/widgets/PartnersWidget";
import "./admin-dashboard.css";

function WidgetSkeleton({ title }: { title: string }) {
  return (
    <div className="bento-card skeleton-card">
      <div className="bento-card-header">
        <span className="bento-card-title">{title}</span>
      </div>
      <div className="skeleton-line" style={{ width: "60%", height: "32px", marginTop: "16px" }}></div>
      <div className="skeleton-line" style={{ width: "40%", marginTop: "12px" }}></div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div>
          <h1 className="admin-dashboard__title">Panel Estratégico</h1>
          <p className="admin-dashboard__subtitle">
            Métricas globales del sistema en tiempo real.
          </p>
        </div>
        <div className="admin-dashboard__actions">
          <span className="live-indicator">
            <span className="pulse-dot"></span> Live
          </span>
        </div>
      </div>

      <div className="bento-layout">
        {/* Main Financial & Growth Column */}
        <div className="bento-col-main">
          <Suspense fallback={<WidgetSkeleton title="Macro Economía" />}>
            <MacroStatsWidget />
          </Suspense>
        </div>

        {/* Secondary Column: Operations & Partners */}
        <div className="bento-col-side">
          <Suspense fallback={<WidgetSkeleton title="Salud Operacional" />}>
            <OperationsHealthWidget />
          </Suspense>
          
          <Suspense fallback={<WidgetSkeleton title="Programa Partners" />}>
            <PartnersWidget />
          </Suspense>
        </div>
      </div>

      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__section-title">Calculadora de rentabilidad</h2>
        <AdminRentabilityCalculator />
      </section>
    </div>
  );
}
