import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { getVentasReport } from "@/lib/report-ventas";
import { NextRequest, NextResponse } from "next/server";

// GET /api/reports/ventas?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Faltan parametros from y to" }, { status: 400 });
  }

  const data = await getVentasReport(branchId, from, to);

  return NextResponse.json(data);
}
