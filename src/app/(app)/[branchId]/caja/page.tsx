"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatARS } from "@/lib/utils";
import NumPad from "@/components/ui/NumPad";
import ConfirmationScreen from "@/components/caja/ConfirmationScreen";
import GastoModal from "@/components/caja/GastoModal";
import OtroModal from "@/components/caja/OtroModal";
import RetiroModal from "@/components/caja/RetiroModal";
import CreditCustomerModal from "@/components/caja/CreditCustomerModal";
import OpenShiftModal from "@/components/turnos/OpenShiftModal";
import CloseShiftModal from "@/components/turnos/CloseShiftModal";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import { savePendingSale } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/sync";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
  emoji?: string | null;
  stock?: number | null;
}

interface TicketItem {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  cost?: number;
}

interface Sale {
  id: string;
  total: number;
  paymentMethod: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT";
  items: TicketItem[];
  creditCustomerName?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

import { useParams } from "next/navigation";

// ... (types)

export default function CajaPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cajaStats, setCajaStats] = useState({ enCaja: 0, ganancia: 0 });
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [showGasto, setShowGasto] = useState(false);
  const [showOtro, setShowOtro] = useState(false);
  const [showRetiro, setShowRetiro] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [showCashNumpad, setShowCashNumpad] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [cajaSearch, setCajaSearch] = useState("");

  const isOnline = useOnlineStatus();
  const total = ticket.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // ─── WakeLock Logic ───────────────────────────────────────────────────────
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    if (activeShift && 'wakeLock' in navigator) {
      const requestWakeLock = async () => {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {}
      };
      requestWakeLock();
    } else if (!activeShift && wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      });
    }
  }, [activeShift]);

  // ─── Startup Logic: Onboarding & Shift ──────────────────────────────────
  useEffect(() => {
    checkOnboardingAndShift();
  }, []);

  const checkOnboardingAndShift = async () => {
    try {
      // 1. Check Onboarding
      let res = await fetch("/api/onboarding");
      let data = await res.json();
      if (!data.setup) {
        // Auto-setup with suggested products
        const setupRes = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kioscoName: "Mi Kiosco" })
        });
        await setupRes.json();
      }

      // 2. Fetch dependencies
      await fetchProducts();
      await fetchStats();

      // 3. Check Active Shift
      const shiftRes = await fetch(`/api/turnos/activo`, {
        headers: { "x-branch-id": branchId }
      });
      const shiftData = await shiftRes.json();
      if (shiftData) {
        setActiveShift(shiftData);
      } else {
        setShowOpenShift(true);
      }
    } catch {
      setLoading(false);
    }
  };

  const handleOpenShift = async (amount: number, employeeName: string) => {
    const res = await fetch("/api/turnos/abrir", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-branch-id": branchId
      },
      body: JSON.stringify({ openingAmount: amount, employeeName }),
    });
    if (res.ok) {
      const shift = await res.json();
      setActiveShift(shift);
      setShowOpenShift(false);
      fetchStats();
    }
  };

  const handleCloseShift = async (amount: number, note: string) => {
    if (!activeShift) return;
    await fetch(`/api/turnos/${activeShift.id}/cerrar`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-branch-id": branchId
      },
      body: JSON.stringify({ closingAmount: amount, note }),
    });
    setActiveShift(null);
    setShowCloseShift(false);
    setShowOpenShift(true);
    fetchStats();
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/productos`, {
        headers: { "x-branch-id": branchId }
      });
      const data = await res.json();
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/stats/hoy`, {
        headers: { "x-branch-id": branchId }
      });
      const data = await res.json();
      setCajaStats(data);
    } catch {}
  };

  // ─── Product tap ─────────────────────────────────────────────────────────
  const handleProductTap = useCallback((product: Product) => {
    setTicket((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        },
      ];
    });
  }, []);

  // Long press = -1
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const handleLongPressStart = (product: Product) => {
    longPressTimer.current = setTimeout(() => {
      setTicket((prev) => {
        const existing = prev.find((i) => i.productId === product.id);
        if (!existing || existing.quantity <= 1) {
          return prev.filter((i) => i.productId !== product.id);
        }
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity - 1 }
            : i
        );
      });
    }, 400);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ─── REPETIR ─────────────────────────────────────────────────────────────
  const handleRepetir = () => {
    if (!lastSale) return;
    setTicket(lastSale.items.map((i) => ({ ...i })));
  };

  // ─── Payment ──────────────────────────────────────────────────────────────
  const handlePay = async (method: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT", creditCustomerId?: string, creditCustomerName?: string) => {
    if (total === 0 && ticket.length === 0) return;

    const received = method === "CASH" && receivedAmount
      ? parseFloat(receivedAmount)
      : undefined;

    try {
        const reqBody = {
          items: ticket,
          total,
          paymentMethod: method,
          receivedAmount: received,
          creditCustomerId,
        };

        const newSale: Sale = {
          id: "", // Will be set if online
          total,
          paymentMethod: method,
          items: [...ticket],
          creditCustomerName,
        };

        if (isOnline) {
          const res = await fetch("/api/ventas", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-branch-id": branchId
            },
            body: JSON.stringify(reqBody),
          });
          if (!res.ok) throw new Error("Error registrando");
          const sale = await res.json();
          newSale.id = sale.id;
        } else {
          // OFFLINE SAVE
          // Assuming savePendingSale generates a temporary ID or handles it internally
          await savePendingSale(reqBody);
          // For offline sales, we might generate a temporary ID or leave it empty
          // For now, newSale.id remains "" as initialized
        }

        setLastSale(newSale);
        setConfirmedSale({ ...newSale, ...(received ? { receivedAmount: received } as any : {}) });
        setTicket([]);
      setReceivedAmount("");
      setShowCashNumpad(false);
      fetchStats();
    } catch (err) {
      console.error(err);
    }
  };

  // ─── CORREGIR ─────────────────────────────────────────────────────────────
  const handleCorregir = () => {
    if (!confirmedSale) return;
    setTicket(confirmedSale.items.map((i) => ({ ...i })));
    setConfirmedSale(null);
    if (confirmedSale.id && isOnline) {
      fetch(`/api/ventas/${confirmedSale.id}/anular`, { method: "POST" });
      fetchStats();
    }
  };

  // ─── Barcode handling ─────────────────────────────────────────────────────
  const handleBarcodeScan = (result: string) => {
    // Only close scanner if we find it
    const product = products.find(p => p.barcode === result);
    if (product) {
      handleProductTap(product);
      setShowScanner(false);
    } else {
      // Not found, maybe show toast
      alert(`Código ${result} no encontrado.`);
    }
  };

  // ─── Ticket item controls ─────────────────────────────────────────────────
  const changeQty = (index: number, delta: number) => {
    setTicket((prev) => {
      const newTicket = [...prev];
      newTicket[index] = { ...newTicket[index], quantity: newTicket[index].quantity + delta };
      if (newTicket[index].quantity <= 0) newTicket.splice(index, 1);
      return newTicket;
    });
  };

  // ─── Cash numpad ──────────────────────────────────────────────────────────
  const handleCashButton = () => {
    if (total === 0) return;
    setShowCashNumpad(true);
  };

  const handleCashConfirm = () => {
    setShowCashNumpad(false);
    handlePay("CASH");
  };

  const change = receivedAmount
    ? parseFloat(receivedAmount) - total
    : null;

  // ─── Confirmed sale overlay ────────────────────────────────────────────────
  if (confirmedSale) {
    return (
      <ConfirmationScreen
        sale={confirmedSale as any}
        onChange={change}
        onCorregir={handleCorregir}
        onListo={() => setConfirmedSale(null)}
      />
    );
  }

  // ─── Cash numpad overlay ──────────────────────────────────────────────────
  if (showCashNumpad) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", minHeight: "100dvh" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700 }}>¿Cuánto entregó?</h2>
        <p style={{ color: "var(--text-2)" }}>Total: <strong style={{ color: "var(--text)" }}>{formatARS(total)}</strong></p>
        
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius)", padding: "20px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", fontWeight: 800, minHeight: "48px" }}>
            {receivedAmount ? formatARS(parseFloat(receivedAmount)) : <span style={{ color: "var(--text-3)" }}>$0</span>}
          </div>
          {change !== null && change >= 0 && (
            <div style={{ marginTop: "8px", color: "var(--primary)", fontWeight: 700, fontSize: "20px" }}>
              Cambio: {formatARS(change)}
            </div>
          )}
        </div>

        <NumPad
          value={receivedAmount}
          onChange={setReceivedAmount}
        />

        <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowCashNumpad(false); setReceivedAmount(""); }}>
            Cancelar
          </button>
          <button className="btn btn-green" style={{ flex: 2 }} onClick={handleCashConfirm}>
            Cobrar
          </button>
        </div>
      </div>
    );
  }

  // ─── Main caja screen ─────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-bar-item">
          <span className="status-bar-label">En Caja</span>
          <span className="status-bar-value" style={{ color: "var(--primary)" }}>
            {formatARS(cajaStats.enCaja)}
          </span>
        </div>
        <div className="separator" style={{ width: "1px", height: "32px", background: "var(--border-2)" }} />
        <div className="status-bar-item" style={{ alignItems: "flex-end" }}>
          <span className="status-bar-label">Ganancia estimada</span>
          <span className="status-bar-value" style={{ color: cajaStats.ganancia >= 0 ? "var(--primary)" : "var(--red)" }}>
            {formatARS(cajaStats.ganancia)}
          </span>
        </div>
      </div>
      
      <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-2)", borderBottom: "1px solid var(--border)"}}>
        {activeShift ? (
          <span style={{ fontSize: "13px", color: "var(--text-3)", fontWeight: 600, display: "flex", gap: "8px", alignItems: "center" }}>
            {!isOnline && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", display: "inline-block" }} />}
            TURNO: {activeShift.employee?.name || activeShift.employeeName || "Activo"}
          </span>
        ) : (
          <button
            className="btn btn-sm btn-green"
            style={{ fontSize: "13px", fontWeight: 700, padding: "6px 14px" }}
            onClick={() => setShowOpenShift(true)}
          >
            ▶ Abrir Turno
          </button>
        )}
        <div style={{ display: "flex", gap: "8px" }}>
           <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px"}} onClick={() => setShowScanner(true)}>
             📷
           </button>
           <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px", fontSize: "12px", color: "var(--red)" }} onClick={() => setShowCloseShift(true)} disabled={!activeShift}>
             Cerrar Caja
           </button>
        </div>
      </div>

      {/* Products grid */}
      <div style={{ padding: "8px 12px 0", display: "flex", gap: "8px" }}>
        <input
          className="input"
          placeholder="🔍 Buscar producto..."
          value={cajaSearch}
          onChange={(e) => setCajaSearch(e.target.value)}
          style={{ fontSize: "14px", height: "36px" }}
        />
        {cajaSearch && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setCajaSearch("")}
            style={{ flexShrink: 0, padding: "0 10px", height: "36px" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Products grid */}
      <div style={{ padding: "8px 12px", flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando...</div>
        ) : (
          <div className="product-grid">
            {products
              .filter((p) => !cajaSearch || p.name.toLowerCase().includes(cajaSearch.toLowerCase()))
              .map((product) => {
              const inTicket = ticket.find((i) => i.productId === product.id);
              return (
                <button
                  key={product.id}
                  className="product-btn"
                  onClick={() => handleProductTap(product)}
                  onMouseDown={() => handleLongPressStart(product)}
                  onMouseUp={handleLongPressEnd}
                  onTouchStart={() => handleLongPressStart(product)}
                  onTouchEnd={handleLongPressEnd}
                  style={inTicket ? { borderColor: "var(--primary)", background: "rgba(var(--primary-rgb, 34, 197, 94), 0.08)" } : undefined}
                >
                  {product.emoji && (
                    <span className="product-btn-emoji">{product.emoji}</span>
                  )}
                  <span className="product-btn-name">{product.name}</span>
                  <span className="product-btn-price">{formatARS(product.price)}</span>
                  {inTicket && (
                    <span
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        background: "var(--primary)",
                        color: "#000",
                        borderRadius: "99px",
                        width: "20px",
                        height: "20px",
                        fontSize: "11px",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {inTicket.quantity}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Special buttons */}
            <button
              className="product-btn product-btn-special product-btn-otro"
              onClick={() => setShowOtro(true)}
            >
              <span className="product-btn-emoji">➕</span>
              <span className="product-btn-name">OTRO</span>
            </button>
            <button
              className="product-btn product-btn-special product-btn-gasto"
              onClick={() => setShowGasto(true)}
            >
              <span className="product-btn-emoji">💸</span>
              <span className="product-btn-name">GASTO</span>
            </button>
            <button
              className="product-btn product-btn-special product-btn-retiro"
              onClick={() => setShowRetiro(true)}
            >
              <span className="product-btn-emoji">💰</span>
              <span className="product-btn-name">RETIRO</span>
            </button>
          </div>
        )}
      </div>

      {/* Separador */}
      <div className="separator" />

      {/* REPETIR */}
      {lastSale && ticket.length === 0 && (
        <>
          <button
            onClick={handleRepetir}
            style={{
              width: "100%",
              padding: "14px",
              background: "var(--surface-2)",
              border: "none",
              color: "var(--text-2)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              paddingLeft: "16px",
            }}
          >
            ↩ Repetir última venta — {lastSale.items.map((i) => i.name).join(", ")}
          </button>
          <div className="separator" />
        </>
      )}

      {/* Ticket */}
      {ticket.length > 0 && (
        <div style={{ padding: "0 16px", maxHeight: "200px", overflowY: "auto" }}>
          {ticket.map((item, idx) => (
            <div key={idx} className="ticket-item">
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => changeQty(idx, -1)}
                  style={{ width: "28px", height: "28px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "16px" }}
                >
                  −
                </button>
                <span style={{ minWidth: "20px", textAlign: "center", fontWeight: 600 }}>{item.quantity}</span>
                <button
                  onClick={() => changeQty(idx, 1)}
                  style={{ width: "28px", height: "28px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "16px" }}
                >
                  +
                </button>
                <span style={{ minWidth: "70px", textAlign: "right", fontWeight: 600 }}>
                  {formatARS(item.price * item.quantity)}
                </span>
              </div>
            </div>
          ))}
          <div className="ticket-total">
            <span>TOTAL</span>
            <span style={{ color: "var(--primary)" }}>{formatARS(total)}</span>
          </div>
        </div>
      )}

      {/* Total bar when empty */}
      {ticket.length === 0 && (
        <div style={{ padding: "14px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "14px" }}>
          Tocá un producto para empezar
        </div>
      )}

      <div className="separator" />

      {/* Payment buttons */}
      <div style={{ 
        padding: "12px", 
        display: "grid", 
        gridTemplateColumns: "repeat(3, 1fr)", 
        gap: "8px",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))"
      }} className="no-print">
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px", borderStyle: "solid" }}
          onClick={handleCashButton}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>💵</span>
          <span style={{ fontSize: "11px" }}>EFECTIVO</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px" }}
          onClick={() => handlePay("MERCADOPAGO")}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>📱</span>
          <span style={{ fontSize: "11px" }}>MP</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px" }}
          onClick={() => handlePay("TRANSFER")}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>🏦</span>
          <span style={{ fontSize: "11px" }}>TRANSF.</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px" }}
          onClick={() => handlePay("DEBIT")}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>💳</span>
          <span style={{ fontSize: "11px" }}>DÉBITO</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px" }}
          onClick={() => handlePay("CREDIT_CARD")}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>🏧</span>
          <span style={{ fontSize: "11px" }}>TARJETA</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ flexDirection: "column", gap: "2px", borderColor: "var(--amber)", color: "var(--amber)" }}
          onClick={() => setShowCredit(true)}
          disabled={total === 0}
        >
          <span style={{ fontSize: "18px" }}>📋</span>
          <span style={{ fontSize: "11px" }}>FIADO</span>
        </button>
      </div>


      {/* Modals */}
      {showGasto && (
        <GastoModal
          onClose={() => setShowGasto(false)}
          onSuccess={() => { setShowGasto(false); fetchStats(); }}
        />
      )}
      {showOtro && (
        <OtroModal
          onClose={() => setShowOtro(false)}
          onAdd={(item) => {
            setTicket((prev) => [...prev, item]);
            setShowOtro(false);
          }}
        />
      )}
      {showRetiro && (
        <RetiroModal
          onClose={() => setShowRetiro(false)}
          onSuccess={() => { setShowRetiro(false); fetchStats(); }}
        />
      )}
      {showCredit && (
        <CreditCustomerModal
          onClose={() => setShowCredit(false)}
          onSelect={(customer) => {
            setShowCredit(false);
            handlePay("CREDIT", customer.id, customer.name);
          }}
        />
      )}
      {showOpenShift && (
        <OpenShiftModal onConfirm={handleOpenShift} />
      )}
      {showCloseShift && (
        <CloseShiftModal 
          onConfirm={handleCloseShift} 
          onCancel={() => setShowCloseShift(false)} 
        />
      )}
      {showScanner && (
        <BarcodeScanner 
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
