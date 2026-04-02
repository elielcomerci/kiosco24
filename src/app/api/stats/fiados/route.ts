import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { NextResponse } from "next/server";
import { getFiadosStats } from "@/lib/stats-fiados";

// GET /api/stats/fiados?search=XXX&estado=deudores|todos|sin_deuda
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
  const search = searchParams.get("search")?.trim() ?? ""; // optional - search by name
  const estado = searchParams.get("estado") ?? "deudores"; // deudores | todos | sin_deuda
  const data = await getFiadosStats(branchId, search, estado);
  return NextResponse.json(data);
}
