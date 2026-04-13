import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function OperationsHealthWidget() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    pendingProducts,
    failedInvoices,
    failedScrapes,
  ] = await Promise.all([
    prisma.platformProductSubmission.count({
      where: { status: "PENDING" },
    }),
    prisma.invoice.count({
      where: { status: "FAILED", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.scrapeRun.count({
      where: { status: "FAILED", createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  return (
    <div className="bento-card operations-card">
      <div className="bento-card-header">
        <span className="bento-card-title">Salud Operacional</span>
      </div>
      
      <div className="operations-list">
        <div className="operation-item">
          <div className="operation-info">
            <span className={`status-dot ${pendingProducts > 0 ? "warning" : "ok"}`}></span>
            <span className="operation-name">Moderación de Catálogo</span>
          </div>
          <div className="operation-action">
            <span className="operation-value">{pendingProducts} pendientes</span>
            {pendingProducts > 0 && (
              <Link href="/admin/productos" className="bento-btn">Revisar</Link>
            )}
          </div>
        </div>

        <div className="operation-item">
          <div className="operation-info">
            <span className={`status-dot ${failedInvoices > 0 ? "danger" : "ok"}`}></span>
            <span className="operation-name">AFIP Facturación Fails (30d)</span>
          </div>
          <div className="operation-action">
            <span className="operation-value">{failedInvoices} fallos</span>
          </div>
        </div>

        <div className="operation-item">
          <div className="operation-info">
            <span className={`status-dot ${failedScrapes > 0 ? "danger" : "ok"}`}></span>
            <span className="operation-name">Motores Scraper (Fails 30d)</span>
          </div>
          <div className="operation-action">
            <span className="operation-value">{failedScrapes} fallos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
