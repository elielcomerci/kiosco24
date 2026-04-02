"use client";

import { formatARS } from "@/lib/utils";
import { formatDateForHuman, getInvoiceTypeLabel } from "@/lib/fiscal";
import type { InvoicePreviewData } from "@/lib/invoice-format";
import { formatSaleItemWeightLabel } from "@/lib/sale-item";

function getReceiverLegend(receiverIvaConditionLabel: string | null) {
  if (!receiverIvaConditionLabel) return null;
  return `A ${receiverIvaConditionLabel.toUpperCase()}`;
}

function getGrossIncomeLabel(value: string | null) {
  return value?.trim() ? value.trim() : "No contribuyente";
}

export default function InvoicePreview({ invoice }: { invoice: InvoicePreviewData }) {
  const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
  const caeDueDate = invoice.caeDueDate ? new Date(invoice.caeDueDate) : null;
  const receiverLegend = getReceiverLegend(invoice.receiverIvaConditionLabel);
  const previewWidth =
    invoice.printMode === "THERMAL_58" ? "min(100%, 260px)" : invoice.printMode === "THERMAL_80" ? "min(100%, 340px)" : "min(100%, 460px)";
  const previewFontSize = invoice.printMode === "THERMAL_58" ? "12px" : "13px";

  return (
    <div
      style={{
        width: previewWidth,
        margin: "0 auto",
        borderRadius: "18px",
        border: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        fontSize: previewFontSize,
      }}
    >
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-3)" }}>ORIGINAL</div>
        <div style={{ fontSize: "18px", fontWeight: 800 }}>{invoice.emitterBusinessName || "Emisor fiscal"}</div>
        {invoice.emitterCuit ? <div style={{ color: "var(--text-2)", fontSize: "13px" }}>CUIT: {invoice.emitterCuit}</div> : null}
        <div style={{ color: "var(--text-3)", fontSize: "12px" }}>Ing. Brutos: {getGrossIncomeLabel(invoice.emitterGrossIncome)}</div>
        {invoice.emitterAddress ? <div style={{ color: "var(--text-3)", fontSize: "12px" }}>Domicilio fiscal: {invoice.emitterAddress}</div> : null}
        {invoice.emitterIvaCondition ? <div style={{ color: "var(--text-3)", fontSize: "12px" }}>{invoice.emitterIvaCondition}</div> : null}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "grid", gap: "6px", fontSize: "13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "var(--text-3)" }}>Comprobante</span>
          <strong>{invoice.invoiceTypeLabel || getInvoiceTypeLabel(null)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "var(--text-3)" }}>Numero</span>
          <strong>{invoice.voucherNumberFormatted || "Pendiente"}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "var(--text-3)" }}>Fecha</span>
          <strong>{issuedAt ? formatDateForHuman(issuedAt) : "Pendiente"}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "var(--text-3)" }}>Receptor</span>
          <strong>{invoice.receiverName || "Consumidor Final"}</strong>
        </div>
        {receiverLegend ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "var(--text-3)" }}>Condicion</span>
            <strong>{receiverLegend}</strong>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "var(--text-3)" }}>Documento</span>
          <strong>{invoice.receiverDocumentNumber}</strong>
        </div>
      </div>

      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {invoice.items.map((item, index) => (
          <div key={`${item.name}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "10px", fontSize: "13px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ color: "var(--text-3)", fontSize: "12px" }}>
                {item.soldByWeight
                  ? `${formatSaleItemWeightLabel(item)} x ${formatARS(item.unitPrice)} /kg`
                  : `${item.quantity} x ${formatARS(item.unitPrice)}`}
              </div>
            </div>
            <div style={{ fontWeight: 700 }}>{formatARS(item.subtotal)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "grid", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 800 }}>
          <span>Total</span>
          <span>{formatARS(invoice.total)}</span>
        </div>

        {invoice.cae ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-3)" }}>CAE</span>
              <strong>{invoice.cae}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-3)" }}>Vto. CAE</span>
              <strong>{caeDueDate ? formatDateForHuman(caeDueDate) : "-"}</strong>
            </div>
          </>
        ) : null}

        {invoice.lastError ? (
          <div
            style={{
              marginTop: "4px",
              padding: "10px 12px",
              borderRadius: "12px",
              background:
                invoice.status === "FAILED"
                  ? "rgba(239,68,68,0.10)"
                  : invoice.status === "PENDING"
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(59,130,246,0.12)",
              color:
                invoice.status === "FAILED"
                  ? "var(--red)"
                  : invoice.status === "PENDING"
                    ? "var(--amber)"
                    : "var(--text-2)",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {invoice.lastError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
