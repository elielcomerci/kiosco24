import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { CommissionStatus, PayoutStatus } from "@prisma/client";
import { cache } from "react";

// ============================================================================
// CORE DATA TRANSFER OBJECTS (DTOs)
// ============================================================================

export type LedgerEntry = 
  | { id: string; type: "COMMISSION"; sourceId: string; status: CommissionStatus; amount: number; createdAt: Date; description: string }
  | { id: string; type: "PAYOUT"; sourceId: string; status: PayoutStatus; amount: number; createdAt: Date; description: string };

export type RevenueState = "GENERANDO" | "ACTIVO_SIN_CONSUMO" | "INACTIVO";

export interface CarterClientDTO {
  referralId: string;
  kioscoName: string | null;
  state: RevenueState;
  mrrGenerated: number;
  activatedAt: Date;
  lastActiveDaysAgo: number;
}

// ============================================================================
// 1. IDENTITY LAYER
// ============================================================================

export const getPartnerSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const profile = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, isApproved: true, referralCode: true }
  });

  if (!profile || !profile.isApproved) throw new Error("Partner not approved");
  return profile;
});

// ============================================================================
// 2. RAW REPOSITORIES (Prisma only, no logic)
// ============================================================================

async function getCommissionsRaw(partnerId: string) {
  return prisma.commission.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    include: {
      referral: {
        include: { referredKiosco: { select: { name: true } } }
      }
    }
  });
}

async function getPayoutsRaw(partnerId: string) {
  return prisma.payoutRequest.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" }
  });
}

async function getReferralsRaw(partnerId: string) {
  return prisma.referral.findMany({
    where: { partnerId },
    include: {
      referredKiosco: { select: { name: true } },
      recurring: true
    },
    orderBy: { createdAt: "desc" }
  });
}

// ============================================================================
// 3. SINGLE BALANCE ENGINE
// ============================================================================

export async function computePartnerBalance(partnerId: string) {
  const [commissions, payouts] = await Promise.all([
    getCommissionsRaw(partnerId),
    getPayoutsRaw(partnerId)
  ]);

  let totalEarnings = 0;
  let payoutsPaid = 0;
  let payoutsReserved = 0;

  for (const c of commissions) {
    if (c.status === "APPROVED" || c.status === "PAID") {
      totalEarnings += c.amount;
    }
  }

  for (const p of payouts) {
    if (p.status === "PAID") {
      payoutsPaid += p.amount;
    } else if (p.status === "PENDING" || p.status === "APPROVED") {
      payoutsReserved += p.amount;
    }
  }

  const availableBalance = Math.max(0, totalEarnings - payoutsPaid - payoutsReserved);

  return {
    availableBalance,
    totalEarnings,
    payoutsPaid,
    payoutsReserved,
    commissions,
    payouts
  };
}

// ============================================================================
// 4. SERVICE COMPOSITION LAYER
// ============================================================================

export async function buildLedger(partnerId: string) {
  const balanceEngine = await computePartnerBalance(partnerId);
  const ledger: LedgerEntry[] = [];

  for (const c of balanceEngine.commissions) {
    ledger.push({
      id: `entry_comm_${c.id}`,
      sourceId: c.id,
      type: "COMMISSION",
      status: c.status,
      amount: c.amount,
      createdAt: c.createdAt,
      description: c.referral?.referredKiosco?.name 
        ? `Comisión por ${c.referral.referredKiosco.name}` 
        : "Comisión de red"
    });
  }

  for (const p of balanceEngine.payouts) {
    ledger.push({
      id: `entry_payout_${p.id}`,
      sourceId: p.id,
      type: "PAYOUT",
      status: p.status,
      // Payouts represent a negative cash flow from the available balance in UI
      amount: -p.amount,
      createdAt: p.createdAt,
      description: "Retiro de fondos"
    });
  }

  // Pure server side interleave & sort
  ledger.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    ledger,
    availableBalance: balanceEngine.availableBalance,
    totalEarnings: balanceEngine.totalEarnings,
    payoutsPaid: balanceEngine.payoutsPaid,
    payoutsReserved: balanceEngine.payoutsReserved
  };
}

export async function getPartnerReferrals(partnerId: string): Promise<CarterClientDTO[]> {
  const rawRefs = await getReferralsRaw(partnerId);
  const now = new Date();
  
  // 3-factor state definition: Recency (30d), Frequency (not perfectly trackable right now, assuming any update as activity), Revenue
  return rawRefs.map(ref => {
    let state: RevenueState = "INACTIVO";
    const updatedAt = ref.recurring?.updatedAt || ref.createdAt;
    const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // threshold
    const isActiveRecently = diffDays <= 30;
    const hasRevenue = (ref.recurring?.planPrice || 0) > 0;

    if (hasRevenue && isActiveRecently) {
      state = "GENERANDO";
    } else if (!hasRevenue && isActiveRecently) {
      state = "ACTIVO_SIN_CONSUMO";
    }

    return {
      referralId: ref.id,
      kioscoName: ref.referredKiosco.name,
      state,
      mrrGenerated: ref.recurring ? ref.recurring.planPrice : 0,
      activatedAt: ref.createdAt,
      lastActiveDaysAgo: diffDays
    };
  });
}

// Highly intensive query, cached per request lifecycle via React cache
export const getPartnerLinkPerformance = cache(async (partnerId: string) => {
  const [totalReferrals, activeRecurringAgg] = await Promise.all([
    prisma.referral.count({ where: { partnerId } }),
    prisma.recurringCommission.aggregate({
      _sum: { planPrice: true },
      where: { partnerId, active: true, clientActive: true }
    })
  ]);

  return {
    totalReferrals,
    injectedMRR: activeRecurringAgg._sum.planPrice || 0
  };
});
