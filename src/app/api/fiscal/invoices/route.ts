import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { formatFiscalVoucherNumber, getInvoiceTypeLabel } from "@/lib/fiscal";
import { getPaymentMethodLabel } from "@/lib/ticket-format";
import { InvoiceStatus, Prisma, prisma } from "@/lib/prisma";

function canViewFiscalHistory(user: { role?: string | null; employeeRole?: string | null }) {
  return user.role === "OWNER" || user.employeeRole === "MANAGER";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  if (!canViewFiscalHistory(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const employeeId = url.searchParams.get("employeeId")?.trim() ?? "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: Prisma.InvoiceWhereInput = { branchId };

  if (status) {
    if (!Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      return NextResponse.json({ error: "status invalido" }, { status: 400 });
    }
    where.status = status as InvoiceStatus;
  }

  if (employeeId) {
    where.sale = { createdByEmployeeId: employeeId };
  }

  if (from || to) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (from) {
      createdAtFilter.gte = new Date(`${from}T00:00:00.000`);
    }
    if (to) {
      createdAtFilter.lte = new Date(`${to}T23:59:59.999`);
    }
    where.createdAt = createdAtFilter;
  }

  if (q) {
    const numericQuery = Number(q);
    where.OR = [
      ...(Number.isInteger(numericQuery) ? [{ comprobanteNro: numericQuery }] : []),
      { cae: { contains: q } },
      { docNro: { contains: q } },
      { receiverName: { contains: q, mode: "insensitive" } },
      { sale: { createdByEmployee: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      saleId: true,
      status: true,
      comprobanteTipo: true,
      comprobanteNro: true,
      puntoDeVenta: true,
      fechaEmision: true,
      cae: true,
      docTipo: true,
      docNro: true,
      receiverName: true,
      impTotal: true,
      pdfBlobUrl: true,
      pdfAfipUrl: true,
      lastError: true,
      createdAt: true,
      sale: {
        select: {
          paymentMethod: true,
          creditCustomer: { select: { name: true } },
          createdByEmployee: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(
    invoices.map((invoice) => ({
      id: invoice.id,
      saleId: invoice.saleId,
      status: invoice.status,
      invoiceTypeLabel: getInvoiceTypeLabel(invoice.comprobanteTipo),
      voucherNumberFormatted: formatFiscalVoucherNumber(invoice.puntoDeVenta, invoice.comprobanteNro),
      issuedAt: (invoice.fechaEmision ?? invoice.createdAt).toISOString(),
      cae: invoice.cae,
      docTipo: invoice.docTipo,
      docNro: invoice.docNro,
      receiverName: invoice.receiverName,
      total: invoice.impTotal,
      paymentMethodLabel: getPaymentMethodLabel(invoice.sale.paymentMethod, invoice.sale.creditCustomer?.name ?? null),
      employeeId: invoice.sale.createdByEmployee?.id ?? null,
      employeeName: invoice.sale.createdByEmployee?.name ?? null,
      pdfUrl: invoice.pdfBlobUrl ?? invoice.pdfAfipUrl,
      lastError: invoice.lastError,
    })),
  );
}
