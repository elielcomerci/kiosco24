/**
 * Loader del Motor de Promociones
 *
 * Responsabilidad: consultar la DB para obtener todas las promociones activas,
 * los datos de vencimiento de los items del carrito, y el cupón (si aplica).
 * Luego llama a applyPromoEngine() y devuelve el resultado.
 *
 * Este módulo SÍ tiene acceso a la DB, pero NO hace writes.
 * El endpoint de ventas usa este resultado dentro de su transacción para persistir.
 */

import { Prisma, prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/inventory-expiry";
import {
  applyPromoEngine,
  type ActivePromotion,
  type CouponRecord,
  type ExpiryInfo,
  type PromoEngineItem,
  type PromoEngineResult,
} from "@/lib/promo-engine";

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function loadAndApplyPromos(
  tx: TxClient,
  branchId: string,
  items: PromoEngineItem[],
  couponCode: string | null,
  now: Date = new Date(),
): Promise<PromoEngineResult & { couponError: string | null }> {
  // ── 1. Cargar promociones activas ─────────────────────────────────────────
  const dbPromos = await tx.promotion.findMany({
    where: { branchId, active: true },
    include: {
      combos: {
        select: { productId: true, variantId: true, quantity: true },
      },
    },
  });

  const promotions: ActivePromotion[] = dbPromos.map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    discountKind: p.discountKind,
    discountValue: p.discountValue,
    startHour: p.startHour,
    endHour: p.endHour,
    weekdays: p.weekdays,
    daysBeforeExpiry: p.daysBeforeExpiry,
    returnCouponThreshold: p.returnCouponThreshold,
    returnCouponValidityHours: p.returnCouponValidityHours,
    combos: p.combos,
    active: p.active,
  }));

  // ── 2. Cargar info de vencimiento para items del carrito ──────────────────
  const productIds = items
    .filter((i) => i.productId !== null)
    .map((i) => i.productId as string);

  const expiryInfo: ExpiryInfo[] = [];

  if (productIds.length > 0) {
    const todayKey = todayDateKey(now);
    const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

    const lots = await tx.stockLot.findMany({
      where: {
        branchId,
        productId: { in: productIds },
        quantity: { gt: 0 },
        expiresOn: { gte: todayDate },
      },
      select: {
        productId: true,
        variantId: true,
        expiresOn: true,
      },
      orderBy: { expiresOn: "asc" },
    });

    // Por cada productId/variantId, guardamos el lote más próximo a vencer
    const seen = new Set<string>();
    for (const lot of lots) {
      const key = `${lot.productId}:${lot.variantId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const msPerDay = 86_400_000;
      const daysLeft = Math.floor(
        (lot.expiresOn.getTime() - todayDate.getTime()) / msPerDay,
      );

      expiryInfo.push({
        productId: lot.productId,
        variantId: lot.variantId,
        daysUntilExpiry: daysLeft,
      });
    }
  }

  // ── 3. Validar cupón (solo lectura, sin marcarlo usado) ───────────────────
  let coupon: CouponRecord | null = null;
  let couponError: string | null = null;

  if (couponCode) {
    const dbCoupon = await tx.coupon.findUnique({
      where: { code: couponCode.toUpperCase().trim() },
      select: {
        id: true,
        branchId: true,
        discountKind: true,
        discountValue: true,
        isUsed: true,
        expiresAt: true,
      },
    });

    if (!dbCoupon) {
      couponError = "El cupón no es válido.";
    } else if (dbCoupon.branchId !== branchId) {
      couponError = "Este cupón no pertenece a esta sucursal.";
    } else if (dbCoupon.isUsed) {
      couponError = "Este cupón ya fue utilizado.";
    } else if (dbCoupon.expiresAt < now) {
      couponError = "El cupón está vencido.";
    } else {
      coupon = {
        id: dbCoupon.id,
        discountKind: dbCoupon.discountKind,
        discountValue: dbCoupon.discountValue,
      };
    }
  }

  // ── 4. Ejecutar el motor ──────────────────────────────────────────────────
  const result = applyPromoEngine({ items, promotions, coupon, expiryInfo, now });

  return { ...result, couponError };
}

/**
 * Genera un código de cupón de retorno único (8 chars, alfanumérico uppercase).
 */
export function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O, 0, I, 1 (confusos en impresión)
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Persiste el resultado del motor dentro de una transacción activa.
 * Debe llamarse desde el endpoint de ventas, dentro de prisma.$transaction.
 */
export async function persistPromoResult(
  tx: Prisma.TransactionClient,
  saleId: string,
  branchId: string,
  result: PromoEngineResult,
): Promise<{ returnCouponCode: string | null }> {
  // 1. Marcar cupón como usado
  if (result.couponId) {
    await tx.coupon.update({
      where: { id: result.couponId },
      data: {
        isUsed: true,
        usedAt: new Date(),
        usedInSaleId: saleId,
      },
    });
  }

  // 2. Crear registros de auditoría
  if (result.applications.length > 0) {
    await tx.salePromoApplication.createMany({
      data: result.applications.map((app) => ({
        saleId,
        type: app.type,
        promotionId: app.promotionId,
        couponId: app.couponId,
        description: app.description,
        discountAmount: app.discountAmount,
      })),
    });
  }

  // 3. Emitir cupón de retorno si corresponde
  let returnCouponCode: string | null = null;
  if (result.returnCouponEligible && result.returnCouponPromoId) {
    const code = generateCouponCode();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + result.returnCouponValidityHours);

    const promo = await tx.promotion.findUnique({
      where: { id: result.returnCouponPromoId },
      select: { discountKind: true, discountValue: true },
    });

    if (promo) {
      await tx.coupon.create({
        data: {
          code,
          branchId,
          promotionId: result.returnCouponPromoId,
          discountKind: promo.discountKind,
          discountValue: promo.discountValue,
          isUsed: false,
          expiresAt,
          emittedBySaleId: saleId,
        },
      });
      returnCouponCode = code;
    }
  }

  return { returnCouponCode };
}
