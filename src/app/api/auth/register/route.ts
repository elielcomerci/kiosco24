import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  isValidBusinessActivity,
  shouldSeedDefaultCatalogForBusinessActivity,
} from "@/lib/business-activities-store";
import { prisma } from "@/lib/prisma";
import { provisionOwnerKiosco } from "@/lib/provision-owner-kiosco";
import { buildNewAccountSubscriptionOffer } from "@/lib/subscription-offers";

type RegisterPayload = {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  mainBusinessActivity?: string;
  email?: string;
  password?: string;
  referralCode?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

    // Fallback: if no referralCode in body, try the attribution cookie
    const cookieStore = await cookies();
    const effectiveReferralCode = referralCode || cookieStore.get("clikit_ref")?.value || null;

    if (!firstName || !lastName || !businessName || !email || !password || !mainBusinessActivity) {
      return NextResponse.json(
        { error: "Completá nombre, apellido, negocio, rubro, email y contraseña." },
        { status: 400 },
      );
    }

    if (!(await isValidBusinessActivity(mainBusinessActivity))) {
      return NextResponse.json({ error: "Elegí un rubro principal válido." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña tiene que tener al menos 8 caracteres." },
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

      // Link to partner referral if a valid referral code was provided (body or cookie)
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
    const details = error instanceof Error ? error.message : "Unknown error";
    const stack =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.stack
        : undefined;

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
