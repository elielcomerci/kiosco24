import { put } from "@vercel/blob";
import type Afip from "@afipsdk/afip.js";

import { formatDateForHuman, getSaleConditionLabel, type FiscalEmitterSnapshot } from "@/lib/fiscal";

type InvoicePdfInput = {
  afip: Afip;
  emitter: FiscalEmitterSnapshot;
  voucherNumber: number;
  pointOfSale: number;
  issueDate: Date;
  cae: string;
  caeDueDate: Date;
  receiverName: string;
  receiverDocumentType: number;
  receiverDocumentNumber: string;
  receiverIvaConditionLabel: string;
  paymentMethod: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

function sanitizeSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

async function uploadPdfToBlob(fileUrl: string, fileName: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error("No se pudo descargar el PDF emitido por AfipSDK.");
  }

  const pdfBytes = await response.arrayBuffer();
  const safeFileName = sanitizeSegment(fileName.replace(/\.pdf$/i, ""), "factura");

  const blob = await put(`fiscal/${safeFileName}.pdf`, pdfBytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/pdf",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return blob.url;
}

export async function createInvoicePdf(input: InvoicePdfInput) {
  const issueDate = formatDateForHuman(input.issueDate);
  const caeDueDate = formatDateForHuman(input.caeDueDate);
  const fileName = `factura-c-${String(input.pointOfSale).padStart(5, "0")}-${String(input.voucherNumber).padStart(8, "0")}.pdf`;

  const pdf = await input.afip.ElectronicBilling.createPDF({
    file_name: fileName,
    template: {
      name: "invoice-c",
      params: {
        voucher_number: input.voucherNumber,
        sales_point: input.pointOfSale,
        issue_date: issueDate,
        cae_due_date: caeDueDate,
        issuer_cuit: Number(input.emitter.cuit),
        cae: Number(input.cae),
        issuer_business_name: input.emitter.razonSocial,
        issuer_address: input.emitter.domicilioFiscal,
        issuer_iva_condition: input.emitter.condicionIva === "RESP_INSCRIPTO" ? "Responsable Inscripto" : "Monotributo",
        issuer_gross_income: input.emitter.ingresosBrutos || "-",
        issuer_activity_start_date: input.emitter.inicioActividad,
        receiver_name: input.receiverName,
        receiver_address: "-",
        receiver_document_type: input.receiverDocumentType,
        receiver_document_number: Number(input.receiverDocumentNumber || 0),
        receiver_iva_condition: input.receiverIvaConditionLabel,
        sale_condition: getSaleConditionLabel(input.paymentMethod),
        currency_id: "ARS",
        currency_rate: 1,
        concept: 1,
        items: input.items.map((item, index) => ({
          code: String(index + 1).padStart(3, "0"),
          description: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.subtotal,
        })),
        vat_amount: 0,
        tributes_amount: 0,
        total_amount: input.total,
        net_amount_taxed: input.total,
        net_amount_untaxed: 0,
        exempt_amount: 0,
      },
    },
  });

  let blobUrl: string | null = null;
  try {
    blobUrl = await uploadPdfToBlob(pdf.file, fileName);
  } catch (error) {
    console.error("[Fiscal] No se pudo subir el PDF de factura a Blob", error);
  }

  return {
    afipUrl: typeof pdf.file === "string" ? pdf.file : null,
    blobUrl,
    fileName,
  };
}
