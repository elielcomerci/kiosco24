import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { DEFAULT_PRICING_MODE, isPricingMode, syncSharedPricingFromBranch } from "@/lib/pricing-mode";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { expiryAlertDays: true, pricingMode: true },
  });

  return NextResponse.json({
    expiryAlertDays: kiosco?.expiryAlertDays ?? 30,
    pricingMode: kiosco?.pricingMode ?? DEFAULT_PRICING_MODE,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true, pricingMode: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const body = await req.json();
  const expiryAlertDays =
    body?.expiryAlertDays === undefined ? undefined : Number(body?.expiryAlertDays);
  const nextPricingMode = body?.pricingMode;
  const sourceBranchId =
    typeof body?.sourceBranchId === "string" && body.sourceBranchId ? body.sourceBranchId : null;

  if (
    expiryAlertDays !== undefined &&
    (!Number.isInteger(expiryAlertDays) || expiryAlertDays < 0 || expiryAlertDays > 365)
  ) {
    return NextResponse.json({ error: "expiryAlertDays invalido" }, { status: 400 });
  }

  if (nextPricingMode !== undefined && !isPricingMode(nextPricingMode)) {
    return NextResponse.json({ error: "pricingMode invalido" }, { status: 400 });
  }

  if (expiryAlertDays === undefined && nextPricingMode === undefined) {
    return NextResponse.json({ error: "No hay cambios para guardar." }, { status: 400 });
  }

  const shouldPromoteShared =
    nextPricingMode === "SHARED" && kiosco.pricingMode !== "SHARED";

  if (shouldPromoteShared && !sourceBranchId) {
    return NextResponse.json(
      { error: "Necesitamos una sucursal base para copiar precio y costo al resto." },
      { status: 400 },
    );
  }

  if (shouldPromoteShared) {
    const sourceBranch = await prisma.branch.findFirst({
      where: {
        id: sourceBranchId!,
        kioscoId: kiosco.id,
      },
      select: { id: true },
    });

    if (!sourceBranch) {
      return NextResponse.json(
        { error: "La sucursal base no pertenece a este kiosco." },
        { status: 403 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextState = await tx.kiosco.update({
      where: { id: kiosco.id },
      data: {
        ...(expiryAlertDays !== undefined && { expiryAlertDays }),
        ...(nextPricingMode !== undefined && { pricingMode: nextPricingMode }),
      },
      select: { expiryAlertDays: true, pricingMode: true },
    });

    if (shouldPromoteShared && sourceBranchId) {
      await syncSharedPricingFromBranch(tx, {
        kioscoId: kiosco.id,
        sourceBranchId,
      });
    }

    return nextState;
  });

  return NextResponse.json(updated);
}
