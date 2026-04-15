import { NextResponse } from "next/server";

import {
  getPlatformCouponAvailabilityError,
  getPlatformCouponBenefitLabel,
  normalizePlatformCouponCode,
} from "@/lib/platform-coupons";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = normalizePlatformCouponCode(searchParams.get("code"));

    if (!code) {
      return NextResponse.json({ error: "Missing coupon code" }, { status: 400 });
    }

    const coupon = await prisma.platformCoupon.findUnique({
      where: { code },
      select: {
        id: true,
        type: true,
        trialDays: true,
        discountPct: true,
        duration: true,
        durationMonths: true,
        isActive: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
      },
    });

    if (!coupon) {
      return NextResponse.json({ valid: false, message: "Cupon no encontrado." });
    }

    const couponError = getPlatformCouponAvailabilityError(coupon);
    if (couponError) {
      return NextResponse.json({ valid: false, message: couponError });
    }

    return NextResponse.json({
      valid: true,
      type: coupon.type,
      benefitLabel: getPlatformCouponBenefitLabel(coupon),
      trialDays: coupon.trialDays,
      discountPct: coupon.discountPct,
      duration: coupon.duration,
      durationMonths: coupon.durationMonths,
    });
  } catch (error) {
    console.error("[Coupon Preview API] Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
