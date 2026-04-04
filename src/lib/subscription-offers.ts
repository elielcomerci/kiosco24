import { SUBSCRIPTION_PRICE_ARS } from "@/lib/subscription-plan";

export const NEW_ACCOUNT_SUBSCRIPTION_FREEZE_MONTHS = 24;

export type SubscriptionPricingSource =
  | "DEFAULT"
  | "EMAIL_OVERRIDE"
  | "ACCOUNT_OFFER";

export type ResolvedSubscriptionPricing = {
  amountArs: number;
  source: SubscriptionPricingSource;
  freezeEndsAt: Date | null;
};

function roundPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function parseValidDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function buildNewAccountSubscriptionOffer(now = new Date()) {
  return {
    priceArs: SUBSCRIPTION_PRICE_ARS,
    freezeEndsAt: addMonths(now, NEW_ACCOUNT_SUBSCRIPTION_FREEZE_MONTHS),
  };
}

export function isAccountSubscriptionOfferActive(args: {
  offerPriceArs: unknown;
  freezeEndsAt: Date | string | null | undefined;
  at?: Date;
}) {
  const amountArs = roundPositiveInteger(args.offerPriceArs);
  const freezeEndsAt = parseValidDate(args.freezeEndsAt);
  const at = args.at ?? new Date();

  if (!amountArs || !freezeEndsAt) {
    return false;
  }

  return freezeEndsAt.getTime() > at.getTime();
}

export function resolveSubscriptionPricing(args: {
  emailOverrideAmount?: number | null;
  offerPriceArs?: unknown;
  offerFreezeEndsAt?: Date | string | null | undefined;
  defaultPriceArs?: number;
  at?: Date;
}): ResolvedSubscriptionPricing {
  const defaultPriceArs = roundPositiveInteger(args.defaultPriceArs) ?? SUBSCRIPTION_PRICE_ARS;
  const emailOverrideAmount = roundPositiveInteger(args.emailOverrideAmount);
  if (emailOverrideAmount) {
    return {
      amountArs: emailOverrideAmount,
      source: "EMAIL_OVERRIDE",
      freezeEndsAt: null,
    };
  }

  const offerPriceArs = roundPositiveInteger(args.offerPriceArs);
  const offerFreezeEndsAt = parseValidDate(args.offerFreezeEndsAt);
  if (
    offerPriceArs &&
    offerFreezeEndsAt &&
    isAccountSubscriptionOfferActive({
      offerPriceArs,
      freezeEndsAt: offerFreezeEndsAt,
      at: args.at,
    })
  ) {
    return {
      amountArs: offerPriceArs,
      source: "ACCOUNT_OFFER",
      freezeEndsAt: offerFreezeEndsAt,
    };
  }

  return {
    amountArs: defaultPriceArs,
    source: "DEFAULT",
    freezeEndsAt: null,
  };
}
