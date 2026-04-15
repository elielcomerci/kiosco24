import { PlatformCouponDuration, PlatformCouponType } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import {
  getPlatformCouponBenefitLabel,
  getPlatformCouponRegisterPath,
  normalizePlatformCouponCode,
} from "@/lib/platform-coupons";
import { prisma } from "@/lib/prisma";

const MAX_BATCH_SIZE = 500;

type CreatePlatformCouponsBody = {
  code?: string;
  count?: number;
  type?: PlatformCouponType;
  trialDays?: number | null;
  discountPct?: number | null;
  duration?: PlatformCouponDuration;
  durationMonths?: number | null;
  maxUses?: number | null;
  expiresAt?: string;
  note?: string | null;
};

function parsePositiveInteger(value: unknown) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function generatePlatformCouponCode() {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `CLK-${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

function buildPlatformCouponSeriesCodes(baseCode: string, count: number) {
  const safeBaseCode = baseCode.replace(/-+$/g, "");
  const width = Math.max(2, String(count).length);

  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(width, "0");
    return `${safeBaseCode}-${suffix}`;
  });
}

async function generateAutoPlatformCouponCodes(count: number) {
  const codes = new Set<string>();
  const maxAttempts = Math.max(count * 120, 120);
  let attempts = 0;

  while (codes.size < count) {
    if (attempts >= maxAttempts) {
      throw new Error("No pudimos generar suficientes codigos unicos.");
    }

    codes.add(generatePlatformCouponCode());
    attempts += 1;
  }

  while (true) {
    const currentCodes = [...codes];
    const conflicts = await prisma.platformCoupon.findMany({
      where: { code: { in: currentCodes } },
      select: { code: true },
    });

    if (conflicts.length === 0) {
      return currentCodes;
    }

    for (const conflict of conflicts) {
      codes.delete(conflict.code);
    }

    while (codes.size < count) {
      if (attempts >= maxAttempts) {
        throw new Error("No pudimos generar suficientes codigos unicos.");
      }

      codes.add(generatePlatformCouponCode());
      attempts += 1;
    }
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CreatePlatformCouponsBody;
    const type =
      body.type === PlatformCouponType.TRIAL_DAYS
        ? PlatformCouponType.TRIAL_DAYS
        : PlatformCouponType.SUBSCRIPTION_DISCOUNT;
    const requestedDuration =
      body.duration === PlatformCouponDuration.RECURRING
        ? PlatformCouponDuration.RECURRING
        : body.duration === PlatformCouponDuration.FOR_MONTHS
          ? PlatformCouponDuration.FOR_MONTHS
          : PlatformCouponDuration.ONCE;
    const duration =
      type === PlatformCouponType.SUBSCRIPTION_DISCOUNT
        ? requestedDuration
        : PlatformCouponDuration.ONCE;
    const manualCode = normalizePlatformCouponCode(body.code);
    const count = parsePositiveInteger(body.count) ?? 1;
    const trialDays = parsePositiveInteger(body.trialDays);
    const discountPct = parsePositiveInteger(body.discountPct);
    const durationMonths = parsePositiveInteger(body.durationMonths);
    const maxUses = parsePositiveInteger(body.maxUses) ?? 1;
    const note = String(body.note ?? "").trim() || null;
    const expiresAt = new Date(String(body.expiresAt ?? ""));

    if (!Number.isFinite(count) || count < 1 || count > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `La serie debe tener entre 1 y ${MAX_BATCH_SIZE} cupones.` },
        { status: 400 },
      );
    }

    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "La fecha de expiracion no es valida." }, { status: 400 });
    }

    if (type === PlatformCouponType.TRIAL_DAYS && !trialDays) {
      return NextResponse.json(
        { error: "Debes indicar cuantos dias de trial otorga el cupon." },
        { status: 400 },
      );
    }

    if (type === PlatformCouponType.SUBSCRIPTION_DISCOUNT && (!discountPct || discountPct > 100)) {
      return NextResponse.json(
        { error: "El descuento debe ser un porcentaje entre 1 y 100." },
        { status: 400 },
      );
    }

    if (duration === PlatformCouponDuration.FOR_MONTHS && !durationMonths) {
      return NextResponse.json(
        { error: "Debes indicar cuantos meses dura el descuento." },
        { status: 400 },
      );
    }

    const seriesBaseCode = manualCode.replace(/-+$/g, "");
    if (manualCode && count > 1 && !seriesBaseCode) {
      return NextResponse.json(
        { error: "El prefijo de la serie no es valido." },
        { status: 400 },
      );
    }

    const codes =
      manualCode && count > 1
        ? buildPlatformCouponSeriesCodes(seriesBaseCode, count)
        : manualCode
          ? [manualCode]
          : await generateAutoPlatformCouponCodes(count);

    if (manualCode) {
      const conflicts = await prisma.platformCoupon.findMany({
        where: { code: { in: codes } },
        select: { code: true },
      });

      if (conflicts.length > 0) {
        const repeatedCodes = conflicts.map((conflict) => conflict.code);
        const preview = repeatedCodes.slice(0, 3).join(", ");
        const suffix = repeatedCodes.length > 3 ? "..." : "";
        return NextResponse.json(
          {
            error:
              count > 1
                ? `La serie ya tiene codigos existentes: ${preview}${suffix}`
                : `El codigo ${repeatedCodes[0]} ya existe.`,
          },
          { status: 409 },
        );
      }
    }

    const coupons = codes.map((code) => ({
      code,
      type,
      trialDays: type === PlatformCouponType.TRIAL_DAYS ? trialDays : null,
      discountPct: type === PlatformCouponType.SUBSCRIPTION_DISCOUNT ? discountPct : null,
      duration,
      durationMonths: duration === PlatformCouponDuration.FOR_MONTHS ? durationMonths : null,
      maxUses,
      expiresAt,
      note,
      createdById: session.user.id,
      createdByEmail: session.user.email ?? null,
      isActive: true,
    }));

    await prisma.platformCoupon.createMany({
      data: coupons,
    });

    const benefitLabel =
      getPlatformCouponBenefitLabel({
        trialDays: type === PlatformCouponType.TRIAL_DAYS ? trialDays : null,
        discountPct: type === PlatformCouponType.SUBSCRIPTION_DISCOUNT ? discountPct : null,
        duration,
        durationMonths: duration === PlatformCouponDuration.FOR_MONTHS ? durationMonths : null,
      }) || "Cupon de plataforma";

    return NextResponse.json(
      {
        success: true,
        benefitLabel,
        coupons: coupons.map((coupon) => ({
          code: coupon.code,
          expiresAt: coupon.expiresAt.toISOString(),
          note: coupon.note,
          registerPath: getPlatformCouponRegisterPath(coupon.code),
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[admin/platform-coupons] create error", error);
    return NextResponse.json(
      { error: "No pudimos generar los cupones de plataforma." },
      { status: 500 },
    );
  }
}
