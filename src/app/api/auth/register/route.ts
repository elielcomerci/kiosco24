import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

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
          seedDefaultCatalog,
          subscriptionOfferPriceArs: subscriptionOffer.priceArs,
          subscriptionOfferFreezeEndsAt: subscriptionOffer.freezeEndsAt,
        },
        tx,
      );

      return {
        user,
        kiosco: provisioned.kiosco,
        branchId: provisioned.mainBranch.id,
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
