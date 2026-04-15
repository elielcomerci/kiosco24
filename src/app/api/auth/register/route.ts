import bcrypt from "bcryptjs";
import { PlatformCouponDuration, UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  isValidBusinessActivity,
  shouldSeedDefaultCatalogForBusinessActivity,
} from "@/lib/business-activities-store";
import {
  getPlatformCouponAvailabilityError,
  getPlatformCouponBenefitLabel,
  getPlatformCouponRemainingCycles,
  normalizePlatformCouponCode,
} from "@/lib/platform-coupons";
import { prisma } from "@/lib/prisma";
import { provisionOwnerKiosco } from "@/lib/provision-owner-kiosco";
import { normalizeSubscriptionPriceOverrideEmail } from "@/lib/subscription-price-overrides";
import { buildNewAccountSubscriptionOffer } from "@/lib/subscription-offers";
import { SUBSCRIPTION_PRICE_ARS } from "@/lib/subscription-plan";

type RegisterPayload = {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  mainBusinessActivity?: string;
  email?: string;
  password?: string;
  referralCode?: string;
  platformCouponCode?: string;
};

type CouponBenefit = {
  id: string;
  trialDays: number | null;
  discountPct: number | null;
  duration: PlatformCouponDuration;
  durationMonths: number | null;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

class PlatformCouponError extends Error {}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterPayload;

    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const businessName = normalizeText(body.businessName);
    const email = normalizeText(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const mainBusinessActivity = normalizeText(body.mainBusinessActivity);
    const referralCode = normalizeText(body.referralCode);
    const platformCouponCode = normalizePlatformCouponCode(body.platformCouponCode);

    const cookieStore = await cookies();
    const effectiveReferralCode = referralCode || cookieStore.get("clikit_ref")?.value || null;

    if (!firstName || !lastName || !businessName || !email || !password || !mainBusinessActivity) {
      return NextResponse.json(
        { error: "Completa nombre, apellido, negocio, rubro, email y contrasena." },
        { status: 400 },
      );
    }

    if (!(await isValidBusinessActivity(mainBusinessActivity))) {
      return NextResponse.json({ error: "Elige un rubro principal valido." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contrasena tiene que tener al menos 8 caracteres." },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const fullName = `${firstName} ${lastName}`.trim();
    const seedDefaultCatalog = await shouldSeedDefaultCatalogForBusinessActivity(
      mainBusinessActivity,
    );
    const subscriptionOffer = buildNewAccountSubscriptionOffer();

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName,
          lastName,
          name: fullName,
          email,
          password: hashedPassword,
          role: UserRole.OWNER,
        },
      });

      let couponBenefit: CouponBenefit | null = null;

      if (platformCouponCode) {
        const coupon = await tx.platformCoupon.findUnique({
          where: { code: platformCouponCode },
          select: {
            id: true,
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
          throw new PlatformCouponError("El cupon de plataforma no existe.");
        }

        const couponError = getPlatformCouponAvailabilityError(coupon);
        if (couponError) {
          throw new PlatformCouponError(couponError);
        }

        couponBenefit = {
          id: coupon.id,
          trialDays: coupon.trialDays ?? null,
          discountPct: coupon.discountPct ?? null,
          duration: coupon.duration,
          durationMonths: coupon.durationMonths ?? null,
        };

        await tx.platformCoupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      const finalTrialDays = 30 + (couponBenefit?.trialDays ?? 0);
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + finalTrialDays * 24 * 60 * 60 * 1000);

      const provisioned = await provisionOwnerKiosco(
        {
          ownerId: user.id,
          kioscoName: businessName,
          mainBusinessActivity,
          subscriptionOfferPriceArs: subscriptionOffer.priceArs,
          subscriptionOfferFreezeEndsAt: subscriptionOffer.freezeEndsAt,
        },
        tx,
      );

      await tx.subscription.update({
        where: { kioscoId: provisioned.kiosco.id },
        data: { trialEndsAt },
      });

      if (typeof couponBenefit?.discountPct === "number" && couponBenefit.discountPct > 0) {
        const discountedAmount = Math.round(
          SUBSCRIPTION_PRICE_ARS * (1 - couponBenefit.discountPct / 100),
        );

        await tx.subscriptionPriceOverride.create({
          data: {
            email: normalizeSubscriptionPriceOverrideEmail(email),
            amount: discountedAmount,
            remainingCycles: getPlatformCouponRemainingCycles(
              couponBenefit.duration,
              couponBenefit.durationMonths,
            ),
            note: `Cupon plataforma: ${platformCouponCode} (${getPlatformCouponBenefitLabel(couponBenefit)})`,
          },
        });
      }

      if (couponBenefit) {
        await tx.platformCouponRedemption.create({
          data: {
            couponId: couponBenefit.id,
            kioscoId: provisioned.kiosco.id,
          },
        });
      }

      let linkedReferralId: string | undefined;
      if (effectiveReferralCode) {
        const partner = await tx.partnerProfile.findUnique({
          where: { referralCode: effectiveReferralCode },
          select: { id: true },
        });

        if (partner) {
          const referral = await tx.referral.create({
            data: {
              partnerId: partner.id,
              referredKioscoId: provisioned.kiosco.id,
              status: "PENDING",
            },
          });
          linkedReferralId = referral.id;
        }
      }

      return {
        user,
        kiosco: provisioned.kiosco,
        branchId: provisioned.mainBranch.id,
        referralId: linkedReferralId,
      };
    });

    return NextResponse.json({
      user: {
        id: created.user.id,
        email: created.user.email,
        firstName: created.user.firstName,
        lastName: created.user.lastName,
        name: created.user.name,
      },
      kiosco: {
        id: created.kiosco.id,
        name: created.kiosco.name,
        mainBusinessActivity: created.kiosco.mainBusinessActivity,
      },
      branchId: created.branchId,
      seededDefaultCatalog: seedDefaultCatalog,
      subscriptionOffer: {
        priceArs: subscriptionOffer.priceArs,
        freezeEndsAt: subscriptionOffer.freezeEndsAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof PlatformCouponError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const details = error instanceof Error ? error.message : "Unknown error";
    const stack =
      process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined;

    console.error("[Register] CRITICAL ERROR:", error);
    return NextResponse.json(
      {
        error: "Error al registrar la cuenta.",
        details,
        ...(stack ? { stack } : {}),
      },
      { status: 500 },
    );
  }
}
