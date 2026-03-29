"use client";

import { useEffect, useMemo, useState } from "react";

import InvoicePreview from "@/components/fiscal/InvoicePreview";
import ModalPortal from "@/components/ui/ModalPortal";
import {
  AFIP_DOCUMENT_TYPES,
  AFIP_RECEIVER_IVA_CONDITIONS,
  getReceiverIvaConditionOption,
  validateReceiverDocument,
} from "@/lib/fiscal";
import { generateWhatsAppInvoiceText, type InvoicePreviewData } from "@/lib/invoice-format";

type InvoiceRequestDraft = {
  docType: number;
  docNro: string;
  receiverName: string;
  receiverIvaConditionId: number | null;
};

const defaultDraft: InvoiceRequestDraft = {
  docType: AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
  docNro: "0",
  receiverName: "",
  receiverIvaConditionId: getReceiverIvaConditionOption("CONSUMIDOR_FINAL").id,
};

export default function InvoiceModal({
  branchId,
  saleId,
  mode = "emit",
  initialDraft,
  onClose,
  onSaveDraft,
  onResolved,
  allowPendingRelease = false,
}: {
  branchId: string;
  saleId?: string | null;
  mode?: "emit" | "view";
  initialDraft?: Partial<InvoiceRequestDraft> | null;
  onClose: () => void;
  onSaveDraft?: (draft: InvoiceRequestDraft) => void;
  onResolved?: (invoice: InvoicePreviewData) => void;
  allowPendingRelease?: boolean;
}) {
  const [draft, setDraft] = useState<InvoiceRequestDraft>({
    ...defaultDraft,
    ...initialDraft,
    receiverIvaConditionId:
      initialDraft?.receiverIvaConditionId ??
      defaultDraft.receiverIvaConditionId,
  });
  const [invoice, setInvoice] = useState<InvoicePreviewData | null>(null);
  const [loading, setLoading] = useState(mode === "view");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "view" || !saleId) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/fiscal/invoice/${saleId}`, {
          headers: {
            "x-branch-id": branchId,
          },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo cargar la factura.");
        }
        if (active) {
          setInvoice(data);
          setDraft({
            docType: data.receiverDocumentType,
            docNro: data.receiverDocumentNumber,
            receiverName: data.receiverName || "",
            receiverIvaConditionId: data.receiverIvaConditionId,
          });
          onResolved?.(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "No se pudo cargar la factura.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [branchId, mode, saleId]);

  const whatsappUrl = useMemo(() => {
    if (!invoice || invoice.status !== "ISSUED") return null;
    return `https://wa.me/?text=${encodeURIComponent(generateWhatsAppInvoiceText(invoice))}`;
  }, [invoice]);

  const canDownloadPdf = Boolean(invoice?.pdfBlobUrl || invoice?.pdfAfipUrl);

  const releasePendingInvoice = async () => {
    if (!saleId) {
      setError("No encontramos la venta para liberar esta emision.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/fiscal/invoice/${saleId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ action: "release-pending" }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo liberar la emision pendiente.");
      }

      setInvoice(data);
      onResolved?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo liberar la emision pendiente.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEmission = async () => {
    if (!saleId) {
      setError("Todavia no hay una venta para facturar.");
      return;
    }

    const validation = validateReceiverDocument(draft.docType, draft.docNro);
    if (!validation.valid) {
      setError(validation.error || "Documento invalido.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/fiscal/invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          saleId,
          docType: draft.docType,
          docNro: validation.normalized,
          receiverName: draft.receiverName.trim() || null,
          receiverIvaConditionId: draft.receiverIvaConditionId,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok && res.status !== 202) {
        throw new Error(data?.error || "No se pudo emitir la factura.");
      }

      if (data?.invoice) {
        setInvoice(data.invoice);
        onResolved?.(data.invoice);
      }

      if (data?.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir la factura.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    const validation = validateReceiverDocument(draft.docType, draft.docNro);
    if (!validation.valid) {
      setError(validation.error || "Documento invalido.");
      return;
    }

    onSaveDraft?.({
      ...draft,
      docNro: validation.normalized,
    });
    onClose();
  };

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 10000 }}>
        <div
          className="modal animate-slide-up"
          onClick={(event) => event.stopPropagation()}
          style={{ width: "min(96vw, 560px)", maxHeight: "92dvh", overflowY: "auto", padding: 0 }}
        >
          <div className="no-print" style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>Factura electronica</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
              {mode === "view" ? "Revisa o comparte la factura emitida." : "Captura los datos del receptor y emite Factura C."}
            </div>
          </div>

          <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "var(--text-3)", padding: "24px 0" }}>Cargando factura...</div>
            ) : invoice ? (
              <InvoicePreview invoice={invoice} />
            ) : (
              <>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className={`btn btn-sm ${draft.docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? "btn-green" : "btn-ghost"}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        docType: AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL,
                        docNro: "0",
                        receiverName: "",
                        receiverIvaConditionId: AFIP_RECEIVER_IVA_CONDITIONS.CONSUMIDOR_FINAL.id,
                      }))
                    }
                  >
                    Consumidor final
                  </button>
                  <button
                    className={`btn btn-sm ${draft.docType === AFIP_DOCUMENT_TYPES.DNI ? "btn-green" : "btn-ghost"}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        docType: AFIP_DOCUMENT_TYPES.DNI,
                        docNro: "",
                        receiverIvaConditionId: AFIP_RECEIVER_IVA_CONDITIONS.CONSUMIDOR_FINAL.id,
                      }))
                    }
                  >
                    DNI
                  </button>
                  <button
                    className={`btn btn-sm ${draft.docType === AFIP_DOCUMENT_TYPES.CUIT ? "btn-green" : "btn-ghost"}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        docType: AFIP_DOCUMENT_TYPES.CUIT,
                        docNro: "",
                        receiverIvaConditionId:
                          prev.receiverIvaConditionId && prev.receiverIvaConditionId !== AFIP_RECEIVER_IVA_CONDITIONS.CONSUMIDOR_FINAL.id
                            ? prev.receiverIvaConditionId
                            : AFIP_RECEIVER_IVA_CONDITIONS.MONOTRIBUTO.id,
                      }))
                    }
                  >
                    CUIT
                  </button>
                </div>

                {draft.docType !== AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-3)", marginBottom: "6px" }}>
                      DOCUMENTO
                    </label>
                    <input
                      className="input"
                      value={draft.docNro}
                      onChange={(event) => setDraft((prev) => ({ ...prev, docNro: event.target.value }))}
                      placeholder={draft.docType === AFIP_DOCUMENT_TYPES.CUIT ? "CUIT sin guiones" : "DNI"}
                    />
                  </div>
                ) : null}

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-3)", marginBottom: "6px" }}>
                    NOMBRE EN COMPROBANTE
                  </label>
                  <input
                    className="input"
                    value={draft.receiverName}
                    onChange={(event) => setDraft((prev) => ({ ...prev, receiverName: event.target.value }))}
                    placeholder={draft.docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? "Consumidor Final" : "Opcional"}
                  />
                </div>

                {draft.docType === AFIP_DOCUMENT_TYPES.CUIT ? (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-3)", marginBottom: "6px" }}>
                      CONDICION IVA DEL RECEPTOR
                    </label>
                    <select
                      className="input"
                      value={draft.receiverIvaConditionId ?? AFIP_RECEIVER_IVA_CONDITIONS.MONOTRIBUTO.id}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, receiverIvaConditionId: Number(event.target.value) }))
                      }
                    >
                      <option value={AFIP_RECEIVER_IVA_CONDITIONS.MONOTRIBUTO.id}>Monotributista</option>
                      <option value={AFIP_RECEIVER_IVA_CONDITIONS.RESPONSABLE_INSCRIPTO.id}>Responsable Inscripto</option>
                      <option value={AFIP_RECEIVER_IVA_CONDITIONS.EXENTO.id}>IVA Exento</option>
                    </select>
                  </div>
                ) : null}
              </>
            )}

            {error ? (
              <div style={{ color: "var(--red)", fontSize: "13px", lineHeight: 1.5 }}>{error}</div>
            ) : null}
          </div>

          <div
            className="no-print"
            style={{
              display: "grid",
              gridTemplateColumns: invoice ? "repeat(3, 1fr)" : onSaveDraft ? "repeat(3, 1fr)" : "1fr 1fr",
              gap: "10px",
              padding: "0 18px 18px",
            }}
          >
            {invoice ? (
              <>
                {invoice.status === "ISSUED" ? (
                  <>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        if (whatsappUrl) {
                          window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      disabled={!whatsappUrl}
                    >
                      WhatsApp
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        const pdfUrl = invoice.pdfBlobUrl || invoice.pdfAfipUrl;
                        if (pdfUrl) {
                          window.open(pdfUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      disabled={!canDownloadPdf}
                    >
                      PDF
                    </button>
                    <button className="btn btn-primary" onClick={onClose}>
                      Cerrar
                    </button>
                  </>
                ) : invoice.status === "FAILED" ? (
                  <>
                    <button className="btn btn-ghost" onClick={onClose}>
                      Cerrar
                    </button>
                    <button className="btn btn-green" onClick={submitEmission} disabled={submitting || !saleId}>
                      {submitting ? "Reintentando..." : "Reintentar"}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost" onClick={onClose}>
                      Cerrar
                    </button>
                    {allowPendingRelease ? (
                      <button className="btn btn-green" onClick={releasePendingInvoice} disabled={submitting || !saleId}>
                        {submitting ? "Liberando..." : "Liberar reintento"}
                      </button>
                    ) : (
                      <button className="btn btn-ghost" disabled>
                        Pendiente
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {onSaveDraft ? (
                  <button className="btn btn-ghost" onClick={handleSaveDraft} disabled={submitting}>
                    Guardar para despues
                  </button>
                ) : null}
                <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                  Cancelar
                </button>
                <button className="btn btn-green" onClick={submitEmission} disabled={submitting || !saleId}>
                  {submitting ? "Emitiendo..." : "Emitir factura"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
