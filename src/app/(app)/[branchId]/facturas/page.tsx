"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import InvoiceModal from "@/components/fiscal/InvoiceModal";
import BackButton from "@/components/ui/BackButton";
import { formatARS } from "@/lib/utils";

type InvoiceRow = {
  id: string;
  saleId: string;
  status: "PENDING" | "ISSUED" | "FAILED";
  invoiceTypeLabel: string;
  voucherNumberFormatted: string | null;
  issuedAt: string;
  cae: string | null;
  docTipo: number;
  docNro: string;
  receiverName: string | null;
  total: number;
  paymentMethodLabel: string;
  employeeId: string | null;
  employeeName: string | null;
  pdfUrl: string | null;
  lastError: string | null;
};

type EmployeeOption = {
  id: string;
  name: string;
};

const statusOptions = [
  { value: "", label: "Todos los estados" },
  { value: "ISSUED", label: "Emitidas" },
  { value: "PENDING", label: "Pendientes" },
  { value: "FAILED", label: "Fallidas" },
];

export default function FacturasPage() {
  const params = useParams();
  const branchId = params.branchId as string;

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch("/api/empleados", {
        headers: { "x-branch-id": branchId },
      });

      if (!res.ok) return;
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

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (query.trim()) searchParams.set("q", query.trim());
      if (employeeId) searchParams.set("employeeId", employeeId);
      if (status) searchParams.set("status", status);
      if (from) searchParams.set("from", from);
      if (to) searchParams.set("to", to);

      const res = await fetch(`/api/fiscal/invoices?${searchParams.toString()}`, {
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "No se pudieron cargar las facturas.");
      }

      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las facturas.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, employeeId, from, query, status, to]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  const totalAmount = useMemo(() => invoices.reduce((sum, invoice) => sum + invoice.total, 0), [invoices]);

  return (
    <div style={{ minHeight: "100dvh", padding: "24px 16px 110px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <BackButton fallback={`/${branchId}/caja`} />
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>Facturas</h1>
              <p style={{ margin: "4px 0 0", color: "var(--text-3)", fontSize: "14px" }}>
                Revisa facturas emitidas, pendientes o con error.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div className="card" style={{ padding: "12px 14px", minWidth: "140px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Facturas</div>
              <div style={{ fontSize: "22px", fontWeight: 800 }}>{invoices.length}</div>
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
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              BUSCAR
            </label>
            <input
              className="input"
              placeholder="Numero, CAE, CUIT/DNI o receptor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              DESDE
            </label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              HASTA
            </label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              EMPLEADO
            </label>
            <select
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={loadingEmployees}
            >
              <option value="">Todos</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              ESTADO
            </label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando facturas...</div>
        ) : error ? (
          <div className="card" style={{ padding: "20px", color: "var(--red)" }}>
            {error}
          </div>
        ) : invoices.length === 0 ? (
          <div className="card" style={{ padding: "28px", textAlign: "center", color: "var(--text-3)" }}>
            No encontramos facturas con esos filtros.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {invoices.map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                className="card"
                onClick={() => setSelectedSaleId(invoice.saleId)}
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
                      {invoice.voucherNumberFormatted
                        ? `${invoice.invoiceTypeLabel} ${invoice.voucherNumberFormatted}`
                        : "Factura pendiente"}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "4px 8px",
                        borderRadius: "999px",
                        color:
                          invoice.status === "ISSUED"
                            ? "var(--green)"
                            : invoice.status === "FAILED"
                              ? "var(--red)"
                              : "var(--amber)",
                        background:
                          invoice.status === "ISSUED"
                            ? "rgba(34,197,94,0.12)"
                            : invoice.status === "FAILED"
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(245,158,11,0.12)",
                        border:
                          invoice.status === "ISSUED"
                            ? "1px solid rgba(34,197,94,0.25)"
                            : invoice.status === "FAILED"
                              ? "1px solid rgba(239,68,68,0.25)"
                              : "1px solid rgba(245,158,11,0.25)",
                      }}
                    >
                      {invoice.status === "ISSUED" ? "EMITIDA" : invoice.status === "FAILED" ? "ERROR" : "PENDIENTE"}
                    </span>
                  </div>

                  <div style={{ marginTop: "6px", color: "var(--text-2)", fontSize: "13px" }}>
                    {new Date(invoice.issuedAt).toLocaleString("es-AR")} | {invoice.paymentMethodLabel}
                  </div>

                  <div style={{ marginTop: "6px", color: "var(--text-3)", fontSize: "13px" }}>
                    {invoice.receiverName || "Consumidor Final"} | {invoice.docNro}
                    {invoice.employeeName ? ` | ${invoice.employeeName}` : ""}
                  </div>

                  {invoice.lastError ? (
                    <div
                      style={{
                        marginTop: "8px",
                        color: invoice.status === "FAILED" ? "var(--red)" : "var(--amber)",
                        fontSize: "12px",
                      }}
                    >
                      {invoice.lastError}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: 800 }}>{formatARS(invoice.total)}</div>
                  <div style={{ color: "var(--text-3)", fontSize: "12px" }}>
                    {invoice.cae ? `CAE ${invoice.cae}` : "Sin CAE"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSaleId ? (
        <InvoiceModal
          branchId={branchId}
          saleId={selectedSaleId}
          mode="view"
          allowPendingRelease
          onResolved={() => {
            void fetchInvoices();
          }}
          onClose={() => setSelectedSaleId(null)}
        />
      ) : null}
    </div>
  );
}
