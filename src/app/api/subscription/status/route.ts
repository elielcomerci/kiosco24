import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getSubscriptionPriceOverrideForEmail } from "@/lib/subscription-price-overrides";
import { resolveSubscriptionPricing } from "@/lib/subscription-offers";

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
          subscriptionOfferPriceArs: true,
          subscriptionOfferFreezeEndsAt: true,
          subscriptionWelcomeOfferShownAt: true,
          subscription: {
            select: {
              id: true,
              status: true,
              managementUrl: true,
              updatedAt: true,
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

  const now = new Date();
  const activeGrant = branch.kiosco.accessGrants.find((grant) => grant.startsAt <= now && grant.endsAt >= now);
  const priceOverride =
    session.user.role === "EMPLOYEE"
      ? null
      : await getSubscriptionPriceOverrideForEmail(session.user.email);
  const pricing = resolveSubscriptionPricing({
    emailOverrideAmount: priceOverride?.amount ?? null,
    offerPriceArs: branch.kiosco.subscriptionOfferPriceArs,
    offerFreezeEndsAt: branch.kiosco.subscriptionOfferFreezeEndsAt,
  });

  return NextResponse.json({
    subscription: branch.kiosco.subscription
      ? {
          id: branch.kiosco.subscription.id,
          status: branch.kiosco.subscription.status,
          managementUrl: branch.kiosco.subscription.managementUrl,
          updatedAt: branch.kiosco.subscription.updatedAt,
        }
      : null,
    hasActiveSubscription: branch.kiosco.subscription?.status === "ACTIVE",
    hasActiveGrant: Boolean(activeGrant),
    pricing: {
      amountArs: pricing.amountArs,
      source: pricing.source,
      freezeEndsAt: pricing.freezeEndsAt?.toISOString() ?? null,
    },
    welcomeOffer: {
      canShow:
        session.user.role !== "EMPLOYEE" &&
        branch.kiosco.subscription?.status !== "ACTIVE" &&
        !branch.kiosco.subscriptionWelcomeOfferShownAt &&
        Boolean(branch.kiosco.subscriptionOfferPriceArs) &&
        Boolean(branch.kiosco.subscriptionOfferFreezeEndsAt),
      shownAt: branch.kiosco.subscriptionWelcomeOfferShownAt?.toISOString() ?? null,
      priceArs: branch.kiosco.subscriptionOfferPriceArs,
      freezeEndsAt: branch.kiosco.subscriptionOfferFreezeEndsAt?.toISOString() ?? null,
    },
  });
}
