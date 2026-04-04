"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PrintablePage from "@/components/print/PrintablePage";
import OperationalSubscriptionModal from "@/components/subscription/OperationalSubscriptionModal";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";
import ModalPortal from "@/components/ui/ModalPortal";
import { formatARS } from "@/lib/utils";
import NumPad from "@/components/ui/NumPad";
import BackButton from "@/components/ui/BackButton";

interface CreditCustomer {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

function phoneHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

export default function FiadosPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cobrarCustomer, setCobrarCustomer] = useState<CreditCustomer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [subscriptionPromptMessage, setSubscriptionPromptMessage] = useState("");
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState(false);
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [subscriptionPromptError, setSubscriptionPromptError] = useState("");
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
  const searchLower = search.toLowerCase();

  const filtered = customers.filter(
    (customer) =>
      (customer.name.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        false) &&
      customer.balance > 0,
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
    [],
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
          setSubscriptionPromptMessage(data?.error || "Necesitas una suscripcion activa para registrar cobros.");
          setSubscriptionPromptError("");
          setShowSubscriptionPrompt(true);
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

  const handleActivateSubscription = async () => {
    setActivatingSubscription(true);
    setSubscriptionPromptError("");

    try {
      const response = await fetch("/api/subscription/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ origin: "OPERATIONAL_GATE" }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.init_point) {
        setSubscriptionPromptError(data?.error || "No se pudo generar el link de pago.");
        setActivatingSubscription(false);
        return;
      }

      window.location.href = data.init_point;
    } catch {
      setSubscriptionPromptError("No se pudo conectar con el sistema de suscripciones.");
      setActivatingSubscription(false);
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
                  {customer.phone ? (
                    <a
                      href={phoneHref(customer.phone)}
                      style={{
                        color: "var(--text-3)",
                        fontSize: "13px",
                        textDecoration: "none",
                      }}
                    >
                      {customer.phone}
                    </a>
                  ) : (
                    <div style={{ color: "var(--text-3)", fontSize: "13px" }}>Sin telefono</div>
                  )}
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
                  {cobrarCustomer.phone && (
                    <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "-6px" }}>
                      Telefono:{" "}
                      <a
                        href={phoneHref(cobrarCustomer.phone)}
                        style={{ color: "var(--text-2)", textDecoration: "none" }}
                      >
                        {cobrarCustomer.phone}
                      </a>
                    </p>
                  )}
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
                  <th>Telefono</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>
                      {customer.phone ? (
                        <a
                          href={phoneHref(customer.phone)}
                          style={{ color: "var(--text-2)", textDecoration: "none" }}
                        >
                          {customer.phone}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{formatARS(customer.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </PrintablePage>

      {showSubscriptionPrompt && (
        <OperationalSubscriptionModal
          message={subscriptionPromptMessage || "Necesitas una suscripcion activa para continuar."}
          loading={activatingSubscription}
          error={subscriptionPromptError}
          onActivate={() => void handleActivateSubscription()}
          onClose={() => {
            if (activatingSubscription) return;
            setShowSubscriptionPrompt(false);
            setSubscriptionPromptError("");
          }}
        />
      )}
    </>
  );
}
