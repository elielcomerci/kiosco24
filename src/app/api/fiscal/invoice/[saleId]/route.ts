import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { buildInvoicePreviewData } from "@/lib/invoice-format";
import { getPaymentMethodLabel } from "@/lib/ticket-format";
import { InvoiceStatus, prisma } from "@/lib/prisma";
import { getDefaultTicketSettings } from "@/lib/ticketing";

function canManageFiscalPending(user: { role?: string | null; employeeRole?: string | null }) {
  return user.role === "OWNER" || user.employeeRole === "MANAGER";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
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

  const { saleId } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: {
      saleId,
      branchId,
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
      branch: {
        select: {
          ticketSettings: {
            select: {
              printMode: true,
            },
          },
        },
      },
      sale: {
        select: {
          paymentMethod: true,
          creditCustomer: { select: { name: true } },
          items: {
            select: {
              name: true,
              quantity: true,
              price: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  return NextResponse.json(
    buildInvoicePreviewData(
      invoice,
      getPaymentMethodLabel(invoice.sale.paymentMethod, invoice.sale.creditCustomer?.name ?? null),
      invoice.branch.ticketSettings?.printMode ?? getDefaultTicketSettings().printMode,
    ),
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  if (!canManageFiscalPending(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (body?.action !== "release-pending") {
    return NextResponse.json({ error: "Accion invalida." }, { status: 400 });
  }

  const { saleId } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: {
      saleId,
      branchId,
    },
    select: {
      id: true,
      status: true,
      lastError: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  if (invoice.status !== InvoiceStatus.PENDING) {
    return NextResponse.json({ error: "Solo se pueden liberar emisiones pendientes." }, { status: 409 });
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.FAILED,
      lastError: invoice.lastError
        ? `${invoice.lastError} Liberada manualmente para reintento.`
        : "Emision pendiente liberada manualmente para reintento.",
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
      branch: {
        select: {
          ticketSettings: {
            select: {
              printMode: true,
            },
          },
        },
      },
      sale: {
        select: {
          paymentMethod: true,
          creditCustomer: { select: { name: true } },
          items: {
            select: {
              name: true,
              quantity: true,
              price: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(
    buildInvoicePreviewData(
      updated,
      getPaymentMethodLabel(updated.sale.paymentMethod, updated.sale.creditCustomer?.name ?? null),
      updated.branch.ticketSettings?.printMode ?? getDefaultTicketSettings().printMode,
    ),
  );
}
