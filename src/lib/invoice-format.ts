import { formatARS } from "@/lib/utils";
import {
  formatDateForHuman,
  formatFiscalVoucherNumber,
  getEmitterIvaLabel,
  getInvoiceTypeLabel,
  getReceiverIvaConditionOption,
  parseEmitterSnapshot,
} from "@/lib/fiscal";
import type { TicketPrintMode } from "@/lib/ticketing";

export type InvoicePreviewItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type InvoicePreviewData = {
  invoiceId: string;
  saleId: string;
  status: "PENDING" | "ISSUED" | "FAILED";
  printMode: TicketPrintMode;
  invoiceTypeLabel: string;
  voucherNumberFormatted: string | null;
  issuedAt: string | null;
  cae: string | null;
  caeDueDate: string | null;
  emitterBusinessName: string | null;
  emitterCuit: string | null;
  emitterAddress: string | null;
  emitterIvaCondition: string | null;
  emitterGrossIncome: string | null;
  emitterActivityStartDate: string | null;
  receiverName: string | null;
  receiverDocumentType: number;
  receiverDocumentNumber: string;
  receiverIvaConditionId: number | null;
  receiverIvaConditionLabel: string | null;
  items: InvoicePreviewItem[];
  total: number;
  netAmount: number;
  vatAmount: number;
  paymentMethodLabel: string;
  pdfBlobUrl: string | null;
  pdfAfipUrl: string | null;
  lastError: string | null;
};

export function buildInvoicePreviewData(
  invoice: {
    id: string;
    saleId: string;
    status: "PENDING" | "ISSUED" | "FAILED";
    cae: string | null;
    caeFchVto: Date | null;
    comprobanteTipo: number | null;
    comprobanteNro: number | null;
    puntoDeVenta: number | null;
    fechaEmision: Date | null;
    docTipo: number;
    docNro: string;
    receiverName: string | null;
    receiverIvaConditionId: number | null;
    receiverIvaConditionLabel: string | null;
    impTotal: number;
    impNeto: number;
    impIva: number;
    pdfBlobUrl: string | null;
    pdfAfipUrl: string | null;
    lastError: string | null;
    emitterSnapshot: unknown;
    sale: {
      paymentMethod: string;
      items: Array<{
        name: string;
        quantity: number;
        price: number;
      }>;
      creditCustomer?: { name: string | null } | null;
    };
  },
  paymentMethodLabel: string,
  printMode: TicketPrintMode = "STANDARD",
): InvoicePreviewData {
  const emitter = parseEmitterSnapshot(invoice.emitterSnapshot);
  const receiverCondition =
    invoice.receiverIvaConditionLabel ||
    (invoice.receiverIvaConditionId === getReceiverIvaConditionOption("RESPONSABLE_INSCRIPTO").id
      ? getReceiverIvaConditionOption("RESPONSABLE_INSCRIPTO").label
      : invoice.receiverIvaConditionId === getReceiverIvaConditionOption("MONOTRIBUTO").id
        ? getReceiverIvaConditionOption("MONOTRIBUTO").label
        : invoice.receiverIvaConditionId === getReceiverIvaConditionOption("EXENTO").id
          ? getReceiverIvaConditionOption("EXENTO").label
          : invoice.receiverIvaConditionId === getReceiverIvaConditionOption("CONSUMIDOR_FINAL").id
            ? getReceiverIvaConditionOption("CONSUMIDOR_FINAL").label
            : null);

  return {
    invoiceId: invoice.id,
    saleId: invoice.saleId,
    status: invoice.status,
    printMode,
    invoiceTypeLabel: getInvoiceTypeLabel(invoice.comprobanteTipo),
    voucherNumberFormatted: formatFiscalVoucherNumber(invoice.puntoDeVenta, invoice.comprobanteNro),
    issuedAt: invoice.fechaEmision ? invoice.fechaEmision.toISOString() : null,
    cae: invoice.cae,
    caeDueDate: invoice.caeFchVto ? invoice.caeFchVto.toISOString() : null,
    emitterBusinessName: emitter?.razonSocial ?? null,
    emitterCuit: emitter?.cuit ?? null,
    emitterAddress: emitter?.domicilioFiscal ?? null,
    emitterIvaCondition: emitter ? getEmitterIvaLabel(emitter.condicionIva) : null,
    emitterGrossIncome: emitter?.ingresosBrutos ?? null,
    emitterActivityStartDate: emitter?.inicioActividad ?? null,
    receiverName: invoice.receiverName,
    receiverDocumentType: invoice.docTipo,
    receiverDocumentNumber: invoice.docNro,
    receiverIvaConditionId: invoice.receiverIvaConditionId,
    receiverIvaConditionLabel: receiverCondition,
    items: invoice.sale.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      subtotal: item.quantity * item.price,
    })),
    total: invoice.impTotal,
    netAmount: invoice.impNeto,
    vatAmount: invoice.impIva,
    paymentMethodLabel,
    pdfBlobUrl: invoice.pdfBlobUrl,
    pdfAfipUrl: invoice.pdfAfipUrl,
    lastError: invoice.lastError,
  };
}

export function generateWhatsAppInvoiceText(invoice: InvoicePreviewData) {
  const lines = [
    `*${invoice.invoiceTypeLabel}${invoice.voucherNumberFormatted ? ` Nro. ${invoice.voucherNumberFormatted}` : ""}*`,
    ...(invoice.emitterBusinessName ? [invoice.emitterBusinessName] : []),
    ...(invoice.emitterCuit ? [`CUIT: ${invoice.emitterCuit}`] : []),
    ...(invoice.issuedAt ? [`Fecha: ${formatDateForHuman(new Date(invoice.issuedAt))}`] : []),
    "",
    ...invoice.items.map((item) => `${item.name} x${item.quantity} .... ${formatARS(item.subtotal)}`),
    "",
    `*TOTAL: ${formatARS(invoice.total)}*`,
  ];

  if (invoice.cae) {
    lines.push("", `CAE: ${invoice.cae}`);
  }
  if (invoice.caeDueDate) {
    lines.push(`Vto. CAE: ${formatDateForHuman(new Date(invoice.caeDueDate))}`);
  }
  if (invoice.pdfBlobUrl) {
    lines.push("", invoice.pdfBlobUrl);
  }

  return lines.join("\n");
}
