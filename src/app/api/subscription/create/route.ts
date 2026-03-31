import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPriceOverrideForEmail } from "@/lib/subscription-price-overrides";
import { SUBSCRIPTION_PRICE_ARS } from "@/lib/subscription-plan";
import { NextResponse } from "next/server";

export async function POST() {
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

  const priceOverride = await getSubscriptionPriceOverrideForEmail(session.user.email);
  const transactionAmount = priceOverride?.amount ?? SUBSCRIPTION_PRICE_ARS;

  // 1. Obtener el kiosco del usuario
  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: { subscription: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
  }

  // 2. Si ya tiene una suscripción activa, no permitir crear otra
  if (kiosco.subscription?.status === "ACTIVE") {
    return NextResponse.json(
      { error: "Ya tenés una suscripción activa." },
      { status: 400 }
    );
  }

  // 3. Crear el Preapproval en MercadoPago
  // Usamos el Access Token de la plataforma (las credenciales en .env.local)
  const mpHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  };

  const payload = {
    reason: "Suscripción Mensual - Kiosco24",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: SUBSCRIPTION_PRICE_ARS,
      currency_id: "ARS",
    },
    // MP requiere el payer_email
    payer_email: session.user.email,
    back_url: `${process.env.NEXTAUTH_URL}/suscripcion?source=mercadopago`,
    status: "pending",
  };

  if (priceOverride) {
    payload.reason = "Suscripcion Mensual Especial - Kiosco24";
  }

  payload.auto_recurring.transaction_amount = transactionAmount;

  const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: mpHeaders,
    body: JSON.stringify(payload),
  });

  if (!mpRes.ok) {
    const errorText = await mpRes.text();
    console.error("[MP Preapproval] Error creando suscripción:", errorText);
    return NextResponse.json(
      { error: "No se pudo generar la suscripción en MercadoPago." },
      { status: 502 }
    );
  }

  const preapproval = await mpRes.json();
  const preapprovalId = String(preapproval.id);
  const initPoint = preapproval.init_point;

  // 4. Guardar en Base de Datos
  await prisma.subscription.upsert({
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
  });

  // 5. Retornar la URL de pago para redirigir al usuario
  return NextResponse.json({ init_point: initPoint, amount: transactionAmount });
}
