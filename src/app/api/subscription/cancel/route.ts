import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Solo el dueño puede cancelar la suscripción." }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: { subscription: true },
  });

  if (!kiosco || !kiosco.subscription?.mpPreapprovalId) {
    return NextResponse.json({ error: "No se encontró una suscripción activa." }, { status: 404 });
  }

  const subscription = kiosco.subscription;

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscription.mpPreapprovalId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (!mpRes.ok) {
      const errorText = await mpRes.text();
      console.error("[MP Preapproval Cancel] Error cancelando suscripción:", errorText);
      return NextResponse.json(
        { error: "No se pudo cancelar en MercadoPago. Por favor, intentá nuevamente." },
        { status: 502 }
      );
    }

    // Actualizamos localmente el estado
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MP Preapproval Cancel] Excepción:", error);
    return NextResponse.json(
        { error: "Ocurrió un error al intentar cancelar la suscripción." },
        { status: 500 }
    );
  }
}
