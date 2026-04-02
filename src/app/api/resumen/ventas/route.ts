import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { getResumenVentas } from "@/lib/resumen-ventas";
import { todayART } from "@/lib/utils";
import { NextResponse } from "next/server";

// GET /api/resumen/ventas
// Retorna las ventas detalladas del dia
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.role === "EMPLOYEE" && session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const isoDate = todayART();
  const data = await getResumenVentas(branchId, isoDate);

  return NextResponse.json(data);
}
