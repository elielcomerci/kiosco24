import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { buildTicketPreviewData } from "@/lib/ticket-data";
import { getDefaultTicketSettings } from "@/lib/ticketing";

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
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      branchId,
    },
    select: {
      id: true,
      ticketNumber: true,
      ticketIssuedAt: true,
      ticketMetaSnapshot: true,
      total: true,
      paymentMethod: true,
      receivedAmount: true,
      voided: true,
      createdAt: true,
      createdByEmployee: {
        select: {
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
          quantity: true,
          price: true,
        },
      },
      branch: {
        select: {
          name: true,
          address: true,
          phone: true,
          logoUrl: true,
          ticketSettings: {
            select: {
              showLogo: true,
              showAddress: true,
              showPhone: true,
              showFooterText: true,
              footerText: true,
              orderLink: true,
            },
          },
        },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  }

  const data = buildTicketPreviewData(sale, {
    branch: sale.branch,
    settings: sale.branch.ticketSettings ?? getDefaultTicketSettings(),
  });

  return NextResponse.json(data);
}
