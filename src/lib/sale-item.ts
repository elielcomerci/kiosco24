const GRAMS_PER_KILO = 1000;
const KILO_FORMATTER = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

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
  return KILO_FORMATTER.format(quantityGrams / GRAMS_PER_KILO);
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

export function parseWeightInputToGrams(value: string, assumeWholeNumbersAreKilos = false) {
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

  const unit = gramsMatch[2] ?? (assumeWholeNumbersAreKilos ? "kg" : "g");
  if (unit === "g" || unit === "gr") {
    return Math.round(numeric);
  }

  if (unit === "kg") {
    return Math.round(numeric * GRAMS_PER_KILO);
  }

  if (normalized.includes(".")) {
    return Math.round(numeric * GRAMS_PER_KILO);
  }

  return Math.round(numeric);
}
