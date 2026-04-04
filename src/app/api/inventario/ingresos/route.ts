import { RestockEventType } from "@prisma/client";
import { NextResponse } from "next/server";

import { guardSetupAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

function mapRestockEvent(event: Awaited<ReturnType<typeof loadEvents>>[number]) {
  const items = [...event.items]
    .sort((left, right) => {
      const leftLabel = `${left.product.name} ${left.variant?.name ?? ""}`.trim().toLocaleLowerCase("es-AR");
      const rightLabel = `${right.product.name} ${right.variant?.name ?? ""}`.trim().toLocaleLowerCase("es-AR");
      return leftLabel.localeCompare(rightLabel, "es-AR");
    })
    .map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId,
      variantName: item.variant?.name ?? null,
      quantity: item.quantity,
      unitCost: item.unitCost,
      salePrice: item.salePrice,
    }));

  const missingCostLines = items.filter((item) => item.quantity > 0 && item.unitCost === null).length;

  return {
    id: event.id,
    type: event.type,
    note: event.note,
    supplierName: event.supplierName,
    valuationStatus: event.valuationStatus,
    employeeName: event.employee?.name ?? null,
    createdAt: event.createdAt.toISOString(),
    attachments: event.attachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      createdAt: attachment.createdAt.toISOString(),
    })),
    items,
    linesCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0),
    missingCostLines,
  };
}

async function loadEvents(branchId: string) {
  return prisma.restockEvent.findMany({
    where: {
      branchId,
      type: RestockEventType.RECEIVE,
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      employee: {
        select: {
          name: true,
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          variant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });
  }

  const events = await loadEvents(branchId);
  return NextResponse.json({ events: events.map(mapRestockEvent) });
}
