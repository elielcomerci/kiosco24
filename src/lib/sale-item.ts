const GRAMS_PER_KILO = 1000;

export type SaleItemLike = {
  quantity: number;
  price: number;
  soldByWeight?: boolean | null;
};

type SaleQuantityLike = {
  quantity: number;
  soldByWeight?: boolean | null;
};

type WeightLabelLike = {
  quantity: number;
};

function formatQuantityKg(quantityGrams: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(quantityGrams / GRAMS_PER_KILO);
}

export function isWeightedSaleItem(item: SaleQuantityLike) {
  return Boolean(item.soldByWeight);
}

export function getSaleItemDisplayQuantity(item: SaleQuantityLike) {
  return isWeightedSaleItem(item) ? item.quantity / GRAMS_PER_KILO : item.quantity;
}

export function getSaleItemSubtotal(item: SaleItemLike) {
  return Math.round((item.price * getSaleItemDisplayQuantity(item)) * 100) / 100;
}

export function getSaleItemCostSubtotal(item: SaleQuantityLike & { cost: number }) {
  return Math.round((item.cost * getSaleItemDisplayQuantity(item)) * 100) / 100;
}

export function formatSaleItemWeightLabel(item: WeightLabelLike) {
  return `${formatQuantityKg(item.quantity)} kg`;
}

export function parseWeightInputToGrams(value: string) {
  const normalized = value.trim().toLowerCase().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const fractionMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    const kilos = numerator / denominator;
    if (kilos <= 0) {
      return null;
    }

    return Math.round(kilos * GRAMS_PER_KILO);
  }

  const gramsMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(g|gr|kg)?$/);
  if (!gramsMatch) {
    return null;
  }

  const numeric = Number(gramsMatch[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const unit = gramsMatch[2] ?? "kg";
  if (unit === "g" || unit === "gr") {
    return Math.round(numeric);
  }

  if (!gramsMatch[2]) {
    if (normalized.includes(".")) {
      return Math.round(numeric * GRAMS_PER_KILO);
    }

    return Math.round(numeric);
  }

  return Math.round(numeric * GRAMS_PER_KILO);
}
