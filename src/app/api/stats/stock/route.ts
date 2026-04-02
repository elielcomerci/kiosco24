import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getStockStats } from "@/lib/stats-stock";
import { NextResponse } from "next/server";

// GET /api/stats/stock?scope=branch|kiosco&categoria=XXX&alerta=bajo|cero|vencimiento|pendiente
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

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "kiosco" && isOwner ? "kiosco" : "branch";
  const categoria = searchParams.get("categoria") ?? "";
  const alerta = searchParams.get("alerta") ?? "";

  let targetBranchIds: string[] = [branchId];
  if (scope === "kiosco" && isOwner && kioscoId) {
    const branches = await prisma.branch.findMany({
      where: { kioscoId },
      select: { id: true },
    });
    targetBranchIds = branches.map((b) => b.id).sort();
  }

  const data = await getStockStats(
    branchId,
    targetBranchIds.join("|"),
    scope,
    categoria,
    alerta,
    targetBranchIds.length
  );

  return NextResponse.json({
    ...data,
    meta: {
      ...data.meta,
      canViewKioscoScope: isOwner && Boolean(kioscoId),
    },
  });
}

// Helper to get branch context (similar to getBranchId but returns both)
async function getBranchContext(req: Request, userId: string) {
  const branchId = req.headers.get("x-branch-id");
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { kioscoId: true },
    });
    return { branchId, kioscoId: branch?.kioscoId ?? null };
  }

  const resolvedBranchId = await getBranchId(req, userId);
  if (!resolvedBranchId) {
    return { branchId: null, kioscoId: null };
  }

  const branch = await prisma.branch.findUnique({
    where: { id: resolvedBranchId },
    select: { kioscoId: true },
  });

  return { branchId: resolvedBranchId, kioscoId: branch?.kioscoId ?? null };
}
