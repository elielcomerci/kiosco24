import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { getInventoryValuation, type InventoryValuationScope } from "@/lib/inventory-valuation";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";

  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const requestedScope = url.searchParams.get("scope") === "kiosco" ? "kiosco" : "branch";
  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);

  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  if (requestedScope === "kiosco" && !isOwner) {
    return NextResponse.json({ error: "Solo el owner puede ver el consolidado del kiosco." }, { status: 403 });
  }

  const scope: InventoryValuationScope = requestedScope;
  const inventoryValue = await getInventoryValuation({
    scope,
    branchId,
    kioscoId,
  });

  return NextResponse.json({
    ...inventoryValue,
    meta: {
      ...inventoryValue.meta,
      scope,
      canViewKioscoScope: isOwner && Boolean(kioscoId),
    },
  });
}
