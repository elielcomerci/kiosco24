/**
 * Motor de Promociones — Clikit
 *
 * Función pura: recibe el estado actual del carrito + las promociones vigentes
 * y devuelve los items ajustados + metadatos de auditoría.
 *
 * SIN side effects de DB. Toda persistencia la maneja el endpoint de ventas
 * dentro de su transacción.
 *
 * Jerarquía de capas:
 *   1. Pre-cómputo de Zona Roja por item
 *   2. Greedy Combos (con guard: nunca captura un item si el combo es más caro que su Zona Roja)
 *   3. Zona Roja sobre items sueltos
 *   4. Happy Hour / Día Temático sobre items sueltos sin Zona Roja
 *   5. Cupón sobre el subtotal post-capas
 */

import { Prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/inventory-expiry";

// ── Tipos de entrada ──────────────────────────────────────────────────────────

export type PromoEngineItem = {
  productId: string | null;
  variantId: string | null;
  name: string;
  price: number;      // precio de lista (del inventario)
  quantity: number;
  soldByWeight: boolean;
  cost: number | null;
};

export type ActivePromotion = {
  id: string;
  type: "COMBO" | "ZONA_ROJA" | "HAPPY_HOUR" | "DIA_TEMATICO";
  name: string;
  active: boolean;
  discountKind: "PERCENTAGE" | "FIXED_PRICE";
  discountValue: number;
  startHour: number | null;
  endHour: number | null;
  weekdays: number[];
  daysBeforeExpiry: number | null;
  returnCouponThreshold: number | null;
  returnCouponValidityHours: number | null;
  combos: Array<{
    productId: string;
    variantId: string | null;
    quantity: number;
  }>;
};

export type CouponRecord = {
  id: string;
  discountKind: "PERCENTAGE" | "FIXED_PRICE";
  discountValue: number;
  overrideMode?: boolean; // true si un supervisor lo forzó
};

// Información de vencimiento por producto/variante del carrito
export type ExpiryInfo = {
  productId: string;
  variantId: string | null;
  daysUntilExpiry: number; // días hasta el lote más próximo a vencer
};

// ── Tipos de salida ───────────────────────────────────────────────────────────

export type AdjustedItem = PromoEngineItem & {
  originalPrice: number;           // precio de lista antes de cualquier promo
  appliedPromoType: "COMBO" | "ZONA_ROJA" | "HAPPY_HOUR" | "NONE" | null;
  appliedPromoId: string | null;
  comboGroupId: string | null;     // id de la Promotion que formó el combo (para agrupar visualmente)
};

export type PromoApplicationDraft = {
  type: "COMBO" | "ZONA_ROJA" | "HAPPY_HOUR" | "DIA_TEMATICO";
  promotionId: string | null;
  couponId: string | null;
  description: string;
  discountAmount: number;
};

export type PromoEngineResult = {
  adjustedItems: AdjustedItem[];
  subtotalBeforePromos: number;
  subtotalAfterItemPromos: number;  // después de combos + zona roja + happy hour
  couponDiscount: number;
  totalDiscount: number;
  total: number;
  applications: PromoApplicationDraft[];
  couponId: string | null;          // para marcarlo isUsed dentro de la tx
  returnCouponEligible: boolean;    // si la venta supera el umbral de cupón de retorno
  returnCouponPromoId: string | null;
  returnCouponValidityHours: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function itemSubtotal(item: { price: number; quantity: number; soldByWeight: boolean }) {
  const displayQty = item.soldByWeight ? item.quantity / 1000 : item.quantity;
  return round2(item.price * displayQty);
}

function isHappyHourActive(promo: ActivePromotion, now: Date): boolean {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Dom

  if (promo.weekdays.length > 0 && !promo.weekdays.includes(day)) {
    return false;
  }

  if (promo.startHour !== null && promo.endHour !== null) {
    if (promo.startHour <= promo.endHour) {
      return hour >= promo.startHour && hour < promo.endHour;
    }
    // cruza medianoche
    return hour >= promo.startHour || hour < promo.endHour;
  }

  return true;
}

function applyPercentageDiscount(price: number, percentage: number): number {
  return round2(price * (1 - percentage / 100));
}

// ── Algoritmo principal ───────────────────────────────────────────────────────

export function applyPromoEngine(input: {
  items: PromoEngineItem[];
  promotions: ActivePromotion[];
  coupon: CouponRecord | null;
  expiryInfo: ExpiryInfo[];  // días hasta vencimiento por item del carrito
  now?: Date;
}): PromoEngineResult {
  const now = input.now ?? new Date();
  const applications: PromoApplicationDraft[] = [];

  // Copia mutable de los items — iremos ajustando precios
  const adjusted: AdjustedItem[] = input.items.map((item) => ({
    ...item,
    originalPrice: item.price,
    appliedPromoType: null,
    appliedPromoId: null,
    comboGroupId: null,
  }));

  // Índice de expiración por clave "productId:variantId"
  const expiryMap = new Map<string, number>();
  for (const e of input.expiryInfo) {
    const key = `${e.productId}:${e.variantId ?? ""}`;
    const existing = expiryMap.get(key);
    if (existing === undefined || e.daysUntilExpiry < existing) {
      expiryMap.set(key, e.daysUntilExpiry);
    }
  }

  // ── Paso 1: Pre-cómputo de precios Zona Roja ─────────────────────────────
  // Para cada item, calcular cuánto le costaría CON descuento de Zona Roja.
  // Esto lo usa el Greedy del paso siguiente como "precio de referencia".
  const zonaRojaPromos = input.promotions.filter((p) => p.type === "ZONA_ROJA" && p.active !== false);
  const zonaRojaPriceMap = new Map<string, number>(); // key → precio post-zona-roja

  for (const item of adjusted) {
    if (!item.productId) continue;
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const daysLeft = expiryMap.get(key);
    if (daysLeft === undefined) continue;

    for (const promo of zonaRojaPromos) {
      if (promo.daysBeforeExpiry === null) continue;
      if (daysLeft <= promo.daysBeforeExpiry) {
        // Este item califica para Zona Roja
        let zonaPrice = item.price;
        if (promo.discountKind === "PERCENTAGE") {
          zonaPrice = applyPercentageDiscount(item.price, promo.discountValue);
        }
        // Guardamos el precio más bajo posible entre todas las Zona Roja activas
        const existing = zonaRojaPriceMap.get(key);
        if (existing === undefined || zonaPrice < existing) {
          zonaRojaPriceMap.set(key, zonaPrice);
        }
      }
    }
  }

  // ── Paso 2: Greedy Combos ─────────────────────────────────────────────────
  // Los combos se ordenan por valor nominal descendente (mayor ahorro primero).
  const comboPros = input.promotions
    .filter((p) => p.type === "COMBO" && p.active)
    .sort((a, b) => b.discountValue - a.discountValue);

  // Índice de cuántas unidades de cada item quedan disponibles para combos
  const available = new Map<string, number>();
  for (const item of adjusted) {
    const key = `${item.productId ?? ""}:${item.variantId ?? ""}`;
    available.set(key, (available.get(key) ?? 0) + item.quantity);
  }

  for (const combo of comboPros) {
    if (combo.discountKind !== "FIXED_PRICE") continue; // Iteración 1: solo precio fijo
    if (combo.combos.length === 0) continue;

    // Verificar si todos los componentes están en el carrito
    const canForm = combo.combos.every((component) => {
      const key = `${component.productId}:${component.variantId ?? ""}`;
      return (available.get(key) ?? 0) >= component.quantity;
    });

    if (!canForm) continue;

    // Guard: verificar que el combo sea beneficioso para el cliente
    // precio efectivo por unidad del combo vs precio de Zona Roja de cada componente
    const totalComponents = combo.combos.reduce((sum, c) => sum + c.quantity, 0);
    const effectiveUnitPrice = combo.discountValue / totalComponents;

    let skipCombo = false;
    for (const component of combo.combos) {
      const key = `${component.productId}:${component.variantId ?? ""}`;
      const zonaRojaPrice = zonaRojaPriceMap.get(key);
      if (zonaRojaPrice !== undefined && effectiveUnitPrice > zonaRojaPrice) {
        skipCombo = true;
        break;
      }
    }

    if (skipCombo) continue;

    // Aplicar el combo: distribuir el precio fijo proporcionalmente entre los items
    // Calcular el precio total de lista de los componentes para calcular la proporción
    let listSubtotalForCombo = 0;
    for (const component of combo.combos) {
      const key = `${component.productId}:${component.variantId ?? ""}`;
      const matchItem = adjusted.find(
        (i) =>
          `${i.productId ?? ""}:${i.variantId ?? ""}` === key &&
          i.appliedPromoType === null
      );
      if (matchItem) {
        listSubtotalForCombo += matchItem.price * component.quantity;
      }
    }

    let comboDiscountTotal = 0;

    for (const component of combo.combos) {
      const key = `${component.productId}:${component.variantId ?? ""}`;
      const matchItem = adjusted.find(
        (i) =>
          `${i.productId ?? ""}:${i.variantId ?? ""}` === key &&
          i.appliedPromoType === null
      );

      if (!matchItem) continue;

      // Precio proporcional: este item paga su fracción del precio fijo del combo
      const proportion = listSubtotalForCombo > 0
        ? (matchItem.price * component.quantity) / listSubtotalForCombo
        : 1 / combo.combos.length;

      const newPrice = round2((combo.discountValue * proportion) / component.quantity);
      const savedPerUnit = round2(matchItem.price - newPrice);

      comboDiscountTotal += round2(savedPerUnit * component.quantity);

      matchItem.price = newPrice;
      matchItem.appliedPromoType = "COMBO";
      matchItem.appliedPromoId = combo.id;
      matchItem.comboGroupId = combo.id;

      // Descontar del disponible
      available.set(key, (available.get(key) ?? 0) - component.quantity);
    }

    if (comboDiscountTotal > 0) {
      applications.push({
        type: "COMBO",
        promotionId: combo.id,
        couponId: null,
        description: `Combo: ${combo.name}`,
        discountAmount: round2(comboDiscountTotal),
      });
    }
  }

  // ── Paso 3: Zona Roja sobre items sueltos ─────────────────────────────────
  for (const item of adjusted) {
    if (item.appliedPromoType !== null) continue; // ya fue capturado por un combo
    if (!item.productId) continue;

    const key = `${item.productId}:${item.variantId ?? ""}`;
    const zonaPrice = zonaRojaPriceMap.get(key);
    if (zonaPrice === undefined) continue;

    // Encontrar la promo de Zona Roja que produjo ese precio (para el ID)
    const daysLeft = expiryMap.get(key) ?? Infinity;
    const matchingPromo = zonaRojaPromos.find(
      (p) => p.daysBeforeExpiry !== null && daysLeft <= p.daysBeforeExpiry
    );

    const saved = round2((item.price - zonaPrice) * (item.soldByWeight ? item.quantity / 1000 : item.quantity));
    item.appliedPromoType = "ZONA_ROJA";
    item.appliedPromoId = matchingPromo?.id ?? null;
    item.price = zonaPrice;

    if (saved > 0) {
      applications.push({
        type: "ZONA_ROJA",
        promotionId: matchingPromo?.id ?? null,
        couponId: null,
        description: `Zona Roja: ${item.name}`,
        discountAmount: saved,
      });
    }
  }

  // ── Paso 4: Happy Hour sobre items sueltos sin promo ─────────────────────
  const happyHourPromos = input.promotions.filter(
    (p) => (p.type === "HAPPY_HOUR" || p.type === "DIA_TEMATICO") && isHappyHourActive(p, now)
  );

  if (happyHourPromos.length > 0) {
    // Usar la promo con mayor descuento en caso de que haya varias activas
    const bestHH = happyHourPromos.sort((a, b) => b.discountValue - a.discountValue)[0];

    let hhDiscountTotal = 0;
    for (const item of adjusted) {
      if (item.appliedPromoType !== null) continue;
      if (bestHH.discountKind !== "PERCENTAGE") continue;

      const newPrice = applyPercentageDiscount(item.price, bestHH.discountValue);
      const saved = round2(
        (item.price - newPrice) * (item.soldByWeight ? item.quantity / 1000 : item.quantity)
      );
      hhDiscountTotal += saved;
      item.price = newPrice;
      item.appliedPromoType = bestHH.type as "HAPPY_HOUR";
      item.appliedPromoId = bestHH.id;
    }

    if (hhDiscountTotal > 0) {
      applications.push({
        type: bestHH.type as "HAPPY_HOUR",
        promotionId: bestHH.id,
        couponId: null,
        description: `${bestHH.name}`,
        discountAmount: round2(hhDiscountTotal),
      });
    }
  }

  // ── Cálculos de subtotales ────────────────────────────────────────────────
  const subtotalBeforePromos = round2(
    input.items.reduce((sum, item) => sum + itemSubtotal(item), 0)
  );
  const subtotalAfterItemPromos = round2(
    adjusted.reduce((sum, item) => sum + itemSubtotal(item), 0)
  );

  // ── Paso 5: Cupón sobre el subtotal post-capas ────────────────────────────
  let couponDiscount = 0;
  let couponId: string | null = null;

  if (input.coupon) {
    const c = input.coupon;
    if (c.discountKind === "PERCENTAGE") {
      couponDiscount = round2(subtotalAfterItemPromos * (c.discountValue / 100));
    } else {
      couponDiscount = round2(Math.min(c.discountValue, subtotalAfterItemPromos));
    }

    applications.push({
      type: "COMBO", // se reutiliza el campo; la distinción real está en couponId
      promotionId: null,
      couponId: c.id,
      description: `Cupón aplicado`,
      discountAmount: couponDiscount,
    });

    couponId = c.id;
  }

  const total = round2(Math.max(0, subtotalAfterItemPromos - couponDiscount));
  const totalDiscount = round2(subtotalBeforePromos - total);

  // ── Paso 6: Cupón de retorno ──────────────────────────────────────────────
  let returnCouponEligible = false;
  let returnCouponPromoId: string | null = null;
  let returnCouponValidityHours = 72;

  const returnPromo = input.promotions.find(
    (p) => p.returnCouponThreshold !== null && total >= p.returnCouponThreshold
  );

  if (returnPromo) {
    returnCouponEligible = true;
    returnCouponPromoId = returnPromo.id;
    returnCouponValidityHours = returnPromo.returnCouponValidityHours ?? 72;
  }

  return {
    adjustedItems: adjusted,
    subtotalBeforePromos,
    subtotalAfterItemPromos,
    couponDiscount,
    totalDiscount,
    total,
    applications,
    couponId,
    returnCouponEligible,
    returnCouponPromoId,
    returnCouponValidityHours,
  };
}
