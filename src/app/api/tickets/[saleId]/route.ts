import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { buildTicketPreviewData } from "@/lib/ticket-data";
import { InvoiceStatus, Prisma, prisma } from "@/lib/prisma";
import { buildTicketMetaSnapshot, ensureTicketSettings, getDefaultTicketSettings } from "@/lib/ticketing";

const saleSelect = {
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
  invoice: {
    select: {
      status: true,
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
          printMode: true,
        },
      },
    },
  },
} satisfies Prisma.SaleSelect;

async function getAuthorizedBranchId(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      branchId: null,
      session: null,
    };
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return {
      error: accessResponse,
      branchId: null,
      session: null,
    };
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return {
      error: NextResponse.json({ error: "No branch" }, { status: 404 }),
      branchId: null,
      session: null,
    };
  }

  return {
    error: null,
    branchId,
    session,
  };
}

function buildPreviewResponse(sale: Prisma.SaleGetPayload<{ select: typeof saleSelect }>) {
  return buildTicketPreviewData(sale, {
    branch: sale.branch,
    settings: sale.branch.ticketSettings ?? getDefaultTicketSettings(),
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const authContext = await getAuthorizedBranchId(req);
  if (authContext.error) {
    return authContext.error;
  }
  if (!authContext.branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { saleId } = await params;
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      branchId: authContext.branchId,
    },
    select: saleSelect,
  });

  if (!sale) {
    return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  }

  if (!sale.ticketNumber) {
    return NextResponse.json({ error: "Este ticket todavia no fue emitido." }, { status: 404 });
  }

  return NextResponse.json(buildPreviewResponse(sale));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const authContext = await getAuthorizedBranchId(req);
  if (authContext.error) {
    return authContext.error;
  }
  if (!authContext.branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { saleId } = await params;
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      branchId: authContext.branchId,
    },
    select: saleSelect,
  });

  if (!sale) {
    return NextResponse.json({ error: "Venta no encontrada." }, { status: 404 });
  }

  if (sale.voided) {
    return NextResponse.json({ error: "No se puede emitir ticket de una venta anulada." }, { status: 409 });
  }

  if (sale.invoice?.status === InvoiceStatus.ISSUED) {
    return NextResponse.json(
      { error: "La venta ya tiene una factura emitida. Ese es el comprobante que corresponde entregar." },
      { status: 409 },
    );
  }

  if (sale.ticketNumber) {
    return NextResponse.json(buildPreviewResponse(sale));
  }

  try {
    const emittedSale = await prisma.$transaction(async (tx) => {
      const currentSale = await tx.sale.findFirst({
        where: {
          id: saleId,
          branchId: authContext.branchId!,
        },
        select: {
          id: true,
          ticketNumber: true,
          voided: true,
          invoice: {
            select: {
              status: true,
            },
          },
        },
      });

      if (!currentSale) {
        throw new Error("Venta no encontrada.");
      }

      if (currentSale.voided) {
        throw new Error("No se puede emitir ticket de una venta anulada.");
      }

      if (currentSale.invoice?.status === InvoiceStatus.ISSUED) {
        throw new Error("La venta ya tiene una factura emitida. Ese es el comprobante que corresponde entregar.");
      }

      if (currentSale.ticketNumber) {
        return tx.sale.findFirstOrThrow({
          where: {
            id: saleId,
            branchId: authContext.branchId!,
          },
          select: saleSelect,
        });
      }

      const ticketSettings = await ensureTicketSettings(tx, authContext.branchId!);
      const branchTicketData = await tx.branch.update({
        where: { id: authContext.branchId! },
        data: {
          ticketCounter: { increment: 1 },
        },
        select: {
          ticketCounter: true,
          name: true,
          address: true,
          phone: true,
          logoUrl: true,
        },
      });

      const ticketIssuedAt = new Date();
      const ticketMetaSnapshot = buildTicketMetaSnapshot(branchTicketData, ticketSettings);

      return tx.sale.update({
        where: { id: saleId },
        data: {
          ticketNumber: branchTicketData.ticketCounter,
          ticketIssuedAt,
          ticketMetaSnapshot: ticketMetaSnapshot as Prisma.InputJsonValue,
        },
        select: saleSelect,
      });
    });

    return NextResponse.json(buildPreviewResponse(emittedSale));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Venta no encontrada.") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (
        error.message === "No se puede emitir ticket de una venta anulada." ||
        error.message === "La venta ya tiene una factura emitida. Ese es el comprobante que corresponde entregar."
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }

    return NextResponse.json({ error: "No se pudo emitir el ticket." }, { status: 500 });
  }
}
