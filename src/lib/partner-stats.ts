import { prisma } from "@/lib/prisma";

export interface PartnerStatsResult {
  partnerId: string;
  tierLevel: "BRONZE" | "SILVER" | "GOLD";
  tierPct: number;
  previousTier: number;
  nextTierPct: number | null;
  salesToNextTier: number | null;
  currentMonthSales: number;
  
  oldMRR: number;     
  newMRR: number;     
  totalMRR: number;
  
  projectedIncome: number;
  incomeIfNoTierBonus: number; 
  nextMonthZeroSalesIncome: number; 
  
  totalProjectedGain: number | null;
  passiveUpgradeGain: number | null;
  projectedNextIncome: number | null;
  lastSaleImpact: number;

  availableBalance: number;
  reservedBalance: number;
  totalEarnedForever: number;
  
  payoutHistory: {
    id: string;
    amount: number;
    status: string;
    createdAt: Date;
  }[];
}

export async function calculatePartnerStats(partnerId: string): Promise<PartnerStatsResult> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. Performance-Optimized Aggregations (1 Roundtrip)
  const baseFilter = {
    partnerId,
    active: true,
    clientActive: true,
    referral: { is: { status: "ACTIVE" as const } }
  };

  const [
    oldQuery, 
    newQuery, 
    approvedCommissions, 
    payouts,
    lastSaleQuery
  ] = await Promise.all([
    prisma.recurringCommission.aggregate({
      _sum: { planPrice: true },
      where: { ...baseFilter, startAt: { lt: startOfMonth } }
    }),
    prisma.recurringCommission.aggregate({
      _sum: { planPrice: true },
      _count: { id: true },
      where: { ...baseFilter, startAt: { gte: startOfMonth } }
    }),
    prisma.commission.aggregate({
      _sum: { amount: true },
      where: { partnerId, status: { in: ["APPROVED", "PAID"] } }
    }),
    prisma.payoutRequest.findMany({
      where: { partnerId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
      select: { id: true, amount: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }),
    // Fetch the absolute exact last sale to calculate precise impact instead of an average
    prisma.recurringCommission.findFirst({
      where: { ...baseFilter, startAt: { gte: startOfMonth } },
      orderBy: { startAt: "desc" },
      select: { planPrice: true }
    })
  ]);

  const oldMRR = oldQuery._sum.planPrice ?? 0;
  const newMRR = newQuery._sum.planPrice ?? 0;
  const currentMonthSales = newQuery._count.id;
  const exactLastSaleBase = lastSaleQuery?.planPrice ?? 0;

  // 2. Resolve Tier Based on Gamification Rule
  const TIER_BRONZE = 30;
  const TIER_SILVER = 40;
  const TIER_GOLD = 50;

  const resolveTier = (sales: number) => {
    if (sales >= 100) return TIER_GOLD;
    if (sales >= 50) return TIER_SILVER;
    return TIER_BRONZE;
  };

  const currentTier = resolveTier(currentMonthSales);
  const tierLevel = currentTier === TIER_GOLD ? "GOLD" : currentTier === TIER_SILVER ? "SILVER" : "BRONZE";
  const previousTier = resolveTier(Math.max(0, currentMonthSales - 1));
  
  let nextTierPct: number | null = null;
  let salesToNextTier: number | null = null;

  if (currentTier === TIER_BRONZE) {
    nextTierPct = TIER_SILVER;
    salesToNextTier = 50 - currentMonthSales;
  } else if (currentTier === TIER_SILVER) {
    nextTierPct = TIER_GOLD;
    salesToNextTier = 100 - currentMonthSales;
  }

  // 3. Compute Projected Income
  // IMPORTANT:
  // - New sales ALWAYS yield 50% commission
  // - Tier only affects existing MRR (oldMRR)
  const calculateIncome = (sales: number, oldM: number, newM: number) => {
    const t = resolveTier(sales);
    return (oldM * (t / 100)) + (newM * (TIER_GOLD / 100)); // new is always 50%
  };

  const projectedIncome = calculateIncome(currentMonthSales, oldMRR, newMRR);
  
  const incomeIfNoTierBonus = (oldMRR * (TIER_BRONZE / 100)) + (newMRR * (TIER_GOLD / 100));
  const nextMonthZeroSalesIncome = (oldMRR + newMRR) * (TIER_BRONZE / 100);

  // 4. Compute Deltas & Precision Impact
  const avgTicket = currentMonthSales > 0 ? newMRR / currentMonthSales : 0;
  const projectedTicket = (exactLastSaleBase * 0.4) + (avgTicket * 0.6);
  // Fallback to average realistic ticket value ($15,000) if no data
  const fallbackTicket = 15000;
  const safeTicket = projectedTicket > 0 ? projectedTicket : avgTicket > 0 ? avgTicket : fallbackTicket;

  let totalProjectedGain: number | null = null;
  let passiveUpgradeGain: number | null = null;
  let projectedNextIncome: number | null = null;

  if (nextTierPct) {
    const estimatedFutureNewMRR = newMRR + ((salesToNextTier ?? 0) * safeTicket);
    const futureSalesImpact = (estimatedFutureNewMRR - newMRR) * 0.5;
    const tierUpgradeImpact = (oldMRR * (nextTierPct / 100)) - (oldMRR * (currentTier / 100));

    const incomeNext = (oldMRR * (nextTierPct / 100)) + (estimatedFutureNewMRR * 0.5);
    
    projectedNextIncome = incomeNext;
    totalProjectedGain = Math.max(0, futureSalesImpact + tierUpgradeImpact);
    passiveUpgradeGain = Math.max(0, tierUpgradeImpact);
  }

  const oldTierValue = oldMRR * (previousTier / 100);
  const newTierValue = oldMRR * (currentTier / 100);
  const jumpBonus = currentTier > previousTier ? (newTierValue - oldTierValue) : 0;
  
  const lastSaleBaseImpact = exactLastSaleBase * 0.5;
  const lastSaleImpact = currentMonthSales > 0 ? lastSaleBaseImpact + jumpBonus : 0;

  // 5. Compute Wallet Balance (Commissions vs Payouts)
  const totalEarnedForever = approvedCommissions._sum.amount ?? 0;
  
  let paidOut = 0;
  let reservedBalance = 0;
  
  for (const p of payouts) {
    if (p.status === "PAID") {
      paidOut += p.amount;
    } else if (p.status === "PENDING" || p.status === "APPROVED") {
      reservedBalance += p.amount;
    }
  }

  const availableBalance = Math.max(0, totalEarnedForever - paidOut - reservedBalance);

  return {
    partnerId,
    tierLevel,
    tierPct: currentTier,
    previousTier,
    nextTierPct,
    salesToNextTier,
    currentMonthSales,
    oldMRR,
    newMRR,
    totalMRR: oldMRR + newMRR,
    projectedIncome,
    incomeIfNoTierBonus,
    nextMonthZeroSalesIncome,
    totalProjectedGain,
    passiveUpgradeGain,
    projectedNextIncome,
    lastSaleImpact,
    availableBalance,
    reservedBalance,
    totalEarnedForever,
    payoutHistory: payouts
  };
}
