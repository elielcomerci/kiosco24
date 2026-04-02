import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/subscription/status
// Devuelve el estado de la suscripción y trial del kiosco
// Reglas de trial:
// - Solo suscripciones PENDING sin activeGrant reciben trial
// - ACTIVE o ACTIVE_GRANT no reciben trial
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      kioscoId: true,
      kiosco: {
        select: {
          subscription: {
            select: {
              id: true,
              status: true,
              trialStartsAt: true,
              trialEndsAt: true,
              managementUrl: true,
            },
          },
          accessGrants: {
            where: { revokedAt: null },
            orderBy: { endsAt: "desc" },
            take: 1,
            select: { startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const subscription = branch.kiosco.subscription;
  const now = new Date();
  const activeGrant = branch.kiosco.accessGrants.find(
    (g) => g.startsAt <= now && g.endsAt >= now
  );

  console.log("[Subscription API] Kiosco:", branch.kioscoId);
  console.log("[Subscription API] Subscription status:", subscription?.status);
  console.log("[Subscription API] Access grants count:", branch.kiosco.accessGrants.length);
  console.log("[Subscription API] Active grant:", activeGrant ? "FOUND" : "NONE");

  // Si hay activeGrant, no asignar trial - el usuario está en grace period
  if (activeGrant) {
    console.log("[Subscription API] Returning with activeGrant");
    return NextResponse.json({
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        trialStartsAt: subscription.trialStartsAt,
        trialEndsAt: subscription.trialEndsAt,
        managementUrl: subscription.managementUrl,
      } : null,
      hasActiveSubscription: false,
      hasActiveGrant: true,
    });
  }

  // Si no hay suscripción, crear una en estado PENDING con trial
  if (!subscription) {
    const trialStartsAt = now;
    const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const newSubscription = await prisma.subscription.create({
      data: {
        kioscoId: branch.kioscoId,
        status: "PENDING",
        trialStartsAt,
        trialEndsAt,
      },
      select: {
        id: true,
        status: true,
        trialStartsAt: true,
        trialEndsAt: true,
        managementUrl: true,
      },
    });

    return NextResponse.json({
      subscription: newSubscription,
      hasActiveSubscription: false,
      hasActiveGrant: false,
    });
  }

  // Si la suscripción es ACTIVE, no tocar el trial
  if (subscription.status === "ACTIVE") {
    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        trialStartsAt: subscription.trialStartsAt,
        trialEndsAt: subscription.trialEndsAt,
        managementUrl: subscription.managementUrl,
      },
      hasActiveSubscription: true,
      hasActiveGrant: false,
    });
  }

  // Si la suscripción existe pero no tiene trial, y es PENDING, asignarle uno
  if (!subscription.trialStartsAt || !subscription.trialEndsAt) {
    const trialStartsAt = now;
    const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        trialStartsAt,
        trialEndsAt,
      },
      select: {
        id: true,
        status: true,
        trialStartsAt: true,
        trialEndsAt: true,
        managementUrl: true,
      },
    });

    return NextResponse.json({
      subscription: updatedSubscription,
      hasActiveSubscription: false,
      hasActiveGrant: false,
    });
  }

  // Si llegamos acá, la suscripción tiene trial y no es ACTIVE
  // (las ACTIVE ya retornaron antes)
  return NextResponse.json({
    subscription: {
      id: subscription.id,
      status: subscription.status,
      trialStartsAt: subscription.trialStartsAt,
      trialEndsAt: subscription.trialEndsAt,
      managementUrl: subscription.managementUrl,
    },
    hasActiveSubscription: false,
    hasActiveGrant: false,
  });
}
