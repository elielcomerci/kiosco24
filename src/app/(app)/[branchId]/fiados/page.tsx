"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const branchId = params.branchId as string;
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cobrarCustomer, setCobrarCustomer] = useState<CreditCustomer | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const fetchCustomers = async () => {
    setLoading(true);
    const res = await fetch("/api/fiados/customers");
    const data = await res.json();
    setCustomers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const totalFiado = customers.reduce((sum, c) => sum + c.balance, 0);

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) && c.balance > 0
  );

  const handleConfirmPay = async () => {
    if (!cobrarCustomer || !payAmount) return;
    setLoading(true);
    await fetch(`/api/fiados/cobrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: cobrarCustomer.id, amount: parseFloat(payAmount) }),
    });
    setCobrarCustomer(null);
    setPayAmount("");
    fetchCustomers();
  };

  return (
    <div style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <BackButton fallback={`/${branchId}/caja`} />
        <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Fiados</h1>
      </div>
      <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "20px" }}>
        Total en la calle: <strong style={{ color: "var(--amber)" }}>{formatARS(totalFiado)}</strong>
      </p>

      <input
        className="input"
        placeholder="🔍 Buscar cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "16px" }}
      />

      {loading && !cobrarCustomer ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "16px" }}>{c.name}</div>
                <div style={{ color: "var(--amber)", fontWeight: 700, marginTop: "4px" }}>
                  Debe {formatARS(c.balance)}
                </div>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCobrarCustomer(c)}
              >
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

      {/* Cobrar Modal */}
      {cobrarCustomer && (
        <div className="modal-overlay animate-fade-in" onClick={() => { setCobrarCustomer(null); setPayAmount(""); }}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Cobrar fiado</h2>
              <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
                {cobrarCustomer.name} debe <strong style={{ color: "var(--amber)" }}>{formatARS(cobrarCustomer.balance)}</strong>
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
                <span style={{ color: "var(--green)" }}>{formatARS(parseFloat(payAmount))}</span>
              ) : (
                <span style={{ color: "var(--text-3)" }}>$0</span>
              )}
            </div>

            <NumPad value={payAmount} onChange={setPayAmount} />

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setCobrarCustomer(null); setPayAmount(""); }}>
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
      )}
    </div>
  );
}
