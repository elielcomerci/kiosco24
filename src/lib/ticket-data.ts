import type { Prisma } from "@/lib/prisma";
import { getPaymentMethodLabel, type TicketPreviewData } from "@/lib/ticket-format";
import { buildTicketMetaSnapshot, formatTicketNumberValue, parseTicketMetaSnapshot, type TicketSettingsShape } from "@/lib/ticketing";

type SaleItemLike = {
  name: string;
  quantity: number;
  price: number;
};

type SaleForTicketLike = {
  id: string;
  ticketNumber: number | null;
  ticketIssuedAt: Date | null;
  ticketMetaSnapshot: Prisma.JsonValue | null;
  total: number;
  paymentMethod: string;
  receivedAmount: number | null;
  voided: boolean;
  createdAt: Date;
  items: SaleItemLike[];
  createdByEmployee?: { name: string } | null;
  creditCustomer?: { name: string } | null;
};

export function buildTicketPreviewData(
  sale: SaleForTicketLike,
  fallback?: {
    branch: {
      name: string;
      address: string | null;
      phone: string | null;
      logoUrl: string | null;
    };
    settings: TicketSettingsShape;
  },
): TicketPreviewData {
  const snapshot =
    sale.ticketMetaSnapshot
      ? parseTicketMetaSnapshot(sale.ticketMetaSnapshot)
      : fallback
        ? buildTicketMetaSnapshot(fallback.branch, fallback.settings)
        : parseTicketMetaSnapshot(null);

  const subtotal = sale.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const change =
    sale.paymentMethod === "CASH" && sale.receivedAmount !== null
      ? Math.max(0, sale.receivedAmount - sale.total)
      : null;

  return {
    saleId: sale.id,
    ticketNumber: formatTicketNumberValue(sale.ticketNumber),
    issuedAt: (sale.ticketIssuedAt ?? sale.createdAt).toISOString(),
    printMode: snapshot.printMode,
    branchName: snapshot.branchName,
    branchAddress: snapshot.branchAddress,
    branchPhone: snapshot.branchPhone,
    branchLogoUrl: snapshot.branchLogoUrl,
    footerText: snapshot.footerText,
    orderLink: snapshot.orderLink,
    items: sale.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      subtotal: item.price * item.quantity,
    })),
    subtotal,
    discount: null,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    paymentMethodLabel: getPaymentMethodLabel(sale.paymentMethod, sale.creditCustomer?.name ?? null),
    cashReceived: sale.receivedAmount,
    change,
    employeeName: sale.createdByEmployee?.name ?? null,
    customerName: sale.creditCustomer?.name ?? null,
    showLogo: snapshot.showLogo,
    showAddress: snapshot.showAddress,
    showPhone: snapshot.showPhone,
    showFooterText: snapshot.showFooterText,
    voided: sale.voided,
  };
}
