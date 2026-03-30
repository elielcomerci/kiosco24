import { RestockEventType, RestockValuationStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { syncRestockItemCostLayer } from "@/lib/inventory-cost-layers";
import { prisma } from "@/lib/prisma";

type RequestedItemUpdate = {
  id: string;
  unitCost: number | null;
  salePrice: number | null;
};

function normalizeMoney(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeValuationStatus(value: unknown, fallback: RestockValuationStatus) {
  if (value === RestockValuationStatus.PENDING) {
    return RestockValuationStatus.PENDING;
  }
  if (value === RestockValuationStatus.COMPLETED) {
    return RestockValuationStatus.COMPLETED;
  }
  if (value === RestockValuationStatus.NOT_APPLICABLE) {
    return RestockValuationStatus.NOT_APPLICABLE;
  }

  return fallback;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });
  }

  const { id } = await context.params;
  const event = await prisma.restockEvent.findFirst({
    where: {
      id,
      branchId,
      type: RestockEventType.RECEIVE,
    },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          unitCost: true,
          salePrice: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Ingreso no encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const normalizedSupplierName =
    typeof body?.supplierName === "string" && body.supplierName.trim()
      ? body.supplierName.trim().slice(0, 120)
      : null;
  const normalizedNote =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 4000)
      : null;
  const nextValuationStatus = normalizeValuationStatus(body?.valuationStatus, event.valuationStatus);

  const requestedItems: RequestedItemUpdate[] = Array.isArray(body?.items)
    ? body.items
        .filter(
          (item: unknown): item is { id: string; unitCost?: unknown; salePrice?: unknown } =>
            typeof item === "object" &&
            item !== null &&
            "id" in item &&
            typeof (item as { id?: unknown }).id === "string",
        )
        .map((item: { id: string; unitCost?: unknown; salePrice?: unknown }) => ({
          id: item.id,
          unitCost: normalizeMoney(item.unitCost),
          salePrice: normalizeMoney(item.salePrice),
        }))
    : [];

  const currentItemsMap = new Map(event.items.map((item) => [item.id, item]));
  const nextItems = event.items.map((item) => {
    const override = requestedItems.find((entry: RequestedItemUpdate) => entry.id === item.id);
    return {
      id: item.id,
      quantity: item.quantity,
      unitCost: override ? override.unitCost : item.unitCost,
      salePrice: override ? override.salePrice : item.salePrice,
    };
  });

  if (
    nextValuationStatus === RestockValuationStatus.COMPLETED &&
    nextItems.some((item) => item.quantity > 0 && item.unitCost === null)
  ) {
    return NextResponse.json(
      { error: "Para marcar el ingreso como completo, cada linea debe tener costo unitario." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.restockEvent.update({
      where: { id: event.id },
      data: {
        supplierName: normalizedSupplierName,
        note: normalizedNote,
        valuationStatus: nextValuationStatus,
      },
    });

    for (const item of requestedItems) {
      if (!currentItemsMap.has(item.id)) {
        continue;
      }

      await tx.restockItem.update({
        where: { id: item.id },
        data: {
          unitCost: item.unitCost,
          salePrice: item.salePrice,
        },
      });
    }

    for (const item of nextItems) {
      const sourceItem = currentItemsMap.get(item.id);
      if (!sourceItem) {
        continue;
      }

      await syncRestockItemCostLayer(tx, {
        branchId: event.branchId,
        productId: sourceItem.productId,
        variantId: sourceItem.variantId,
        restockItemId: item.id,
        quantity: item.quantity,
        unitCost: item.unitCost,
        receivedAt: event.createdAt,
      });
    }
  });

  return NextResponse.json({ success: true });
}
