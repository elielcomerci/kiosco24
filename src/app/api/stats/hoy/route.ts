import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { getActiveShift } from "@/lib/shift-access";
import { getHoyStats } from "@/lib/stats-hoy";
import { NextResponse } from "next/server";

// GET /api/stats/hoy
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ enCaja: 0, ganancia: 0, hasCosts: false });
  }

  const canSeeProfit = session.user.role === "OWNER" || session.user.employeeRole === "MANAGER";
  const isCashier = session.user.employeeRole === "CASHIER";

  if (isCashier) {
    return NextResponse.json({ error: "No tenés permiso para ver estadísticas." }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ enCaja: 0, ganancia: 0, hasCosts: false });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift) {
    return NextResponse.json({
      enCaja: 0,
      ganancia: null,
      hasCosts: false,
      openingAmount: 0,
      ventasEfectivo: 0,
      ventasMp: 0,
      ventasDebito: 0,
      ventasTransferencia: 0,
      ventasTarjeta: 0,
      ventasFiado: 0,
      totalVentas: 0,
      totalGastos: 0,
      totalRetiros: 0,
    });
  }

  const stats = await getHoyStats(branchId, activeShift.id, activeShift.openingAmount ?? 0);

  return NextResponse.json({
    ...stats,
    ganancia: canSeeProfit && stats.hasCosts ? stats.ganancia : null,
    hasCosts: canSeeProfit ? stats.hasCosts : false,
  });
}
