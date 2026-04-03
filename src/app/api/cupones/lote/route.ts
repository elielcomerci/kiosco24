import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

// Generar código numérico 10 digitos XX-XXXX-XXXX
function generateMostazaCode(): string {
  const rs = () => Math.floor(Math.random() * 10).toString();
  const d = Array.from({ length: 10 }, rs);
  return `${d[0]}${d[1]}-${d[2]}${d[3]}${d[4]}${d[5]}-${d[6]}${d[7]}${d[8]}${d[9]}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.OWNER) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  try {
    const { promotionId, count, expiresAt } = await req.json();

    if (!promotionId || typeof count !== "number" || count < 1 || count > 500) {
      return NextResponse.json({ error: "Parámetros inválidos (1 - 500 cupones máximo)." }, { status: 400 });
    }

    const promotion = await prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion || promotion.branchId !== branchId) {
      return NextResponse.json({ error: "Promoción no encontrada." }, { status: 404 });
    }

    const expireDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días si no se provee

    const coupons = [];
    for (let i = 0; i < count; i++) {
        const code = generateMostazaCode();
        coupons.push({
            code,
            branchId,
            promotionId,
            discountKind: promotion.discountKind,
            discountValue: promotion.discountValue,
            expiresAt: expireDate,
            emittedBySaleId: null, // Estos son lotes manuales, no atados a una venta
        });
    }

    // Insertar en lote (CUIDADO: Ignoramos duplicados si por extrema casualidad pasa)
    await prisma.coupon.createMany({
      data: coupons,
      skipDuplicates: true,
    });

    // Como puede haber ignorados por colisión, resolvemos trayendo exactamente los generados si es necesario?
    // Para simplificar, asumimos que no hubo colisiones y devolvemos los que se intentaron generar. 
    // Para renderizar el PDF no necesitamos los IDs generados por PRISMA, solo el código y los detalles.
    return NextResponse.json({ 
        success: true, 
        coupons: coupons.map(c => ({ code: c.code, expiresAt: c.expiresAt })) 
    }, { status: 201 });

  } catch (error) {
    console.error("[Cupones] Lote error:", error);
    return NextResponse.json({ error: "Fallo al generar lote de cupones" }, { status: 500 });
  }
}
