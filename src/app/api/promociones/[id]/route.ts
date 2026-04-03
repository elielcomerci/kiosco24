import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

// PATCH /api/promociones/[id] — editar / activar / desactivar (solo OWNER)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { error: "Solo el dueño puede modificar promociones." },
      { status: 403 },
    );
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) return accessResponse;

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;

  const existing = await prisma.promotion.findFirst({
    where: { id, branchId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Promoción no encontrada." }, { status: 404 });
  }

  try {
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (typeof body.active === "boolean") updateData.active = body.active;
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
    if (typeof body.discountValue === "number" && body.discountValue > 0) {
      updateData.discountValue = body.discountValue;
    }
    if (body.startHour !== undefined) updateData.startHour = body.startHour != null ? Number(body.startHour) : null;
    if (body.endHour !== undefined) updateData.endHour = body.endHour != null ? Number(body.endHour) : null;
    if (Array.isArray(body.weekdays)) updateData.weekdays = body.weekdays.map(Number);
    if (body.daysBeforeExpiry !== undefined) {
      updateData.daysBeforeExpiry = body.daysBeforeExpiry != null ? Number(body.daysBeforeExpiry) : null;
    }
    if (body.returnCouponThreshold !== undefined) {
      updateData.returnCouponThreshold = body.returnCouponThreshold != null
        ? Number(body.returnCouponThreshold)
        : null;
    }
    if (body.returnCouponValidityHours !== undefined) {
      updateData.returnCouponValidityHours = body.returnCouponValidityHours != null
        ? Number(body.returnCouponValidityHours)
        : 72;
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: updateData,
      include: { combos: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Promociones] Error actualizando promo", error);
    return NextResponse.json({ error: "No se pudo actualizar la promoción." }, { status: 500 });
  }
}

// DELETE /api/promociones/[id] — soft delete: desactiva sin eliminar (solo OWNER)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { error: "Solo el dueño puede eliminar promociones." },
      { status: 403 },
    );
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;

  const existing = await prisma.promotion.findFirst({
    where: { id, branchId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Promoción no encontrada." }, { status: 404 });
  }

  // Soft delete: desactivar en lugar de eliminar para preservar auditoría histórica
  await prisma.promotion.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
