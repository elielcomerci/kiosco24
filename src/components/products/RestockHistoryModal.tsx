"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatARS } from "@/lib/utils";

type RestockHistoryItem = {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  unitCost: number | null;
  salePrice: number | null;
};

type RestockHistoryAttachment = {
  id: string;
  url: string;
  createdAt: string;
};

type RestockHistoryEvent = {
  id: string;
  type: "RECEIVE";
  note: string | null;
  supplierName: string | null;
  valuationStatus: "PENDING" | "COMPLETED" | "NOT_APPLICABLE";
  employeeName: string | null;
  createdAt: string;
  attachments: RestockHistoryAttachment[];
  items: RestockHistoryItem[];
  linesCount: number;
  totalQuantity: number;
  missingCostLines: number;
};

type DraftState = {
  supplierName: string;
  note: string;
  valuationStatus: RestockHistoryEvent["valuationStatus"];
  items: Record<string, { unitCost: string; salePrice: string }>;
};

function moneyInput(value: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getValuedAmount(items: RestockHistoryItem[]) {
  return items.reduce((sum, item) => {
    if (item.quantity <= 0 || item.unitCost === null) {
      return sum;
    }

    return sum + item.quantity * item.unitCost;
  }, 0);
}

function getPendingUnits(items: RestockHistoryItem[]) {
  return items.reduce((sum, item) => {
    if (item.quantity <= 0 || item.unitCost !== null) {
      return sum;
    }

    return sum + item.quantity;
  }, 0);
}

function getStatusMeta(status: RestockHistoryEvent["valuationStatus"]) {
  if (status === "COMPLETED") {
    return {
      label: "Completo",
      color: "var(--green)",
      border: "1px solid rgba(34,197,94,0.35)",
      background: "rgba(34,197,94,0.08)",
    };
  }

  if (status === "NOT_APPLICABLE") {
    return {
      label: "Sin valorizar",
      color: "var(--text-3)",
      border: "1px solid rgba(148,163,184,0.35)",
      background: "rgba(148,163,184,0.08)",
    };
  }

  return {
    label: "Pendiente",
    color: "var(--amber)",
    border: "1px solid rgba(245,158,11,0.35)",
    background: "rgba(245,158,11,0.08)",
  };
}

function buildDraft(event: RestockHistoryEvent | null): DraftState {
  return {
    supplierName: event?.supplierName ?? "",
    note: event?.note ?? "",
    valuationStatus: event?.valuationStatus ?? "PENDING",
    items: Object.fromEntries(
      (event?.items ?? []).map((item) => [
        item.id,
        {
          unitCost: moneyInput(item.unitCost),
          salePrice: moneyInput(item.salePrice),
        },
      ]),
    ),
  };
}

export default function RestockHistoryModal({
  branchId,
  onClose,
}: {
  branchId: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<RestockHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "completed" | "all">("pending");
  const [draft, setDraft] = useState<DraftState>(buildDraft(null));

  const loadEvents = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/inventario/ingresos", {
        headers: { "x-branch-id": branchId },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No pudimos cargar el historial de ingresos.");
      }

      const nextEvents = Array.isArray(data?.events) ? (data.events as RestockHistoryEvent[]) : [];
      setEvents(nextEvents);
      setSelectedId((current) => {
        if (preferredId && nextEvents.some((event) => event.id === preferredId)) {
          return preferredId;
        }
        if (current && nextEvents.some((event) => event.id === current)) {
          return current;
        }
        return nextEvents[0]?.id ?? null;
      });
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "No pudimos cargar el historial de ingresos.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") {
      return events;
    }

    if (statusFilter === "completed") {
      return events.filter((event) => event.valuationStatus === "COMPLETED");
    }

    return events.filter((event) => event.valuationStatus !== "COMPLETED");
  }, [events, statusFilter]);

  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === selectedId) ?? filteredEvents[0] ?? null,
    [filteredEvents, selectedId],
  );

  useEffect(() => {
    if (!filteredEvents.some((event) => event.id === selectedId)) {
      setSelectedId(filteredEvents[0]?.id ?? null);
    }
  }, [filteredEvents, selectedId]);

  useEffect(() => {
    setDraft(buildDraft(selectedEvent));
    setError(null);
  }, [selectedEvent]);

  const pendingCount = events.filter((event) => event.valuationStatus !== "COMPLETED").length;
  const completedCount = events.filter((event) => event.valuationStatus === "COMPLETED").length;
  const pendingUnits = events.reduce((sum, event) => sum + getPendingUnits(event.items), 0);
  const pendingLines = events.reduce((sum, event) => sum + event.missingCostLines, 0);
  const valuedCapital = events.reduce((sum, event) => sum + getValuedAmount(event.items), 0);
  const selectedStatusMeta = selectedEvent ? getStatusMeta(selectedEvent.valuationStatus) : null;
  const selectedPendingUnits = selectedEvent ? getPendingUnits(selectedEvent.items) : 0;
  const selectedValuedAmount = selectedEvent ? getValuedAmount(selectedEvent.items) : 0;

  const handleLineChange = (itemId: string, field: "unitCost" | "salePrice", value: string) => {
    setDraft((current) => ({
      ...current,
      items: {
        ...current.items,
        [itemId]: {
          unitCost: current.items[itemId]?.unitCost ?? "",
          salePrice: current.items[itemId]?.salePrice ?? "",
          [field]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedEvent) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/inventario/ingresos/${selectedEvent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          supplierName: draft.supplierName,
          note: draft.note,
          valuationStatus: draft.valuationStatus,
          items: selectedEvent.items.map((item) => ({
            id: item.id,
            unitCost: parseMoneyInput(draft.items[item.id]?.unitCost ?? ""),
            salePrice: parseMoneyInput(draft.items[item.id]?.salePrice ?? ""),
          })),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No pudimos guardar el ingreso.");
      }

      await loadEvents(selectedEvent.id);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "No pudimos guardar el ingreso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "1080px",
          width: "100%",
          maxHeight: "92dvh",
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto auto auto 1fr",
        }}
      >
        <div
          style={{
            padding: "18px 20px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800 }}>Historial de ingresos</h2>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
              Revisa compras cargadas, comprobantes y completa costos cuando haga falta.
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            className={statusFilter === "pending" ? "btn btn-sm btn-green" : "btn btn-sm btn-ghost"}
            style={statusFilter === "pending" ? undefined : { border: "1px solid var(--border)" }}
            onClick={() => setStatusFilter("pending")}
          >
            Pendientes ({pendingCount})
          </button>
          <button
            className={statusFilter === "completed" ? "btn btn-sm btn-green" : "btn btn-sm btn-ghost"}
            style={statusFilter === "completed" ? undefined : { border: "1px solid var(--border)" }}
            onClick={() => setStatusFilter("completed")}
          >
            Completos ({completedCount})
          </button>
          <button
            className={statusFilter === "all" ? "btn btn-sm btn-green" : "btn btn-sm btn-ghost"}
            style={statusFilter === "all" ? undefined : { border: "1px solid var(--border)" }}
            onClick={() => setStatusFilter("all")}
          >
            Todos ({events.length})
          </button>
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
            background: "rgba(15,23,42,0.18)",
          }}
        >
          {[
            {
              label: "Ingresos pendientes",
              value: String(pendingCount),
              detail: pendingCount === 1 ? "1 documento por cerrar" : `${pendingCount} documentos por cerrar`,
              tone: "var(--amber)",
            },
            {
              label: "Ingresos completos",
              value: String(completedCount),
              detail: completedCount === 1 ? "1 documento ya valorizado" : `${completedCount} documentos valorizados`,
              tone: "var(--green)",
            },
            {
              label: "Unidades sin costo",
              value: String(pendingUnits),
              detail: pendingLines === 1 ? "1 linea pendiente" : `${pendingLines} lineas pendientes`,
              tone: "var(--orange, #fb923c)",
            },
            {
              label: "Capital valorizado",
              value: formatARS(valuedCapital),
              detail: "Sobre lineas con costo cargado",
              tone: "var(--primary)",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "16px",
                padding: "14px",
                background: "var(--surface)",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 800, color: "var(--text-3)" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 900, color: card.tone, lineHeight: 1.1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>{card.detail}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)",
          }}
        >
          <aside
            style={{
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "rgba(15,23,42,0.24)",
            }}
          >
            {loading ? (
              <div style={{ padding: "18px", color: "var(--text-3)" }}>Cargando ingresos...</div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ padding: "18px", color: "var(--text-3)" }}>
                No hay ingresos en esta vista.
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isActive = selectedEvent?.id === event.id;
                const statusMeta = getStatusMeta(event.valuationStatus);

                return (
                  <button
                    key={event.id}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSelectedId(event.id)}
                    style={{
                      textAlign: "left",
                      border: isActive ? statusMeta.border : "1px solid var(--border)",
                      background: isActive ? statusMeta.background : "var(--surface)",
                      borderRadius: "16px",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{event.supplierName || "Ingreso sin proveedor"}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                          {formatDateTime(event.createdAt)}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          color: statusMeta.color,
                          border: statusMeta.border,
                          background: statusMeta.background,
                          borderRadius: "999px",
                          padding: "4px 8px",
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-2)" }}>
                      {event.linesCount} linea{event.linesCount === 1 ? "" : "s"} · {event.totalQuantity} unidad
                      {event.totalQuantity === 1 ? "" : "es"}
                    </div>
                    {event.note && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-3)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {event.note}
                      </div>
                    )}
                    {event.missingCostLines > 0 && (
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)" }}>
                        Faltan costos en {event.missingCostLines} linea{event.missingCostLines === 1 ? "" : "s"}.
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </aside>

          <section
            style={{
              minHeight: 0,
              overflowY: "auto",
              padding: "16px 18px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {!selectedEvent ? (
              <div style={{ padding: "22px", color: "var(--text-3)" }}>
                Selecciona un ingreso para ver el detalle.
              </div>
            ) : (
              <>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "18px",
                    padding: "16px",
                    background: "var(--surface)",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
                        Documento de ingreso
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>
                        {draft.supplierName.trim() || "Proveedor sin cargar"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: "12px", color: "var(--text-3)" }}>
                      <div>{formatDateTime(selectedEvent.createdAt)}</div>
                      <div style={{ marginTop: "4px" }}>
                        {selectedEvent.employeeName ? `Cargado por ${selectedEvent.employeeName}` : "Carga manual"}
                      </div>
                    </div>
                  </div>

                  {selectedStatusMeta && (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: selectedStatusMeta.color,
                          border: selectedStatusMeta.border,
                          background: selectedStatusMeta.background,
                          borderRadius: "999px",
                          padding: "6px 10px",
                        }}
                      >
                        {selectedStatusMeta.label}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        {selectedPendingUnits > 0
                          ? `${selectedPendingUnits} unidad${selectedPendingUnits === 1 ? "" : "es"} todavia sin costo`
                          : "No quedan unidades pendientes de costo"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        Capital ya valorizado: <strong style={{ color: "var(--text)" }}>{formatARS(selectedValuedAmount)}</strong>
                      </span>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "12px" }}>
                    <input
                      className="input"
                      value={draft.supplierName}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, supplierName: event.target.value }))
                      }
                      placeholder="Proveedor"
                    />
                    <select
                      className="input"
                      value={draft.valuationStatus}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          valuationStatus: event.target.value as DraftState["valuationStatus"],
                        }))
                      }
                    >
                      <option value="PENDING">Pendiente de valorizar</option>
                      <option value="COMPLETED">Completo</option>
                      <option value="NOT_APPLICABLE">No seguir valuacion</option>
                    </select>
                  </div>

                  <textarea
                    className="input"
                    rows={3}
                    value={draft.note}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Nota del ingreso"
                    style={{ resize: "vertical", minHeight: "96px" }}
                  />

                  {selectedEvent.attachments.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
                        Comprobante
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {selectedEvent.attachments.map((attachment, index) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px 10px",
                              borderRadius: "14px",
                              border: "1px solid var(--border)",
                              background: "var(--surface-2)",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachment.url}
                              alt={`Comprobante ${index + 1}`}
                              style={{ width: "46px", height: "46px", objectFit: "cover", borderRadius: "10px" }}
                            />
                            <span style={{ fontSize: "12px", fontWeight: 700 }}>Abrir foto {index + 1}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "18px",
                    background: "var(--surface)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 800 }}>Lineas del ingreso</div>
                      <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                        Completa costos y precios sin volver a mover stock fisico.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        {selectedEvent.totalQuantity} unidad{selectedEvent.totalQuantity === 1 ? "" : "es"} ·{" "}
                        {selectedEvent.linesCount} linea{selectedEvent.linesCount === 1 ? "" : "s"}
                      </span>
                      {selectedEvent.missingCostLines > 0 && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            color: "var(--amber)",
                            border: "1px solid rgba(245,158,11,0.35)",
                            background: "rgba(245,158,11,0.08)",
                            borderRadius: "999px",
                            padding: "4px 8px",
                          }}
                        >
                          {selectedEvent.missingCostLines} linea{selectedEvent.missingCostLines === 1 ? "" : "s"} sin costo
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {selectedEvent.items.map((item) => {
                      const lineDraft = draft.items[item.id] ?? { unitCost: "", salePrice: "" };
                      const missingCost = item.quantity > 0 && !lineDraft.unitCost.trim();

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 120px 160px 160px",
                            gap: "10px",
                            padding: "14px 16px",
                            borderTop: "1px solid var(--border)",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>
                              {item.productName}
                              {item.variantName ? ` · ${item.variantName}` : ""}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                              {item.quantity} unidad{Math.abs(item.quantity) === 1 ? "" : "es"}
                              {missingCost && (
                                <span style={{ marginLeft: "8px", color: "var(--amber)", fontWeight: 700 }}>
                                  Falta costo
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 700 }}>
                            {item.unitCost !== null ? formatARS(item.unitCost) : "Sin costo"}
                          </div>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="Costo unit."
                            value={lineDraft.unitCost}
                            onChange={(event) => handleLineChange(item.id, "unitCost", event.target.value)}
                          />
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="Precio venta"
                            value={lineDraft.salePrice}
                            onChange={(event) => handleLineChange(item.id, "salePrice", event.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <div style={{ fontSize: "13px", color: "var(--red)", fontWeight: 700 }}>
                    {error}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    Guardar aca actualiza el documento del ingreso y deja lista la valorizacion para la siguiente release.
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button className="btn btn-ghost" onClick={onClose}>
                      Cerrar
                    </button>
                    <button className="btn btn-green" onClick={() => void handleSave()} disabled={saving}>
                      {saving ? "Guardando..." : "Guardar ingreso"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
