import * as XLSX from "xlsx";
import { PaymentMethod } from "@/lib/prisma";
import { formatARS } from "@/lib/utils";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  MERCADOPAGO: "MercadoPago",
  TRANSFER: "Transferencia",
  DEBIT: "Débito",
  CREDIT_CARD: "Tarjeta Créd.",
  CREDIT: "Fiado",
};

export type ExportSaleRow = {
  fecha: string;
  hora: string;
  comprobante: string;
  total: number;
  medioDePago: string;
  cajero: string;
  articulos: string;
};

export async function exportSalesSpreadsheet(params: {
  facturadas: ExportSaleRow[];
  tickets: ExportSaleRow[];
  libres: ExportSaleRow[];
}): Promise<Buffer> {
  const wb = XLSX.utils.book_new();

  const addSheet = (data: ExportSaleRow[], sheetName: string) => {
    if (data.length === 0) return;
    
    // Map data to the desired format for Excel
    const mappedData = data.map(sale => ({
      "Fecha": sale.fecha,
      "Hora": sale.hora,
      "Comprobante": sale.comprobante,
      "Total": sale.total,
      "Medio de pago": sale.medioDePago,
      "Cajero": sale.cajero,
      "Artículos": sale.articulos
    }));

    const ws = XLSX.utils.json_to_sheet(mappedData);

    // Ajustar anchos de columnas
    const wscols = [
      { wch: 12 }, // Fecha
      { wch: 10 }, // Hora
      { wch: 16 }, // Comprobante
      { wch: 12 }, // Total
      { wch: 16 }, // Medio de pago
      { wch: 18 }, // Cajero
      { wch: 60 }, // Artículos
    ];
    ws["!cols"] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  addSheet(params.facturadas, "Facturadas");
  addSheet(params.tickets, "Tickets No Fiscales");
  addSheet(params.libres, "Ventas Libres");

  // Si no hay ninguna solapa creada porque todo estaba vacío, creamos una hoja vacía
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.json_to_sheet([{ Mensaje: "No hay ventas para los filtros seleccionados" }]);
    XLSX.utils.book_append_sheet(wb, ws, "Sin Datos");
  }

  // Generar Buffer
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
}
