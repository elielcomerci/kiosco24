import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { PaymentMethod, Prisma, prisma } from "@/lib/prisma";
import { formatTicketNumberValue } from "@/lib/ticketing";
import { getPaymentMethodLabel } from "@/lib/ticket-format";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const employeeId = url.searchParams.get("employeeId")?.trim() ?? "";
  const paymentMethod = url.searchParams.get("paymentMethod")?.trim() ?? "";
  const voided = url.searchParams.get("voided");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: Prisma.SaleWhereInput = { branchId };

  if (employeeId) {
    where.createdByEmployeeId = employeeId;
  }

  if (paymentMethod) {
    if (!Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
      return NextResponse.json({ error: "paymentMethod invalido" }, { status: 400 });
    }

    where.paymentMethod = paymentMethod as PaymentMethod;
  }

  if (voided === "true") {
    where.voided = true;
  } else if (voided === "false") {
    where.voided = false;
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
    const asNumber = Number(q);
    where.OR = [
      ...(Number.isInteger(asNumber) ? [{ ticketNumber: asNumber }] : []),
      { items: { some: { name: { contains: q, mode: "insensitive" } } } },
      { createdByEmployee: { name: { contains: q, mode: "insensitive" } } },
      { creditCustomer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      ticketNumber: true,
      ticketIssuedAt: true,
      total: true,
      paymentMethod: true,
      receivedAmount: true,
      voided: true,
      createdAt: true,
      createdByEmployee: {
        select: {
          id: true,
          name: true,
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
        },
        take: 2,
      },
    },
  });

  return NextResponse.json(
    sales.map((sale) => ({
      id: sale.id,
      ticketNumber: sale.ticketNumber,
      ticketNumberFormatted: formatTicketNumberValue(sale.ticketNumber),
      issuedAt: (sale.ticketIssuedAt ?? sale.createdAt).toISOString(),
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      paymentMethodLabel: getPaymentMethodLabel(sale.paymentMethod, sale.creditCustomer?.name ?? null),
      employeeId: sale.createdByEmployee?.id ?? null,
      employeeName: sale.createdByEmployee?.name ?? null,
      customerName: sale.creditCustomer?.name ?? null,
      voided: sale.voided,
      previewItems: sale.items.map((item) => item.name),
    })),
  );
}
