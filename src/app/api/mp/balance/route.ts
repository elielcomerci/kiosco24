import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getBranchId } from "@/lib/branch";
import { getMpAccessTokenForBranch } from "@/lib/mp-token";

/**
 * GET /api/mp/balance
 * Consulta el saldo disponible de la cuenta MP de esta sucursal.
 * Retorna { connected: false } si no hay MP conectado.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ connected: false });
  }

  let accessToken: string;
  try {
    accessToken = await getMpAccessTokenForBranch(branchId);
  } catch {
    return NextResponse.json({ connected: false });
  }

  const res = await fetch("https://api.mercadopago.com/v1/account/balance", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ connected: true, error: "No se pudo obtener el saldo." });
  }

  const data = await res.json();

  return NextResponse.json({
    connected: true,
    available: data.available_balance ?? 0,
    total: data.total_amount ?? 0,
    currency: data.currency_id ?? "ARS",
  });
}
