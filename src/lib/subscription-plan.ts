const DEFAULT_SUBSCRIPTION_PRICE_ARS = 14900;

function resolveSubscriptionPrice() {
  const envValue = Number(process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE_ARS ?? "");

  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.round(envValue);
  }

  return DEFAULT_SUBSCRIPTION_PRICE_ARS;
}

export function formatSubscriptionPrice(amount = resolveSubscriptionPrice()) {
  return `$${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function getSubscriptionPromoLabel(amount = resolveSubscriptionPrice()) {
  return `Activalo por ${formatSubscriptionPrice(amount)} por mes.`;
}

export const SUBSCRIPTION_PRICE_ARS = resolveSubscriptionPrice();
export const SUBSCRIPTION_PRICE_LABEL = formatSubscriptionPrice(SUBSCRIPTION_PRICE_ARS);
export const SUBSCRIPTION_PROMO_LABEL = getSubscriptionPromoLabel(SUBSCRIPTION_PRICE_ARS);
export const SUBSCRIPTION_CANCEL_LABEL = "Si no es para vos, podes cancelar cuando quieras.";
