import type { PlatformCouponDuration } from "@prisma/client";

type PlatformCouponBenefitInput = {
  trialDays: number | null | undefined;
  discountPct: number | null | undefined;
  duration: PlatformCouponDuration;
  durationMonths?: number | null | undefined;
};

type PlatformCouponAvailabilityInput = {
  isActive: boolean;
  expiresAt: Date;
  usedCount: number;
  maxUses: number;
};

export function normalizePlatformCouponCode(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function getPlatformCouponDurationLabel(
  duration: PlatformCouponDuration,
  durationMonths?: number | null,
) {
  if (duration === "ONCE") {
    return "en tu primer mes";
  }

  if (duration === "FOR_MONTHS") {
    const safeMonths = Math.max(durationMonths ?? 1, 1);
    return `por ${safeMonths} mes${safeMonths === 1 ? "" : "es"}`;
  }

  return "recurrente";
}

export function getPlatformCouponBenefitLabel(input: PlatformCouponBenefitInput) {
  const parts: string[] = [];

  if (typeof input.trialDays === "number" && input.trialDays > 0) {
    parts.push(`${input.trialDays} dias gratis`);
  }

  if (typeof input.discountPct === "number" && input.discountPct > 0) {
    parts.push(
      `${input.discountPct}% OFF ${getPlatformCouponDurationLabel(input.duration, input.durationMonths)}`,
    );
  }

  return parts.join(" + ");
}

export function getPlatformCouponAvailabilityError(input: PlatformCouponAvailabilityInput) {
  if (!input.isActive) {
    return "Este cupon ya no esta activo.";
  }

  if (input.expiresAt.getTime() <= Date.now()) {
    return "Este cupon ha expirado.";
  }

  if (input.usedCount >= input.maxUses) {
    return "Este cupon ya alcanzo su limite de usos.";
  }

  return null;
}

export function getPlatformCouponRemainingCycles(
  duration: PlatformCouponDuration,
  durationMonths?: number | null,
) {
  if (duration === "ONCE") {
    return 1;
  }

  if (duration === "FOR_MONTHS") {
    return Math.max(durationMonths ?? 1, 1);
  }

  return null;
}

export function getPlatformCouponRegisterPath(code: string) {
  return `/register?coupon=${encodeURIComponent(normalizePlatformCouponCode(code))}`;
}

export function parsePlatformCouponCodeFromScan(value: string) {
  const rawValue = value.trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawValue);
    return normalizePlatformCouponCode(
      parsedUrl.searchParams.get("coupon") ??
        parsedUrl.searchParams.get("code") ??
        parsedUrl.pathname.split("/").filter(Boolean).pop(),
    );
  } catch {
    return normalizePlatformCouponCode(rawValue);
  }
}
