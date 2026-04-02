import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { NextResponse } from "next/server";
import { todayART } from "@/lib/utils";
import { getPeriodoStats } from "@/lib/stats-periodo";

// GET /api/stats/periodo?periodo=dia|semana|mes&isoDate=YYYY-MM-DD
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
  const periodo = (searchParams.get("periodo") ?? "dia") as "dia" | "semana" | "mes";
  const isoDate = searchParams.get("isoDate") ?? todayART();

  const data = await getPeriodoStats(branchId, periodo, isoDate);
  return NextResponse.json(data);
}
