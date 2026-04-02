import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/subscription/status
// Devuelve el estado de la suscripción y trial del kiosco
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
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const subscription = branch.kiosco.subscription;

  // Si no hay suscripción, crear una en estado PENDING con trial
  if (!subscription) {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const newSubscription = await prisma.subscription.create({
      data: {
        kioscoId: branch.kioscoId,
        status: "PENDING",
        trialStartsAt: now,
        trialEndsAt: trialEndsAt,
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
    });
  }

  // Si la suscripción existe pero no tiene trial, asignarle uno
  if (!subscription.trialStartsAt || !subscription.trialEndsAt) {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        trialStartsAt: now,
        trialEndsAt: trialEndsAt,
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
    });
  }

  const hasActiveSubscription = subscription.status === "ACTIVE";

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      status: subscription.status,
      trialStartsAt: subscription.trialStartsAt,
      trialEndsAt: subscription.trialEndsAt,
      managementUrl: subscription.managementUrl,
    },
    hasActiveSubscription,
  });
}
