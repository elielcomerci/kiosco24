import { Prisma, prisma, type SaleLotConsumption, type StockLot } from "@/lib/prisma";

const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

type TxClient = Prisma.TransactionClient | typeof prisma;

export type TrackableStockRef = {
  branchId: string;
  productId: string;
  variantId?: string | null;
};

export type NormalizedLotInput = {
  quantity: number;
  expiresOn: Date;
};

export type ExpirySummary = {
  trackedQuantity: number;
  activeTrackedQuantity: number;
  expiredQuantity: number;
  expiringSoonQuantity: number;
  nextExpiryOn: Date | null;
  availableStock: number | null;
  hasTrackedLots: boolean;
  hasExpiredLots: boolean;
};

type MinimalLot = Pick<StockLot, "id" | "branchId" | "productId" | "variantId" | "quantity" | "expiresOn">;

function normalizeRef(ref: TrackableStockRef) {
  return {
    branchId: ref.branchId,
    productId: ref.productId,
    variantId: ref.variantId ?? null,
  };
}

export function todayDateKey(now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dateToKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function parseExpiryDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null;
  }

  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeLotInputs(input: unknown): NormalizedLotInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const grouped = new Map<string, number>();

  for (const rawLot of input) {
    const quantity =
      typeof rawLot?.quantity === "number"
        ? rawLot.quantity
        : Number.isFinite(Number(rawLot?.quantity))
          ? Number(rawLot?.quantity)
          : 0;
    const expiresOn = parseExpiryDate(rawLot?.expiresOn);

    if (!expiresOn || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    const key = dateToKey(expiresOn);
    grouped.set(key, (grouped.get(key) ?? 0) + quantity);
  }

  return Array.from(grouped.entries())
    .map(([key, quantity]) => ({
      quantity,
      expiresOn: parseExpiryDate(key)!,
    }))
    .sort((left, right) => dateToKey(left.expiresOn).localeCompare(dateToKey(right.expiresOn)));
}

export function summarizeTrackedLots(
  totalStock: number | null | undefined,
  lots: Array<Pick<StockLot, "quantity" | "expiresOn">>,
  alertDays: number,
  now = new Date(),
): ExpirySummary {
  const normalizedTotal = typeof totalStock === "number" ? totalStock : null;
  const todayKey = todayDateKey(now);
  let trackedQuantity = 0;
  let activeTrackedQuantity = 0;
  let expiredQuantity = 0;
  let expiringSoonQuantity = 0;
  let nextExpiryOn: Date | null = null;

  for (const lot of lots) {
    if (!Number.isInteger(lot.quantity) || lot.quantity <= 0) {
      continue;
    }

    const lotKey = dateToKey(lot.expiresOn);
    trackedQuantity += lot.quantity;

    if (lotKey < todayKey) {
      expiredQuantity += lot.quantity;
      continue;
    }

    activeTrackedQuantity += lot.quantity;

    if (!nextExpiryOn || lot.expiresOn < nextExpiryOn) {
      nextExpiryOn = lot.expiresOn;
    }

    if (daysUntilDate(lot.expiresOn, todayKey) <= alertDays) {
      expiringSoonQuantity += lot.quantity;
    }
  }

  return {
    trackedQuantity,
    activeTrackedQuantity,
    expiredQuantity,
    expiringSoonQuantity,
    nextExpiryOn,
    availableStock: normalizedTotal === null ? null : normalizedTotal - expiredQuantity,
    hasTrackedLots: trackedQuantity > 0,
    hasExpiredLots: expiredQuantity > 0,
  };
}

export async function getOpenStockLots(tx: TxClient, ref: TrackableStockRef) {
  const normalized = normalizeRef(ref);
  return tx.stockLot.findMany({
    where: {
      branchId: normalized.branchId,
      productId: normalized.productId,
      variantId: normalized.variantId,
      quantity: { gt: 0 },
    },
    orderBy: { expiresOn: "asc" },
  });
}

export async function hasBlockingStockLots(tx: TxClient, ref: TrackableStockRef) {
  const normalized = normalizeRef(ref);
  const lot = await tx.stockLot.findFirst({
    where: {
      branchId: normalized.branchId,
      productId: normalized.productId,
      variantId: normalized.variantId,
      quantity: { gt: 0 },
    },
    select: { id: true },
  });

  return Boolean(lot);
}

