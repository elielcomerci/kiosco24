import type { Prisma } from "@/lib/prisma";

export const DEFAULT_TICKET_FOOTER_TEXT = "Gracias por su compra!";
export const TICKET_PRINT_MODES = ["STANDARD", "THERMAL_58", "THERMAL_80"] as const;

export type TicketPrintMode = (typeof TICKET_PRINT_MODES)[number];

export type TicketSettingsShape = {
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showFooterText: boolean;
  footerText: string | null;
  orderLink: string | null;
  printMode: TicketPrintMode;
};

export type TicketMetaSnapshot = {
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  branchLogoUrl: string | null;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showFooterText: boolean;
  footerText: string | null;
  orderLink: string | null;
  printMode: TicketPrintMode;
};

export function getDefaultTicketSettings(): TicketSettingsShape {
  return {
    showLogo: true,
    showAddress: false,
    showPhone: false,
    showFooterText: true,
    footerText: DEFAULT_TICKET_FOOTER_TEXT,
    orderLink: null,
    printMode: "STANDARD",
  };
}

export function isTicketPrintMode(value: unknown): value is TicketPrintMode {
  return typeof value === "string" && TICKET_PRINT_MODES.includes(value as TicketPrintMode);
}

export function getTicketPrintModeLabel(mode: TicketPrintMode) {
  if (mode === "THERMAL_58") return "Termica 58 mm";
  if (mode === "THERMAL_80") return "Termica 80 mm";
  return "Normal";
}

export async function ensureTicketSettings(
  tx: Prisma.TransactionClient,
  branchId: string,
) {
  const defaults = getDefaultTicketSettings();

  return tx.ticketSettings.upsert({
    where: { branchId },
    update: {},
    create: {
      branchId,
      ...defaults,
    },
    select: {
      showLogo: true,
      showAddress: true,
      showPhone: true,
      showFooterText: true,
      footerText: true,
      orderLink: true,
      printMode: true,
    },
  });
}

export function buildTicketMetaSnapshot(
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
  },
  settings: TicketSettingsShape,
): TicketMetaSnapshot {
  return {
    branchName: branch.name,
    branchAddress: branch.address,
    branchPhone: branch.phone,
    branchLogoUrl: branch.logoUrl,
    showLogo: settings.showLogo,
    showAddress: settings.showAddress,
    showPhone: settings.showPhone,
    showFooterText: settings.showFooterText,
    footerText: settings.footerText || DEFAULT_TICKET_FOOTER_TEXT,
    orderLink: settings.orderLink,
    printMode: settings.printMode,
  };
}

export function parseTicketMetaSnapshot(value: Prisma.JsonValue | null | undefined): TicketMetaSnapshot {
  const defaults = getDefaultTicketSettings();
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    branchName: typeof source.branchName === "string" ? source.branchName : null,
    branchAddress: typeof source.branchAddress === "string" ? source.branchAddress : null,
    branchPhone: typeof source.branchPhone === "string" ? source.branchPhone : null,
    branchLogoUrl: typeof source.branchLogoUrl === "string" ? source.branchLogoUrl : null,
    showLogo: typeof source.showLogo === "boolean" ? source.showLogo : defaults.showLogo,
    showAddress: typeof source.showAddress === "boolean" ? source.showAddress : defaults.showAddress,
    showPhone: typeof source.showPhone === "boolean" ? source.showPhone : defaults.showPhone,
    showFooterText:
      typeof source.showFooterText === "boolean" ? source.showFooterText : defaults.showFooterText,
    footerText: typeof source.footerText === "string" ? source.footerText : defaults.footerText,
    orderLink: typeof source.orderLink === "string" ? source.orderLink : defaults.orderLink,
    printMode: isTicketPrintMode(source.printMode) ? source.printMode : defaults.printMode,
  };
}

export function formatTicketNumberValue(ticketNumber: number | null | undefined) {
  if (!Number.isInteger(ticketNumber) || !ticketNumber || ticketNumber < 0) {
    return null;
  }

  return String(ticketNumber).padStart(6, "0");
}
