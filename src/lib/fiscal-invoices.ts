import type { Prisma } from "@/lib/prisma";

export function getDefaultBranchFiscalSettings() {
  return {
    activo: false,
    puntoDeVenta: null as number | null,
    minimumInvoiceAmount: 0,
  };
}

export async function ensureBranchFiscalSettings(
  tx: Prisma.TransactionClient,
  branchId: string,
) {
  const defaults = getDefaultBranchFiscalSettings();

  return tx.branchFiscalSettings.upsert({
    where: { branchId },
    update: {},
    create: {
      branchId,
      ...defaults,
    },
  });
}

export function sanitizeReceiverName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}
