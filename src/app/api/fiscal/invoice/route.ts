import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { createInvoicePdf } from "@/lib/fiscal-pdf";
import { buildEmitterSnapshot, getAfipDateNumber, getReceiverName, normalizeDocNumber, parseAfipDate, resolveReceiverDefaults, validateReceiverDocument, AFIP_DOCUMENT_TYPES, AFIP_INVOICE_TYPES } from "@/lib/fiscal";
import { sanitizeReceiverName } from "@/lib/fiscal-invoices";
import { getAfipInstance } from "@/lib/fiscal-server";
import { buildInvoicePreviewData } from "@/lib/invoice-format";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { getPaymentMethodLabel } from "@/lib/ticket-format";
import { getDefaultTicketSettings } from "@/lib/ticketing";
import { FiscalVatCondition, InvoiceStatus, Prisma, prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizeFiscalError(error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo emitir la factura.";
  return message.replace(/\s+/g, " ").trim();
}

function isAmbiguousFiscalError(error: unknown) {
  const message = normalizeFiscalError(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const saleId = typeof body?.saleId === "string" ? body.saleId : "";
  const docType = Number(body?.docType);
  const normalizedDoc = normalizeDocNumber(body?.docNro ?? "");
  const receiverName = sanitizeReceiverName(body?.receiverName);
  const requestedReceiverIvaConditionId =
    body?.receiverIvaConditionId === null || body?.receiverIvaConditionId === undefined
      ? null
      : Number(body.receiverIvaConditionId);

  if (!saleId) {
    return NextResponse.json({ error: "Falta la venta a facturar." }, { status: 400 });
  }

  if (
    docType !== AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL &&
    docType !== AFIP_DOCUMENT_TYPES.DNI &&
    docType !== AFIP_DOCUMENT_TYPES.CUIT
  ) {
    return NextResponse.json({ error: "Tipo de documento invalido." }, { status: 400 });
  }

  const docValidation = validateReceiverDocument(docType, normalizedDoc);
  if (!docValidation.valid) {
    return NextResponse.json({ error: docValidation.error || "Documento invalido." }, { status: 400 });
  }

  const receiverIvaCondition = resolveReceiverDefaults(docType, requestedReceiverIvaConditionId);
  const normalizedReceiverName = getReceiverName(docType, receiverName);

  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      branchId,
    },
    select: {
      id: true,
      total: true,
      voided: true,
      paymentMethod: true,
      branchId: true,
      invoice: {
        select: {
          id: true,
          status: true,
          saleId: true,
        },
      },
      creditCustomer: {
        select: {
          name: true,
        },
      },
      items: {
          select: {
            name: true,
            quantity: true,
            price: true,
            soldByWeight: true,
          },
        },
      },
  });

  if (!sale) {
    return NextResponse.json({ error: "Venta no encontrada." }, { status: 404 });
  }

  if (sale.voided) {
    return NextResponse.json({ error: "No se puede facturar una venta anulada." }, { status: 409 });
  }

  if (sale.invoice?.status === InvoiceStatus.ISSUED) {
    return NextResponse.json({ error: "La venta ya tiene una factura emitida." }, { status: 409 });
  }

  if (sale.invoice?.status === InvoiceStatus.PENDING) {
    return NextResponse.json({ error: "Ya hay una emision pendiente para esta venta." }, { status: 409 });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      name: true,
      fiscalSettings: true,
      ticketSettings: {
        select: {
          printMode: true,
        },
      },
      kiosco: {
        select: {
          fiscalProfile: true,
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Sucursal no encontrada." }, { status: 404 });
  }

  const fiscalProfile = branch.kiosco.fiscalProfile;
  const branchFiscalSettings = branch.fiscalSettings;
  const branchPrintMode = branch.ticketSettings?.printMode ?? getDefaultTicketSettings().printMode;

  if (!fiscalProfile || !branchFiscalSettings?.activo || !branchFiscalSettings.puntoDeVenta) {
    return NextResponse.json(
      { error: "La facturacion electronica no esta configurada en esta sucursal." },
      { status: 400 },
    );
  }

  if (fiscalProfile.condicionIva !== FiscalVatCondition.MONOTRIBUTO) {
    return NextResponse.json(
      { error: "La V1 de facturacion electronica solo admite Monotributo." },
      { status: 400 },
    );
  }

  if (sale.total < branchFiscalSettings.minimumInvoiceAmount) {
    return NextResponse.json(
      { error: `La venta no alcanza el minimo para facturar (${branchFiscalSettings.minimumInvoiceAmount}).` },
      { status: 400 },
    );
  }

  const emitterSnapshot = buildEmitterSnapshot(fiscalProfile);
  const pendingInvoice = sale.invoice?.id
    ? await prisma.invoice.update({
        where: { id: sale.invoice.id },
        data: {
          status: InvoiceStatus.PENDING,
          docTipo: docType,
          docNro: docValidation.normalized,
          receiverName: normalizedReceiverName,
          receiverIvaConditionId: receiverIvaCondition.id,
          receiverIvaConditionLabel: receiverIvaCondition.label,
          impTotal: sale.total,
          impNeto: sale.total,
          impIva: 0,
          cae: null,
          caeFchVto: null,
          comprobanteTipo: null,
          comprobanteNro: null,
          puntoDeVenta: null,
          fechaEmision: null,
          pdfBlobUrl: null,
          pdfAfipUrl: null,
          lastError: null,
          afipRawResponse: Prisma.JsonNull,
          emitterSnapshot: emitterSnapshot as Prisma.InputJsonValue,
        },
      })
    : await prisma.invoice.create({
        data: {
          saleId: sale.id,
          branchId,
          status: InvoiceStatus.PENDING,
          docTipo: docType,
          docNro: docValidation.normalized,
          receiverName: normalizedReceiverName,
          receiverIvaConditionId: receiverIvaCondition.id,
          receiverIvaConditionLabel: receiverIvaCondition.label,
          impTotal: sale.total,
          impNeto: sale.total,
          impIva: 0,
          emitterSnapshot: emitterSnapshot as Prisma.InputJsonValue,
        },
      });

  try {
    const afip = getAfipInstance(fiscalProfile);
    const emissionDate = new Date();
    const afipResponse = await afip.ElectronicBilling.createNextVoucher({
      CantReg: 1,
      PtoVta: branchFiscalSettings.puntoDeVenta,
      CbteTipo: AFIP_INVOICE_TYPES.FACTURA_C,
      Concepto: 1,
      DocTipo: docType,
      DocNro: docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? 0 : Number(docValidation.normalized),
      CbteFch: getAfipDateNumber(emissionDate),
      ImpTotal: sale.total,
      ImpTotConc: 0,
      ImpNeto: sale.total,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId: receiverIvaCondition.id,
    });

    const voucherNumber = Number(afipResponse?.voucherNumber);
    if (!Number.isInteger(voucherNumber) || voucherNumber <= 0) {
      throw new Error("AFIP no devolvio un numero de comprobante valido.");
    }

    const caeDueDate = parseAfipDate(
      typeof afipResponse?.CAEFchVto === "string" ? afipResponse.CAEFchVto : null,
    );
    const issuedAt = emissionDate;

    let pdfBlobUrl: string | null = null;
    let pdfAfipUrl: string | null = null;
    let pdfWarning: string | null = null;

    try {
      const pdf = await createInvoicePdf({
        emitter: emitterSnapshot,
        voucherNumber,
        pointOfSale: branchFiscalSettings.puntoDeVenta,
        printMode: branchPrintMode,
        issueDate: issuedAt,
        cae: String(afipResponse?.CAE || ""),
        caeDueDate: caeDueDate ?? issuedAt,
        receiverName: normalizedReceiverName,
        receiverDocumentType: docType,
        receiverDocumentNumber: docValidation.normalized,
        receiverIvaConditionLabel: receiverIvaCondition.label,
        paymentMethod: sale.paymentMethod,
        total: sale.total,
        items: sale.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          subtotal: getSaleItemSubtotal(item),
          soldByWeight: item.soldByWeight,
        })),
      });

      pdfBlobUrl = pdf.blobUrl;
      pdfAfipUrl = pdf.afipUrl;
      if (!pdf.blobUrl) {
        pdfWarning = "La factura se emitio, pero el PDF no pudo guardarse en Blob.";
      }
    } catch (pdfError) {
      console.error("[Fiscal] Error generando PDF", pdfError);
      pdfWarning = "La factura se emitio, pero no se pudo generar el PDF.";
    }

    const issuedInvoice = await prisma.invoice.update({
      where: { id: pendingInvoice.id },
      data: {
        status: InvoiceStatus.ISSUED,
        cae: typeof afipResponse?.CAE === "string" ? afipResponse.CAE : String(afipResponse?.CAE ?? ""),
        caeFchVto: caeDueDate,
        comprobanteTipo: AFIP_INVOICE_TYPES.FACTURA_C,
        comprobanteNro: voucherNumber,
        puntoDeVenta: branchFiscalSettings.puntoDeVenta,
        fechaEmision: issuedAt,
        pdfBlobUrl,
        pdfAfipUrl,
        lastError: pdfWarning,
        afipRawResponse: afipResponse as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        saleId: true,
        status: true,
        cae: true,
        caeFchVto: true,
        comprobanteTipo: true,
        comprobanteNro: true,
        puntoDeVenta: true,
        fechaEmision: true,
        docTipo: true,
        docNro: true,
        receiverName: true,
        receiverIvaConditionId: true,
        receiverIvaConditionLabel: true,
        impTotal: true,
        impNeto: true,
        impIva: true,
        pdfBlobUrl: true,
        pdfAfipUrl: true,
        lastError: true,
        emitterSnapshot: true,
        sale: {
          select: {
            paymentMethod: true,
            creditCustomer: { select: { name: true } },
            items: {
              select: {
                name: true,
                quantity: true,
                price: true,
                soldByWeight: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      invoice: buildInvoicePreviewData(
        issuedInvoice,
        getPaymentMethodLabel(issuedInvoice.sale.paymentMethod, issuedInvoice.sale.creditCustomer?.name ?? null),
        branchPrintMode,
      ),
    });
  } catch (error) {
    const message = normalizeFiscalError(error);
    const ambiguous = isAmbiguousFiscalError(error);

    const failedInvoice = await prisma.invoice.update({
      where: { id: pendingInvoice.id },
      data: {
        status: ambiguous ? InvoiceStatus.PENDING : InvoiceStatus.FAILED,
        lastError: ambiguous
          ? "No pudimos confirmar la respuesta de AFIP. Revisa esta emision desde el historial."
          : message,
      },
      select: {
        id: true,
        saleId: true,
        status: true,
        cae: true,
        caeFchVto: true,
        comprobanteTipo: true,
        comprobanteNro: true,
        puntoDeVenta: true,
        fechaEmision: true,
        docTipo: true,
        docNro: true,
        receiverName: true,
        receiverIvaConditionId: true,
        receiverIvaConditionLabel: true,
        impTotal: true,
        impNeto: true,
        impIva: true,
        pdfBlobUrl: true,
        pdfAfipUrl: true,
        lastError: true,
        emitterSnapshot: true,
        sale: {
          select: {
            paymentMethod: true,
            creditCustomer: { select: { name: true } },
            items: {
              select: {
                name: true,
                quantity: true,
                price: true,
                soldByWeight: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        error: ambiguous
          ? "AFIP no respondio a tiempo. La venta quedo registrada y la emision paso a pendiente."
          : message,
        ambiguous,
        invoice: buildInvoicePreviewData(
          failedInvoice,
          getPaymentMethodLabel(failedInvoice.sale.paymentMethod, failedInvoice.sale.creditCustomer?.name ?? null),
          branchPrintMode,
        ),
      },
      { status: ambiguous ? 202 : 400 },
    );
  }
}
