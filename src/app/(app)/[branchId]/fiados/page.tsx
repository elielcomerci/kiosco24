"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PrintablePage from "@/components/print/PrintablePage";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";
import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";
import NumPad from "@/components/ui/NumPad";
import BackButton from "@/components/ui/BackButton";

interface CreditCustomer {
  id: string;
  name: string;
  balance: number;
}

export default function FiadosPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = params.branchId as string;
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cobrarCustomer, setCobrarCustomer] = useState<CreditCustomer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/fiados/customers", {
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "No se pudieron cargar los fiados.");
        return;
      }

      setCustomers(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setError("No se pudieron cargar los fiados.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchCustomers();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchCustomers]);

  const totalFiado = customers.reduce((sum, customer) => sum + customer.balance, 0);

  const filtered = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) &&
      customer.balance > 0
  );

  const shortcuts = useMemo(
    () => [
      {
        key: "/",
        combo: "/",
        label: "Buscar cliente",
        description: "Lleva el foco a la busqueda de clientes con deuda.",
        group: "Fiados",
        action: () => searchInputRef.current?.focus(),
      },
    ],
    []
  );

  useRegisterShortcuts(shortcuts);

  const handleConfirmPay = async () => {
    if (!cobrarCustomer || !payAmount) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/fiados/cobrar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          customerId: cobrarCustomer.id,
          amount: parseFloat(payAmount),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 402) {
          const shouldOpen = window.confirm(
            `${data?.error || "Necesitas una suscripcion activa para registrar cobros."}\n\n¿Quieres ir a Suscripcion ahora?`,
          );
          if (shouldOpen) {
            router.push("/suscripcion");
          }
          return;
        }
        setError(data?.error || "No se pudo registrar el cobro.");
        return;
      }

      setCobrarCustomer(null);
      setPayAmount("");
      await fetchCustomers();
    } catch (paymentError) {
      console.error(paymentError);
      setError("No se pudo registrar el cobro.");
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="screen-only"
        style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <BackButton fallback={`/${branchId}/caja`} />
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Fiados</h1>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "20px" }}>
          Total en la calle:{" "}
          <strong style={{ color: "var(--amber)" }}>{formatARS(totalFiado)}</strong>
        </p>

        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "14px",
              border: "1px solid rgba(239,68,68,.24)",
              background: "rgba(239,68,68,.10)",
              color: "#fecaca",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <input
          ref={searchInputRef}
          className="input"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: "16px" }}
        />

        {loading && !cobrarCustomer ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
            Cargando...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filtered.map((customer) => (
              <div
                key={customer.id}
                className="card"
                style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "16px" }}>{customer.name}</div>
                  <div style={{ color: "var(--amber)", fontWeight: 700, marginTop: "4px" }}>
                    Debe {formatARS(customer.balance)}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => setCobrarCustomer(customer)}>
                  Cobrar
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
                {search ? "No hay clientes encontrados" : "No hay fiados activos"}
              </div>
            )}
          </div>
        )}

        {cobrarCustomer && (
          <ModalPortal>
            <div
              className="modal-overlay animate-fade-in"
              onClick={() => {
                setCobrarCustomer(null);
                setPayAmount("");
              }}
            >
              <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Cobrar fiado</h2>
                <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
                  {cobrarCustomer.name} debe{" "}
                  <strong style={{ color: "var(--amber)" }}>
                    {formatARS(cobrarCustomer.balance)}
                  </strong>
                </p>
              </div>

              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-2)",
                  borderRadius: "var(--radius)",
                  padding: "16px",
                  textAlign: "center",
                  fontSize: "32px",
                  fontWeight: 800,
                  minHeight: "56px",
                }}
              >
                {payAmount ? (
                  <span style={{ color: "var(--green)" }}>
                    {formatARS(parseFloat(payAmount))}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-3)" }}>$0</span>
                )}
              </div>

              <NumPad value={payAmount} onChange={setPayAmount} />

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setCobrarCustomer(null);
                    setPayAmount("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-green"
                  style={{ flex: 2 }}
                  onClick={handleConfirmPay}
                  disabled={!payAmount || loading}
                >
                  {loading ? "..." : "Confirmar cobro"}
                </button>
              </div>
              </div>
            </div>
          </ModalPortal>
        )}
      </div>

      <PrintablePage
        title="Estado de fiados"
        subtitle={new Date().toLocaleDateString("es-AR")}
        meta={[
          { label: "Clientes", value: String(filtered.length) },
          { label: "Saldo total", value: formatARS(totalFiado) },
        ]}
      >
        <section className="print-section">
          <div className="print-section__title">Resumen</div>
          <div className="print-kpis">
            <div className="print-kpi">
              <div className="print-kpi__label">Saldo en la calle</div>
              <div className="print-kpi__value">{formatARS(totalFiado)}</div>
              <div className="print-kpi__sub">Deuda total pendiente</div>
            </div>
            <div className="print-kpi">
              <div className="print-kpi__label">Clientes activos</div>
              <div className="print-kpi__value">{filtered.length}</div>
              <div className="print-kpi__sub">
                {search ? `Filtro aplicado: "${search}"` : "Sin filtros"}
              </div>
            </div>
          </div>
        </section>

        <section className="print-section">
          <div className="print-section__title">Detalle de clientes</div>
          {filtered.length === 0 ? (
            <div className="print-note">No hay fiados activos para imprimir.</div>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{formatARS(customer.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </PrintablePage>
    </>
  );
}
