"use client";

import { formatARS } from "@/lib/utils";
import { formatTicketIssuedAt, type TicketPreviewData } from "@/lib/ticket-format";

export default function TicketPreview({
  ticket,
  compact = false,
}: {
  ticket: TicketPreviewData;
  compact?: boolean;
}) {
  return (
    <article className={`ticket-preview ${compact ? "ticket-preview--compact" : ""}`}>
      {ticket.showLogo && ticket.branchLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ticket.branchLogoUrl} alt={ticket.branchName ?? "Logo"} className="ticket-preview__logo" />
      ) : null}

      <header className="ticket-preview__header">
        <h2 className="ticket-preview__branch">{ticket.branchName || "Kiosco24"}</h2>
        {ticket.showAddress && ticket.branchAddress ? (
          <div className="ticket-preview__meta-line">{ticket.branchAddress}</div>
        ) : null}
        {ticket.showPhone && ticket.branchPhone ? (
          <div className="ticket-preview__meta-line">{ticket.branchPhone}</div>
        ) : null}
      </header>

      <section className="ticket-preview__section">
        <div className="ticket-preview__row">
          <span>Ticket</span>
          <strong>{ticket.ticketNumber ? `N° ${ticket.ticketNumber}` : "Sin número"}</strong>
        </div>
        <div className="ticket-preview__row">
          <span>Emitido</span>
          <strong>{formatTicketIssuedAt(ticket.issuedAt)}</strong>
        </div>
        {ticket.employeeName ? (
          <div className="ticket-preview__row">
            <span>Atendió</span>
            <strong>{ticket.employeeName}</strong>
          </div>
        ) : null}
      </section>

      <section className="ticket-preview__section">
        {ticket.items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="ticket-preview__item">
            <div className="ticket-preview__item-top">
              <span>{item.name}</span>
              <span>x{item.quantity}</span>
            </div>
            <div className="ticket-preview__item-bottom">
              <span>{formatARS(item.unitPrice)} c/u</span>
              <strong>{formatARS(item.subtotal)}</strong>
            </div>
          </div>
        ))}
      </section>

      <section className="ticket-preview__section ticket-preview__totals">
        <div className="ticket-preview__row">
          <span>Subtotal</span>
          <strong>{formatARS(ticket.subtotal)}</strong>
        </div>
        <div className="ticket-preview__row ticket-preview__row--total">
          <span>Total</span>
          <strong>{formatARS(ticket.total)}</strong>
        </div>
        <div className="ticket-preview__row">
          <span>Pago</span>
          <strong>{ticket.paymentMethodLabel}</strong>
        </div>
        {ticket.cashReceived !== null ? (
          <div className="ticket-preview__row">
            <span>Recibido</span>
            <strong>{formatARS(ticket.cashReceived)}</strong>
          </div>
        ) : null}
        {ticket.change !== null && ticket.change > 0 ? (
          <div className="ticket-preview__row">
            <span>Vuelto</span>
            <strong>{formatARS(ticket.change)}</strong>
          </div>
        ) : null}
      </section>

      {ticket.showFooterText && ticket.footerText ? (
        <footer className="ticket-preview__footer">{ticket.footerText}</footer>
      ) : null}

      {ticket.voided ? <div className="ticket-preview__voided">ANULADO</div> : null}
    </article>
  );
}
