import { type SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MP_SYNC_TIMEOUT_MS = 3500;

function mapMercadoPagoStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case "authorized":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

export async function syncSubscriptionFromMercadoPago(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      kioscoId: true,
      mpPreapprovalId: true,
      managementUrl: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!subscription?.mpPreapprovalId || !process.env.MP_ACCESS_TOKEN) {
    return subscription;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MP_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${subscription.mpPreapprovalId}`, {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `[Subscription Sync] MercadoPago respondio ${response.status} para ${subscription.id}. Uso el ultimo estado persistido.`,
      );
      return subscription;
    }

    const mpData = await response.json();
    const nextStatus = mapMercadoPagoStatus(mpData.status);
    const nextManagementUrl =
      typeof mpData.permalink === "string" && mpData.permalink.trim()
        ? mpData.permalink
        : subscription.managementUrl;

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus,
        managementUrl: nextManagementUrl ?? null,
      },
      select: {
        id: true,
        status: true,
        managementUrl: true,
        updatedAt: true,
        kioscoId: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.error(
      `[Subscription Sync] No se pudo sincronizar ${subscription.id} en tiempo razonable: ${message}. Uso el ultimo estado persistido.`,
    );
    return subscription;
  } finally {
    clearTimeout(timeoutId);
  }
}
