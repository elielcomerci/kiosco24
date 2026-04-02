import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { NextResponse } from "next/server";
import { todayART } from "@/lib/utils";
import { getTurnosStats } from "@/lib/stats-turnos";

// GET /api/stats/turnos?periodo=dia|semana|mes&isoDate=YYYY-MM-DD&empleadoId=XXX&estado=abiertos|cerrados|todos
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const periodo = (searchParams.get("periodo") ?? "semana") as "dia" | "semana" | "mes";
  const isoDate = searchParams.get("isoDate") ?? todayART();
  const empleadoId = searchParams.get("empleadoId")?.trim() ?? ""; // optional
  const estado = searchParams.get("estado") ?? "todos"; // abiertos | cerrados | todos

  const cashierEmployeeId = isCashier ? session.user.employeeId ?? "" : "";
  const data = await getTurnosStats(branchId, periodo, isoDate, empleadoId, estado, cashierEmployeeId);

  return NextResponse.json(data);
}
