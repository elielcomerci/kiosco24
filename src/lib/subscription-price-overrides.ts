import { prisma } from "@/lib/prisma";

export function normalizeSubscriptionPriceOverrideEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parseSubscriptionPriceOverrideAmount(
  value: FormDataEntryValue | string | number | null | undefined,
) {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number(value ?? "");

  if (!Number.isFinite(normalized)) {
    return null;
  }

  const rounded = Math.round(normalized);
  return rounded > 0 ? rounded : null;
}

export async function getSubscriptionPriceOverrideForEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  return prisma.subscriptionPriceOverride.findUnique({
    where: {
      email: normalizeSubscriptionPriceOverrideEmail(email),
    },
    select: {
      id: true,
      email: true,
      amount: true,
      remainingCycles: true,
      note: true,
      updatedAt: true,
      createdByEmail: true,
    },
  });
}
