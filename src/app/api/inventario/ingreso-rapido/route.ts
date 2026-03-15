import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

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

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Wrap the auditable restocking and increment logic in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the RestockEvent Audit Log
      const restockEvent = await tx.restockEvent.create({
        data: {
          note: note || null,
          employeeId: employeeId || null,
          branchId,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
            })),
          },
        },
      });

      // 2. Increment stock individually for each item (avoiding race conditions)
      for (const item of items) {
        if (item.variantId) {
          // Increment VariantInventory
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
          // Increment global InventoryRecord
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
      { status: 500 }
    );
  }
}