export async function replaceTrackedLots(tx: TxClient, ref: TrackableStockRef, lots: NormalizedLotInput[]) {
  const normalized = normalizeRef(ref);

  await tx.stockLot.deleteMany({
    where: {
      branchId: normalized.branchId,
      productId: normalized.productId,
      variantId: normalized.variantId,
    },
  });

  if (lots.length === 0) {
    return;
  }

  await tx.stockLot.createMany({
    data: lots.map((lot) => ({
      branchId: normalized.branchId,
      productId: normalized.productId,
      variantId: normalized.variantId,
      quantity: lot.quantity,
      expiresOn: lot.expiresOn,
    })),
  });
}

export async function addTrackedLots(tx: TxClient, ref: TrackableStockRef, lots: NormalizedLotInput[]) {
  const normalized = normalizeRef(ref);

  for (const lot of lots) {
    const existing = await tx.stockLot.findFirst({
      where: {
        branchId: normalized.branchId,
        productId: normalized.productId,
        variantId: normalized.variantId,
        expiresOn: lot.expiresOn,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.stockLot.update({
        where: { id: existing.id },
        data: { quantity: { increment: lot.quantity } },
      });
      continue;
    }

    await tx.stockLot.create({
      data: {
        branchId: normalized.branchId,
        productId: normalized.productId,
        variantId: normalized.variantId,
        quantity: lot.quantity,
        expiresOn: lot.expiresOn,
      },
    });
  }
}

export async function consumeTrackedLotsFefo(
  tx: TxClient,
  input: TrackableStockRef & { quantity: number; saleItemId: string },
) {
  const normalized = normalizeRef(input);
  const lots = await getOpenStockLots(tx, normalized);
  const todayKey = todayDateKey();
  let remaining = input.quantity;
  const emptiedLotIds: string[] = [];

  for (const lot of lots) {
    if (remaining <= 0) {
      break;
    }

    const lotKey = dateToKey(lot.expiresOn);
    if (lotKey < todayKey) {
      continue;
    }

    const consumedQuantity = Math.min(remaining, lot.quantity);
    const updated = await tx.stockLot.updateMany({
      where: {
        id: lot.id,
        quantity: { gte: consumedQuantity },
      },
      data: {
        quantity: { decrement: consumedQuantity },
      },
    });

    if (updated.count !== 1) {
      throw new Error("El stock con vencimiento cambio mientras registrabas la venta.");
    }

    await tx.saleLotConsumption.create({
      data: {
        saleItemId: input.saleItemId,
        stockLotId: lot.id,
        expiresOn: lot.expiresOn,
        quantity: consumedQuantity,
      },
    });

    if (lot.quantity - consumedQuantity <= 0) {
      emptiedLotIds.push(lot.id);
    }

    remaining -= consumedQuantity;
  }

  if (emptiedLotIds.length > 0) {
    await tx.stockLot.deleteMany({
      where: { id: { in: emptiedLotIds } },
    });
  }

  return {
    trackedConsumedQuantity: input.quantity - remaining,
    untrackedConsumedQuantity: remaining,
  };
}

export async function restoreLotConsumptions(
  tx: TxClient,
  input: TrackableStockRef & { consumptions: SaleLotConsumption[] },
) {
  const normalized = normalizeRef(input);

  for (const consumption of input.consumptions) {
    if (!Number.isInteger(consumption.quantity) || consumption.quantity <= 0) {
      continue;
    }

    let targetLot: MinimalLot | null = null;

    if (consumption.stockLotId) {
      targetLot = await tx.stockLot.findUnique({
        where: { id: consumption.stockLotId },
        select: {
          id: true,
          branchId: true,
          productId: true,
          variantId: true,
          quantity: true,
          expiresOn: true,
        },
      });
    }

    if (!targetLot) {
      targetLot = await tx.stockLot.findFirst({
        where: {
          branchId: normalized.branchId,
          productId: normalized.productId,
          variantId: normalized.variantId,
          expiresOn: consumption.expiresOn,
        },
        select: {
          id: true,
          branchId: true,
          productId: true,
          variantId: true,
          quantity: true,
          expiresOn: true,
        },
      });
    }

    if (targetLot) {
      await tx.stockLot.update({
        where: { id: targetLot.id },
        data: { quantity: { increment: consumption.quantity } },
      });
      continue;
    }

    await tx.stockLot.create({
      data: {
        branchId: normalized.branchId,
        productId: normalized.productId,
        variantId: normalized.variantId,
        quantity: consumption.quantity,
        expiresOn: consumption.expiresOn,
      },
    });
  }
}

function daysUntilDate(value: Date, todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const target = new Date(`${dateToKey(value)}T00:00:00.000Z`);
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000);
}
