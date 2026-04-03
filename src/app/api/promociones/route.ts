import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

// GET /api/promociones — listar promociones activas de la sucursal
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const activeParam = searchParams.get("active");
  const whereClause: { branchId: string; active?: boolean } = { branchId };
  if (activeParam === "true") whereClause.active = true;

  const promotions = await prisma.promotion.findMany({
    where: whereClause,
    include: {
      combos: {
        include: {
          product: { select: { id: true, name: true, image: true, emoji: true } },
          variant: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(promotions);
}

// POST /api/promociones — crear una promoción (solo OWNER)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { error: "Solo el dueño puede crear promociones." },
      { status: 403 },
    );
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) return accessResponse;

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  try {
    const body = await req.json();

    const {
      type,
      name,
      discountKind,
      discountValue,
      startHour,
      endHour,
      weekdays,
      daysBeforeExpiry,
      returnCouponThreshold,
      returnCouponValidityHours,
      combos, // [{ productId, variantId?, quantity }]
    } = body;

    if (!type || !name || !discountKind || discountValue === undefined) {
      return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
    }

    if (!["COMBO", "ZONA_ROJA", "HAPPY_HOUR", "DIA_TEMATICO"].includes(type)) {
      return NextResponse.json({ error: "Tipo de promoción inválido." }, { status: 400 });
    }

    if (!["PERCENTAGE", "FIXED_PRICE"].includes(discountKind)) {
      return NextResponse.json({ error: "Tipo de descuento inválido." }, { status: 400 });
    }

    if (typeof discountValue !== "number" || discountValue <= 0) {
      return NextResponse.json({ error: "El valor del descuento debe ser mayor a 0." }, { status: 400 });
    }

    // Validar componentes del combo
    const comboItems = Array.isArray(combos) ? combos : [];
    if (type === "COMBO" && comboItems.length < 2) {
      return NextResponse.json(
        { error: "Un combo requiere al menos 2 productos." },
        { status: 400 },
      );
    }

    // Verificar que los productos del combo existen en esta sucursal
    for (const c of comboItems) {
      if (!c.productId) {
        return NextResponse.json({ error: "Cada componente del combo necesita un productId." }, { status: 400 });
      }
      const inv = await prisma.inventoryRecord.findUnique({
        where: { productId_branchId: { productId: c.productId, branchId } },
        select: { productId: true },
      });
      if (!inv) {
        return NextResponse.json(
          { error: `El producto ${c.productId} no existe en esta sucursal.` },
          { status: 400 },
        );
      }
    }

    const promotion = await prisma.promotion.create({
      data: {
        branchId,
        type,
        name: String(name).trim(),
        discountKind,
        discountValue: Number(discountValue),
        startHour: startHour != null ? Number(startHour) : null,
        endHour: endHour != null ? Number(endHour) : null,
        weekdays: Array.isArray(weekdays) ? weekdays.map(Number) : [],
        daysBeforeExpiry: daysBeforeExpiry != null ? Number(daysBeforeExpiry) : null,
        returnCouponThreshold: returnCouponThreshold != null ? Number(returnCouponThreshold) : null,
        returnCouponValidityHours: returnCouponValidityHours != null ? Number(returnCouponValidityHours) : 72,
        combos: {
          create: comboItems.map((c: { productId: string; variantId?: string; quantity?: number }) => ({
            productId: c.productId,
            variantId: c.variantId ?? null,
            quantity: Number(c.quantity ?? 1),
          })),
        },
      },
      include: { combos: true },
    });

    return NextResponse.json(promotion, { status: 201 });
  } catch (error) {
    console.error("[Promociones] Error creando promo", error);
    return NextResponse.json({ error: "No se pudo crear la promoción." }, { status: 500 });
  }
}
