import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPriceOverrideForEmail } from "@/lib/subscription-price-overrides";
import { resolveSubscriptionPricing } from "@/lib/subscription-offers";

type CreateSubscriptionPayload = {
  origin?: string;
};

function normalizeOrigin(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : "UNKNOWN";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Solo el dueño puede gestionar la suscripcion." }, { status: 403 });
  }

  if (!session.user.email) {
    return NextResponse.json({ error: "Falta un email valido para generar la suscripcion." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateSubscriptionPayload;
  const origin = normalizeOrigin(body.origin);

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: { subscription: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
  }

  if (kiosco.subscription?.status === "ACTIVE") {
    return NextResponse.json({ error: "Ya tenes una suscripcion activa." }, { status: 400 });
  }

  const priceOverride = await getSubscriptionPriceOverrideForEmail(session.user.email);
  const pricing = resolveSubscriptionPricing({
    emailOverrideAmount: priceOverride?.amount ?? null,
    offerPriceArs: kiosco.subscriptionOfferPriceArs,
    offerFreezeEndsAt: kiosco.subscriptionOfferFreezeEndsAt,
  });
  const transactionAmount = pricing.amountArs;

  const mpHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  };

  const payload = {
    reason:
      pricing.source === "EMAIL_OVERRIDE"
        ? "Suscripcion Mensual Especial - Clikit"
        : "Suscripcion Mensual - Clikit",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: transactionAmount,
      currency_id: "ARS",
    },
    payer_email: session.user.email,
    back_url: `${process.env.NEXTAUTH_URL}/suscripcion?source=mercadopago`,
    status: "pending",
  };

  const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: mpHeaders,
    body: JSON.stringify(payload),
  });

  if (!mpRes.ok) {
    const errorText = await mpRes.text();
    console.error("[MP Preapproval] Error creando suscripcion:", errorText);
    return NextResponse.json(
      { error: "No se pudo generar la suscripcion en MercadoPago." },
      { status: 502 },
    );
  }

  const preapproval = await mpRes.json();
  const preapprovalId = String(preapproval.id);
  const initPoint = preapproval.init_point;

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { kioscoId: kiosco.id },
      create: {
        kioscoId: kiosco.id,
        mpPreapprovalId: preapprovalId,
        managementUrl: preapproval.permalink,
        status: "PENDING",
      },
      update: {
        mpPreapprovalId: preapprovalId,
        managementUrl: preapproval.permalink,
        status: "PENDING",
      },
    }),
    prisma.kiosco.update({
      where: { id: kiosco.id },
      data: {
        subscriptionWelcomeOfferShownAt: kiosco.subscriptionWelcomeOfferShownAt ?? new Date(),
      },
    }),
  ]);

  return NextResponse.json({
    init_point: initPoint,
    amount: transactionAmount,
    origin,
    pricing: {
      amountArs: pricing.amountArs,
      source: pricing.source,
      freezeEndsAt: pricing.freezeEndsAt?.toISOString() ?? null,
    },
  });
}
