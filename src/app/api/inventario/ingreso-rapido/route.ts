import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

type RestockInputItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

function normalizeRestockItems(items: unknown): RestockInputItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      productId: typeof item?.productId === "string" ? item.productId : "",
      variantId: typeof item?.variantId === "string" && item.variantId ? item.variantId : undefined,
      quantity:
        typeof item?.quantity === "number"
          ? item.quantity
          : Number.isFinite(Number(item?.quantity))
            ? Number(item?.quantity)
            : 0,
    }))
    .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { branchId } = await getBranchContext(req, session.user.id);
    if (!branchId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    const { items, note, employeeId } = await req.json();
    const normalizedItems = normalizeRestockItems(items);

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const restockEvent = await tx.restockEvent.create({
        data: {
          note: typeof note === "string" ? note : null,
          employeeId: typeof employeeId === "string" && employeeId ? employeeId : null,
          branchId,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
            })),
          },
        },
      });

      for (const item of normalizedItems) {
        if (item.variantId) {
          await tx.variantInventory.updateMany({
            where: {
              variantId: item.variantId,
              branchId,
            },
            data: {
              stock: { increment: item.quantity },
            },
          });
        } else {
          await tx.inventoryRecord.updateMany({
            where: {
              productId: item.productId,
              branchId,
            },
            data: {
              stock: { increment: item.quantity },
            },
          });
        }
      }

      return restockEvent;
    });

    return NextResponse.json({ success: true, event: result });
  } catch (error) {
    console.error("Error processing restock:", error);
    return NextResponse.json(
      { error: "Internal server error processing the restock" },
      { status: 500 },
    );
  }
}
