export const TRANSFER_STRATEGIES = ["nearest_first", "farthest_first"] as const;

export type StockTransferStrategy = (typeof TRANSFER_STRATEGIES)[number];

export type TransferPlanLotInput = {
  id?: string | null;
  quantity: number;
  expiresOn: string | Date;
};

export type PlannedLotTransfer = {
  id: string | null;
  quantity: number;
  expiresOn: string;
};

export type StockTransferPlan = {
  strategy: StockTransferStrategy;
  requestedQuantity: number;
  transferableQuantity: number;
  fulfilledQuantity: number;
  expiredQuantity: number;
  activeTrackedQuantity: number;
  untrackedQuantity: number;
  lotsToTransfer: PlannedLotTransfer[];
  expiredLots: PlannedLotTransfer[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function normalizeDateKey(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function isStockTransferStrategy(value: unknown): value is StockTransferStrategy {
  return typeof value === "string" && TRANSFER_STRATEGIES.includes(value as StockTransferStrategy);
}

export function planStockTransfer(input: {
  totalStock: number | null | undefined;
  requestedQuantity: number;
  lots: TransferPlanLotInput[];
  strategy: StockTransferStrategy;
  now?: Date;
}): StockTransferPlan {
  const totalStock = typeof input.totalStock === "number" ? input.totalStock : 0;
  const todayKey = localDateKey(input.now ?? new Date());
  const normalizedLots = input.lots
    .filter((lot) => isPositiveInteger(lot.quantity))
    .map((lot) => {
      const expiresOn = normalizeDateKey(lot.expiresOn);
      return expiresOn
        ? {
            id: typeof lot.id === "string" ? lot.id : null,
            quantity: lot.quantity,
            expiresOn,
          }
        : null;
    })
    .filter((lot): lot is PlannedLotTransfer => Boolean(lot));

  const expiredLots = normalizedLots.filter((lot) => lot.expiresOn < todayKey);
  const activeLots = normalizedLots.filter((lot) => lot.expiresOn >= todayKey);
  activeLots.sort((left, right) =>
    input.strategy === "nearest_first"
      ? left.expiresOn.localeCompare(right.expiresOn)
      : right.expiresOn.localeCompare(left.expiresOn),
  );

  const expiredQuantity = expiredLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const activeTrackedQuantity = activeLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const transferableQuantity = Math.max(totalStock - expiredQuantity, 0);
  let remaining = Math.max(Math.min(input.requestedQuantity, transferableQuantity), 0);
  const lotsToTransfer: PlannedLotTransfer[] = [];

  for (const lot of activeLots) {
    if (remaining <= 0) {
      break;
    }

    const movedQuantity = Math.min(remaining, lot.quantity);
    lotsToTransfer.push({
      id: lot.id,
      quantity: movedQuantity,
      expiresOn: lot.expiresOn,
    });
    remaining -= movedQuantity;
  }

  const untrackedAvailable = Math.max(transferableQuantity - activeTrackedQuantity, 0);
  const untrackedQuantity = Math.min(remaining, untrackedAvailable);
  remaining -= untrackedQuantity;

  return {
    strategy: input.strategy,
    requestedQuantity: input.requestedQuantity,
    transferableQuantity,
    fulfilledQuantity: Math.min(input.requestedQuantity, transferableQuantity),
    expiredQuantity,
    activeTrackedQuantity,
    untrackedQuantity,
    lotsToTransfer,
    expiredLots,
  };
}
