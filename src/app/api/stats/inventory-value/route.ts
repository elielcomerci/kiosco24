import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { getBranchInventoryValuation } from "@/lib/inventory-valuation";

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

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const inventoryValue = await getBranchInventoryValuation(branchId);
  return NextResponse.json(inventoryValue);
}
