"use client";

import { pdf } from "@react-pdf/renderer";
import VentasReportPDF from "@/components/reports/VentasReportPDF";

interface ReportData {
  branchName: string;
  kioscoName: string;
  period: { from: string; to: string };
  summary: {
    totalVentas: number;
    ventasEfectivo: number;
    ventasMp: number;
    ventasDebito: number;
    ventasTransferencia: number;
    ventasTarjeta: number;
    ventasFiado: number;
    totalGastos: number;
    totalRetiros: number;
    ganancia: number | null;
    hasCosts: boolean;
  };
  stats: {
    totalVentas: number;
    totalGastos: number;
    totalRetiros: number;
    totalTurnos: number;
  };
  sales: Array<{
    id: string;
    date: string;
    total: number;
    paymentMethod: string;
    employeeName: string;
    itemsCount: number;
  }>;
  expenses: Array<{
    id: string;
    date: string;
    amount: number;
    reason: string;
    note: string | null;
    employeeName: string;
  }>;
  withdrawals: Array<{
    id: string;
    date: string;
    amount: number;
    note: string | null;
    employeeName: string;
  }>;
  shifts: Array<{
    id: string;
    openedAt: string;
    closedAt: string | null;
    employeeName: string;
    openingAmount: number;
    closingAmount: number | null;
    difference: number | null;
  }>;
}

export async function downloadVentasReportPDF(
  data: ReportData,
  filename?: string
): Promise<void> {
  const doc = <VentasReportPDF data={data} />;
  const blob = await pdf(doc).toBlob();
  
  const defaultFilename = `reporte-ventas-${data.period.from}-${data.period.to}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || defaultFilename;
  link.click();
  URL.revokeObjectURL(url);
}
