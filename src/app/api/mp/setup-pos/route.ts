import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getBranchId } from "@/lib/branch";
import { getMpAccessTokenForBranch } from "@/lib/mp-token";

/**
 * POST /api/mp/setup-pos
 * Crea (o reutiliza) la sucursal y la caja en MercadoPago.
 * Idempotente: si ya existe mpStoreId, no vuelve a crear la sucursal.
 * El dueño puede llamarlo desde la UI si el setup anterior falló.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      mpUserId: true,
      mpStoreId: true,
      mpPosId: true,
    },
  });

  if (!branch?.mpUserId) {
    return NextResponse.json(
      { error: "MercadoPago no está conectado en esta sucursal." },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await getMpAccessTokenForBranch(branchId);
  } catch {
    return NextResponse.json(
      { error: "Token de MercadoPago inválido. Reconectá la cuenta." },
      { status: 400 }
    );
  }

  const mpHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // ── 1. Sucursal (idempotente) ────────────────────────────────────────────
  let storeId = branch.mpStoreId;

  if (!storeId) {
    const storeRes = await fetch(
      `https://api.mercadopago.com/users/${branch.mpUserId}/stores`,
      {
        method: "POST",
        headers: mpHeaders,
        body: JSON.stringify({
          name: branch.name || "Kiosco",
          location: {},
        }),
      }
    );

    if (!storeRes.ok) {
      const err = await storeRes.json();
      console.error("[MP setup-pos] Error creando sucursal:", err);
      return NextResponse.json(
        { error: "No se pudo crear la sucursal en MercadoPago.", detail: err },
        { status: 502 }
      );
    }

    const store = await storeRes.json();
    storeId = String(store.id);
  }

  // ── 2. Caja / POS (idempotente por external_id) ──────────────────────────
  // Usamos el branchId como external_id para que sea único y re-ejecutable
  const externalPosId = `kiosco24-pos-${branchId}`;
  let posId = branch.mpPosId;

  if (!posId) {
    const posRes = await fetch("https://api.mercadopago.com/pos", {
      method: "POST",
      headers: mpHeaders,
      body: JSON.stringify({
        name: "Caja principal",
        store_id: storeId,
        fixed_amount: true,
        external_id: externalPosId,
      }),
    });

    if (!posRes.ok) {
      const err = await posRes.json();
      // Si MP responde "ya existe" (409) buscamos por external_id antes de fallar
      if (posRes.status === 409) {
        const searchRes = await fetch(
          `https://api.mercadopago.com/pos?external_id=${externalPosId}`,
          { headers: mpHeaders }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          posId = searchData.results?.[0]?.external_id ?? externalPosId;
        }
      } else {
        console.error("[MP setup-pos] Error creando caja:", err);
        return NextResponse.json(
          { error: "No se pudo crear la caja en MercadoPago.", detail: err },
          { status: 502 }
        );
      }
    } else {
      const pos = await posRes.json();
      posId = pos.external_id ?? externalPosId;
    }
  }

  // ── 3. Guardar en DB ─────────────────────────────────────────────────────
  await prisma.branch.update({
    where: { id: branchId },
    data: { mpStoreId: storeId, mpPosId: posId },
  });

  return NextResponse.json({ ok: true, storeId, posId });
}
