export type TicketPreviewItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TicketPreviewData = {
  saleId: string;
  ticketNumber: string | null;
  issuedAt: string;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  branchLogoUrl: string | null;
  footerText: string | null;
  items: TicketPreviewItem[];
  subtotal: number;
  discount: number | null;
  total: number;
  paymentMethod: string;
  paymentMethodLabel: string;
  cashReceived: number | null;
  change: number | null;
  employeeName: string | null;
  customerName: string | null;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showFooterText: boolean;
  voided: boolean;
};

function formatArsPlain(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getPaymentMethodLabel(method: string, customerName?: string | null) {
  if (method === "CASH") return "Efectivo";
  if (method === "MERCADOPAGO") return "MercadoPago";
  if (method === "TRANSFER") return "Transferencia";
  if (method === "DEBIT") return "Débito";
  if (method === "CREDIT_CARD") return "Tarjeta";
  if (method === "CREDIT") return customerName ? `Fiado - ${customerName}` : "Fiado";
  return method;
}

export function formatTicketIssuedAt(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function generateWhatsAppTicketText(ticket: TicketPreviewData) {
  const lines: string[] = [];

  if (ticket.branchName) {
    lines.push(`*${ticket.branchName}*`);
  }

  const numberPart = ticket.ticketNumber ? `Ticket N° ${ticket.ticketNumber}` : "Ticket";
  lines.push(`${numberPart} | ${formatTicketIssuedAt(ticket.issuedAt)}`);
  lines.push("");

  for (const item of ticket.items) {
    lines.push(`${item.name} x${item.quantity} .... ${formatArsPlain(item.subtotal)}`);
  }

  lines.push("");
  lines.push(`*TOTAL: ${formatArsPlain(ticket.total)}*`);

  if (ticket.cashReceived !== null) {
    lines.push(`Efectivo: ${formatArsPlain(ticket.cashReceived)}`);
  }

  if (ticket.change !== null && ticket.change > 0) {
    lines.push(`Vuelto: ${formatArsPlain(ticket.change)}`);
  }

  if (ticket.showFooterText && ticket.footerText) {
    lines.push("");
    lines.push(ticket.footerText);
  }

  return lines.join("\n");
}
