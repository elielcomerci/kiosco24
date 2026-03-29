"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import BackButton from "@/components/ui/BackButton";
import TicketModal from "@/components/ticket/TicketModal";
import { formatARS } from "@/lib/utils";

type TicketRow = {
  id: string;
  ticketNumber: number | null;
  ticketNumberFormatted: string | null;
  issuedAt: string;
  total: number;
  paymentMethod: string;
  paymentMethodLabel: string;
  employeeId: string | null;
  employeeName: string | null;
  customerName: string | null;
  voided: boolean;
  previewItems: string[];
};

type EmployeeOption = {
  id: string;
  name: string;
};

const paymentOptions = [
  { value: "", label: "Todos los pagos" },
  { value: "CASH", label: "Efectivo" },
  { value: "MERCADOPAGO", label: "MercadoPago" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "DEBIT", label: "Debito" },
  { value: "CREDIT_CARD", label: "Tarjeta" },
  { value: "CREDIT", label: "Fiado" },
];

export default function TicketsPage() {
  const params = useParams();
  const branchId = params.branchId as string;

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [voided, setVoided] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch("/api/empleados", {
        headers: {
          "x-branch-id": branchId,
        },
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json().catch(() => []);
      setEmployees(
        Array.isArray(data)
          ? data.map((employee) => ({
              id: employee.id as string,
              name: employee.name as string,
            }))
          : [],
      );
    } finally {
      setLoadingEmployees(false);
    }
  }, [branchId]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (query.trim()) searchParams.set("q", query.trim());
      if (employeeId) searchParams.set("employeeId", employeeId);
      if (paymentMethod) searchParams.set("paymentMethod", paymentMethod);
      if (voided !== "all") searchParams.set("voided", voided);
      if (from) searchParams.set("from", from);
      if (to) searchParams.set("to", to);

      const res = await fetch(`/api/tickets?${searchParams.toString()}`, {
        headers: {
          "x-branch-id": branchId,
        },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "No se pudieron cargar los tickets.");
      }

      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los tickets.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, employeeId, from, paymentMethod, query, to, voided]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const totalAmount = useMemo(
    () => tickets.reduce((sum, ticket) => sum + ticket.total, 0),
    [tickets],
  );

  return (
    <div style={{ minHeight: "100dvh", padding: "24px 16px 110px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <BackButton fallback={`/${branchId}/caja`} />
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>Tickets</h1>
              <p style={{ margin: "4px 0 0", color: "var(--text-3)", fontSize: "14px" }}>
                Revisa, comparte o imprime tickets por fecha.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div className="card" style={{ padding: "12px 14px", minWidth: "140px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Tickets</div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{tickets.length}</div>
            </div>
            <div className="card" style={{ padding: "12px 14px", minWidth: "160px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Total listado</div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{formatARS(totalAmount)}</div>
            </div>
          </div>
        </div>

        <section
          className="card"
          style={{
            padding: "18px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              BUSCAR
            </label>
            <input
              className="input"
              placeholder="Numero, item o empleado"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              DESDE
            </label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              HASTA
            </label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              EMPLEADO
            </label>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={loadingEmployees}>
              <option value="">Todos</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              PAGO
            </label>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {paymentOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              ESTADO
            </label>
            <select className="input" value={voided} onChange={(e) => setVoided(e.target.value)}>
              <option value="all">Todos</option>
              <option value="false">Vigentes</option>
              <option value="true">Anulados</option>
            </select>
          </div>
        </section>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando tickets...</div>
        ) : error ? (
          <div className="card" style={{ padding: "20px", color: "var(--red)" }}>
            {error}
          </div>
        ) : tickets.length === 0 ? (
          <div className="card" style={{ padding: "28px", textAlign: "center", color: "var(--text-3)" }}>
            No encontramos tickets con esos filtros.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className="card"
                onClick={() => setSelectedSaleId(ticket.id)}
                style={{
                  padding: "16px 18px",
                  textAlign: "left",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "14px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "18px", fontWeight: 800 }}>
                      {ticket.ticketNumberFormatted ? `Ticket ${ticket.ticketNumberFormatted}` : "Ticket emitido"}
                    </span>
                    {ticket.voided ? (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "4px 8px",
                          borderRadius: "999px",
                          color: "var(--red)",
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.22)",
                        }}
                      >
                        ANULADO
                      </span>
                    ) : null}
                  </div>

                  <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-3)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span>{new Date(ticket.issuedAt).toLocaleString("es-AR")}</span>
                    <span>{ticket.paymentMethodLabel}</span>
                    {ticket.employeeName ? <span>{ticket.employeeName}</span> : null}
                    {ticket.customerName ? <span>{ticket.customerName}</span> : null}
                  </div>

                  {ticket.previewItems.length > 0 ? (
                    <div style={{ marginTop: "10px", fontSize: "13px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ticket.previewItems.join(" · ")}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "22px", fontWeight: 800 }}>{formatARS(ticket.total)}</span>
                  <span style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 700 }}>Ver ticket</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSaleId ? (
        <TicketModal branchId={branchId} saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      ) : null}
    </div>
  );
}
