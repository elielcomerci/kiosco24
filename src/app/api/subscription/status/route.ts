import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSubscriptionFromMercadoPago } from "@/lib/subscription";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: { subscription: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
  }

  if (!kiosco.subscription) {
    return NextResponse.json(null);
  }

  let status = kiosco.subscription.status;
  let managementUrl = kiosco.subscription.managementUrl;
  let updatedAt = kiosco.subscription.updatedAt;

  try {
    const syncedSubscription = await syncSubscriptionFromMercadoPago(kiosco.subscription.id);
    if (syncedSubscription) {
      status = syncedSubscription.status;
      managementUrl = syncedSubscription.managementUrl;
      updatedAt = syncedSubscription.updatedAt;
    }
  } catch (error) {
    console.error("[Subscription Status] Error sincronizando con MercadoPago:", error);
  }

  return NextResponse.json({
    status,
    managementUrl,
    updatedAt,
  });
}
