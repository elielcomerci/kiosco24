import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { getEmpleadosStats } from "@/lib/stats-empleados";
import { NextResponse } from "next/server";
import { todayART } from "@/lib/utils";

// GET /api/stats/empleados?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&rol=CASHIER|MANAGER&empleadoId=XXX
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

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? "semana";
  const isoDate = searchParams.get("isoDate") ?? todayART();
  const rol = searchParams.get("rol")?.trim() ?? "";
  const empleadoId = searchParams.get("empleadoId")?.trim() ?? "";

  const data = await getEmpleadosStats(branchId, periodo, isoDate, rol, empleadoId);

  return NextResponse.json(data);
}
