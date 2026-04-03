import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * POST /api/cupones/validar
 *
 * Pre-valida un código de cupón ANTES de cerrar la venta.
 * No lo marca como usado — eso lo hace el endpoint de ventas.
 *
 * Body: { code: string, supervisorPin?: string }
 *
 * Roles: todos los roles operativos con turno activo.
 *
 * Override de supervisor:
 *   Si el cupón está vencido o ya fue usado, el front puede enviar
 *   supervisorPin para forzar el uso. Se verifica contra los empleados
 *   con rol MANAGER de esa sucursal, o el ownerPin de la sucursal.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) return accessResponse;

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const rawCode = typeof body?.code === "string" ? body.code.trim().toUpperCase() : null;
    const supervisorPin = typeof body?.supervisorPin === "string" ? body.supervisorPin.trim() : null;

    if (!rawCode) {
      return NextResponse.json({ valid: false, reason: "El código del cupón es requerido." });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: rawCode },
      select: {
        id: true,
        branchId: true,
        discountKind: true,
        discountValue: true,
        isUsed: true,
        expiresAt: true,
        overrideById: true,
        promotion: {
          select: {
            type: true,
            combos: {
              select: {
                productId: true,
                variantId: true,
                quantity: true,
              }
            }
          }
        }
      },
    });

    const now = new Date();

    // Casos de éxito directo
    if (coupon && coupon.branchId === branchId && !coupon.isUsed && coupon.expiresAt > now) {
      return NextResponse.json({
        valid: true,
        overrideMode: false,
        coupon: {
          id: coupon.id,
          discountKind: coupon.discountKind,
          discountValue: coupon.discountValue,
          expiresAt: coupon.expiresAt,
          promotion: coupon.promotion,
        },
      });
    }

    // Determinar el motivo del fallo
    let reason = "El cupón no es válido.";
    if (!coupon) reason = "El cupón no existe.";
    else if (coupon.branchId !== branchId) reason = "El cupón no pertenece a esta sucursal.";
    else if (coupon.isUsed) reason = "Este cupón ya fue utilizado.";
    else if (coupon.expiresAt <= now) reason = "El cupón está vencido.";

    // Sin supervisorPin → rechazar directamente
    if (!supervisorPin) {
      return NextResponse.json({ valid: false, reason });
    }

    // Con supervisorPin → intentar override
    // 1. Verificar ownerPin de la sucursal
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { ownerPin: true },
    });

    if (branch?.ownerPin && branch.ownerPin === supervisorPin) {
      return NextResponse.json({
        valid: true,
        overrideMode: true,
        overrideRole: "OWNER",
        coupon: coupon
          ? {
              id: coupon.id,
              discountKind: coupon.discountKind,
              discountValue: coupon.discountValue,
              expiresAt: coupon.expiresAt,
            }
          : null,
      });
    }

    // 2. Verificar PIN de MANAGER activo de esa sucursal
    const manager = await prisma.employee.findFirst({
      where: {
        branches: { some: { id: branchId } },
        role: "MANAGER",
        active: true,
        pin: supervisorPin,
        suspendedUntil: null,
      },
      select: { id: true, name: true },
    });

    if (manager) {
      return NextResponse.json({
        valid: true,
        overrideMode: true,
        overrideRole: "MANAGER",
        overrideById: manager.id,
        overrideByName: manager.name,
        coupon: coupon
          ? {
              id: coupon.id,
              discountKind: coupon.discountKind,
              discountValue: coupon.discountValue,
              expiresAt: coupon.expiresAt,
            }
          : null,
      });
    }

    // PIN incorrecto
    return NextResponse.json({
      valid: false,
      reason: "PIN de supervisor incorrecto.",
    });
  } catch (error) {
    console.error("[Cupones] Error validando cupón", error);
    return NextResponse.json({ error: "No se pudo validar el cupón." }, { status: 500 });
  }
}
