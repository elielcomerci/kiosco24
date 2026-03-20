"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { formatARS, getCashSuggestions } from "@/lib/utils";
import NumPad from "@/components/ui/NumPad";
import ConfirmationScreen from "@/components/caja/ConfirmationScreen";
import GastoModal from "@/components/caja/GastoModal";
import OtroModal from "@/components/caja/OtroModal";
import RetiroModal from "@/components/caja/RetiroModal";
import CreditCustomerModal from "@/components/caja/CreditCustomerModal";
import CajaTotalsBreakdownModal from "@/components/caja/CajaTotalsBreakdownModal";
import MpIncomingPaymentToasts from "@/components/caja/MpIncomingPaymentToasts";
import OpenShiftModal, { type ShiftAssignee } from "@/components/turnos/OpenShiftModal";
import CloseShiftModal from "@/components/turnos/CloseShiftModal";
import TransferShiftModal from "@/components/turnos/TransferShiftModal";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import QuickRestockModal from "@/components/caja/QuickRestockModal";
import { savePendingSale } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/sync";
import { useIsDesktop } from "@/lib/hooks";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  name: string;
  barcode?: string | null;
  stock: number;
  minStock: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
  emoji?: string | null;
  categoryId?: string | null;
  stock?: number | null;
  minStock?: number | null;
  showInGrid?: boolean;
  readyForSale?: boolean;
  categoryShowInGrid?: boolean;
  variants?: Variant[];
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface TicketItem {
  productId?: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  cost?: number;
  maxStock?: number; // Para validación
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

function BarcodeActionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="1.5" height="14" rx="0.75" fill="currentColor" />
      <rect x="4" y="2" width="2" height="14" rx="1" fill="currentColor" />
      <rect x="7.5" y="2" width="1" height="14" rx="0.5" fill="currentColor" />
      <rect x="10" y="2" width="2.5" height="14" rx="1.25" fill="currentColor" />
      <rect x="14" y="2" width="1" height="14" rx="0.5" fill="currentColor" />
      <rect x="16" y="2" width="1" height="14" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function AddStockActionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3 6.5 9 3l6 3.5v5L9 15l-6-3.5v-5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 3v12M3 6.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M13.5 1.8v4M11.5 3.8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function CajaPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const isDesktop = useIsDesktop();
  const { data: session, status } = useSession();
  const userRole = (session?.user as any)?.role;
  const employeeId = (session?.user as any)?.employeeId;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cajaStats, setCajaStats] = useState<{
    enCaja: number;
    ganancia: number | null;
    hasCosts: boolean;
    openingAmount?: number;
    ventasEfectivo?: number;
    ventasMp?: number;
    ventasDebito?: number;
    ventasTransferencia?: number;
    ventasTarjeta?: number;
    ventasFiado?: number;
    totalVentas?: number;
    totalGastos?: number;
    totalRetiros?: number;
  }>({ enCaja: 0, ganancia: null, hasCosts: false });
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
  const [showTransferShift, setShowTransferShift] = useState(false);
  const [showTotalsBreakdown, setShowTotalsBreakdown] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [cajaSearch, setCajaSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [variantSelector, setVariantSelector] = useState<{ product: Product } | null>(null);
  const [isTicketExpanded, setIsTicketExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleBarcodeScanRef = useRef<(code: string) => void>(() => {});
  const keyboardScanBufferRef = useRef("");
  const keyboardScanStartedAtRef = useRef(0);
  const keyboardScanLastKeyAtRef = useRef(0);
  const pendingManualSearchRef = useRef("");
  const manualSearchTimerRef = useRef<number | null>(null);

  const isOnline = useOnlineStatus();
  const total = ticket.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cashSuggestions = getCashSuggestions(total);
  const shiftResponsibleName = activeShift?.employee?.name || activeShift?.employeeName || "Dueño";
  const canOperateCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "EMPLOYEE") {
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return true;
  }, [activeShift, employeeId, userRole]);
  const canManageCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "EMPLOYEE") {
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return true;
  }, [activeShift, employeeId, userRole]);
  const shiftLocked = Boolean(activeShift && !canOperateCurrentShift);
  const operationsDisabled = !activeShift || shiftLocked;
  const shiftLockMessage =
    userRole === "EMPLOYEE"
      ? `La caja esta a nombre de ${shiftResponsibleName}. Pedile al responsable que te transfiera el turno para poder operar.`
      : `La caja esta a nombre de ${shiftResponsibleName}. Transferi o cerra el turno para operar desde esta sesion.`;

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

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const overlayOpen =
        showGasto ||
        showOtro ||
        showRetiro ||
        showCredit ||
        showOpenShift ||
        showCloseShift ||
        showScanner ||
        showRestockModal ||
        variantSelector ||
        showCashNumpad ||
        confirmedSale;

      if (overlayOpen) {
        clearPendingManualSearch();
        resetKeyboardScannerState();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const activeEl = document.activeElement;
      const isInputFocused = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA" || activeEl?.tagName === "SELECT";

      const now = performance.now();
      const printableKey = e.key.length === 1 && /[0-9A-Za-z./\\-]/.test(e.key);

      if (printableKey) {
        const gap = now - keyboardScanLastKeyAtRef.current;
        const startNewSequence = !keyboardScanBufferRef.current || gap > 80;

        if (startNewSequence) {
          keyboardScanBufferRef.current = e.key;
          keyboardScanStartedAtRef.current = now;
        } else {
          keyboardScanBufferRef.current += e.key;
        }

        keyboardScanLastKeyAtRef.current = now;

        if (!isInputFocused) {
          pendingManualSearchRef.current += e.key;
          if (manualSearchTimerRef.current) {
            window.clearTimeout(manualSearchTimerRef.current);
          }

          manualSearchTimerRef.current = window.setTimeout(() => {
            const pending = pendingManualSearchRef.current;
            if (!pending) return;

            searchInputRef.current?.focus();
            setCajaSearch((prev) => prev + pending);
            clearPendingManualSearch();
            resetKeyboardScannerState();
          }, 85);

          e.preventDefault();
        }

        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        const buffer = keyboardScanBufferRef.current;
        const duration = keyboardScanStartedAtRef.current ? now - keyboardScanStartedAtRef.current : Infinity;
        const averageGap = buffer.length > 1 ? duration / (buffer.length - 1) : Infinity;
        const looksLikeScanner = buffer.length >= 6 && duration <= 1200 && averageGap <= 55;

        if (looksLikeScanner) {
          clearPendingManualSearch();
          resetKeyboardScannerState();
          setCajaSearch("");
          e.preventDefault();
          e.stopPropagation();
          handleBarcodeScanRef.current(buffer);
          return;
        }

        if (!isInputFocused) {
          clearPendingManualSearch();
          resetKeyboardScannerState();
        }
        return;
      }

      if (e.key === "Escape") {
        clearPendingManualSearch();
        resetKeyboardScannerState();
      }
    };
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      clearPendingManualSearch();
      resetKeyboardScannerState();
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    showGasto, showOtro, showRetiro, showCredit, showOpenShift, showCloseShift, 
    showScanner, showRestockModal, variantSelector, showCashNumpad, confirmedSale
  ]);

  // ─── Startup Logic: Onboarding & Shift ──────────────────────────────────
  useEffect(() => {
    if (status === "loading") return;
    checkOnboardingAndShift();
  }, [status, branchId]);

  const checkOnboardingAndShift = async () => {
    try {
      if (userRole !== "EMPLOYEE") {
        // 1. Check Onboarding
        const res = await fetch("/api/onboarding");
        const data = await res.json();
        if (!data.setup) {
          // Auto-setup with suggested products
          const setupRes = await fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kioscoName: "Mi Kiosco" })
          });
          await setupRes.json();
        }
      }

      // 2. Fetch dependencies
      await fetchProducts();
      await fetchStats();

      // 3. Check Active Shift
      await fetchActiveShift();
    } catch {
      setLoading(false);
    }
  };

  const explainShiftLock = () => {
    alert(`La caja está a nombre de ${shiftResponsibleName}. Transferí o cerrá el turno para operar con este usuario.`);
  };

  const resetKeyboardScannerState = useCallback(() => {
    keyboardScanBufferRef.current = "";
    keyboardScanStartedAtRef.current = 0;
    keyboardScanLastKeyAtRef.current = 0;
  }, []);

  const clearPendingManualSearch = useCallback(() => {
    pendingManualSearchRef.current = "";
    if (manualSearchTimerRef.current) {
      window.clearTimeout(manualSearchTimerRef.current);
      manualSearchTimerRef.current = null;
    }
  }, []);

  const handleOpenShift = async ({ openingAmount, assignee }: { openingAmount: number; assignee: ShiftAssignee }) => {
    const res = await fetch("/api/turnos", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-branch-id": branchId
      },
      body: JSON.stringify({ openingAmount, employeeId: assignee.employeeId }),
    });
    if (res.ok) {
      const shift = await res.json();
      setActiveShift(shift);
      setShowOpenShift(false);
      fetchStats();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo abrir el turno.");
    }
  };

  const handleCloseShift = async (amount: number, note: string) => {
    if (!activeShift) return;
    if (!canManageCurrentShift) {
      explainShiftLock();
      return;
    }
    const res = await fetch(`/api/turnos/${activeShift.id}/cerrar`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-branch-id": branchId
      },
      body: JSON.stringify({ closingAmount: amount, note }),
    });
    if (res.ok) {
      setActiveShift(null);
      setShowCloseShift(false);
      setShowOpenShift(true);
      fetchStats();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo cerrar el turno.");
    }
  };

  const handleTransferShift = async (assignee: ShiftAssignee) => {
    if (!activeShift) return;
    if (!canManageCurrentShift) {
      explainShiftLock();
      return;
    }

    const res = await fetch(`/api/turnos/${activeShift.id}/transferir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-branch-id": branchId,
      },
      body: JSON.stringify({ employeeId: assignee.employeeId }),
    });

    if (res.ok) {
      const nextShift = await res.json();
      setActiveShift(nextShift);
      setShowTransferShift(false);
      setTicket([]);
      setReceivedAmount("");
      fetchStats();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo transferir el turno.");
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/productos`, {
        headers: { "x-branch-id": branchId }
      });
      const data = await res.json();
      setProducts(data);

      const catRes = await fetch(`/api/categorias`, {
        headers: { "x-branch-id": branchId }
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(Array.isArray(catData) ? catData : []);
      }
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

  const fetchActiveShift = useCallback(async () => {
    try {
      const shiftRes = await fetch(`/api/turnos`, {
        headers: { "x-branch-id": branchId }
      });

      if (!shiftRes.ok) {
        return;
      }

      const shiftData = await shiftRes.json();
      if (shiftData) {
        setActiveShift(shiftData);
        setShowOpenShift(false);
      } else {
        setActiveShift(null);
        setShowTransferShift(false);
        setShowCloseShift(false);
        setShowOpenShift(true);
      }
    } catch {}
  }, [branchId]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const refreshShift = () => {
      void fetchActiveShift();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshShift();
      }
    };

    const intervalId = window.setInterval(refreshShift, 8000);
    window.addEventListener("focus", refreshShift);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshShift);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchActiveShift, status]);

  // ─── Product tap ─────────────────────────────────────────────────────────
  const ensureCanOperateCurrentShift = () => {
    if (!activeShift) {
      alert("Abrí un turno para operar.");
      return false;
    }

    if (!canOperateCurrentShift) {
      explainShiftLock();
      return false;
    }

    return true;
  };

  const handleProductTap = useCallback((product: Product, variant?: Variant) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

    // Si el producto tiene variantes y NO se pasó una variante específica, abrir selector
    if (product.variants && product.variants.length > 0 && !variant) {
      setVariantSelector({ product });
      return;
    }

    const targetId = variant ? variant.id : product.id;
    const targetName = variant ? `${product.name} - ${variant.name}` : product.name;
    const targetStock = variant ? variant.stock : (product.stock ?? 999999);

    setTicket((prev) => {
      const existing = prev.find((i) => (variant ? i.variantId === variant.id : i.productId === product.id));
      
      if (existing) {
        if (existing.quantity >= targetStock) {
          alert(`No hay más stock de ${targetName}`);
          return prev;
        }
        return prev.map((i) =>
          (variant ? i.variantId === variant.id : i.productId === product.id)
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      if (targetStock <= 0) {
        alert(`${targetName} no tiene stock disponible`);
        return prev;
      }

      return [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id,
          name: targetName,
          price: product.price,
          quantity: 1,
          maxStock: targetStock
        },
      ];
    });

    if (variant) setVariantSelector(null);
  }, [activeShift, canOperateCurrentShift]);

  // Long press = -1
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const handleLongPressStart = (product: Product) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

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
    if (!ensureCanOperateCurrentShift()) {
      return;
    }
    if (!lastSale) return;
    setTicket(lastSale.items.map((i) => ({ ...i })));
  };

  // ─── Payment ──────────────────────────────────────────────────────────────
  const handlePay = async (method: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT", creditCustomerId?: string, creditCustomerName?: string) => {
    if (!ensureCanOperateCurrentShift()) return;

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
          createdByEmployeeId: employeeId,
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

            if (!res.ok) {
              const errorText = await res.text().catch(() => "");
              let serverMessage = "";
              try {
                const parsed = JSON.parse(errorText);
                if (parsed && typeof parsed.error === "string") {
                  serverMessage = parsed.error;
                }
              } catch {}
              console.error("[Ventas] Error HTTP registrando venta:", res.status, errorText);
              alert(serverMessage || "No se pudo registrar la venta en el servidor. Intentá de nuevo en unos segundos.");
              return;
            }

          const sale = await res.json();
          newSale.id = sale.id;
        } else {
          // OFFLINE SAVE (sin conexión)
          try {
            await savePendingSale(reqBody);
            alert("Estás sin conexión. La venta se guardó como pendiente para sincronizar.");
          } catch (err: any) {
            console.error("[Ventas] Error guardando venta offline:", err);
            const message = typeof err?.message === "string" ? err.message.toLowerCase() : "";
            const name = (err as any)?.name || "";
            const isQuota =
              name === "QuotaExceededError" ||
              message.includes("quota") ||
              message.includes("storage") ||
              message.includes("no space");

            if (isQuota) {
              alert("No se pudo guardar la venta: no hay espacio en el dispositivo. Liberá espacio y anotá esta venta manualmente.");
            } else {
              alert("Error inesperado al guardar la venta offline. Anotá esta venta manualmente.");
            }
            return;
          }
        }

        setLastSale(newSale);
        setConfirmedSale({ ...newSale, ...(received ? { receivedAmount: received } as any : {}) });
        setTicket([]);
      setReceivedAmount("");
      setShowCashNumpad(false);
      fetchStats();
    } catch (err: any) {
      console.error("[Ventas] Error de red o inesperado al registrar venta:", err);

      // Fallback: intentar guardar como pendiente aunque pensáramos que había conexión
      try {
        await savePendingSale({
          items: ticket,
          total,
          paymentMethod: method,
          receivedAmount: received,
          creditCustomerId,
          createdByEmployeeId: employeeId,
        });
        alert("Hubo un problema de conexión. La venta se guardó como pendiente para sincronizar.");
      } catch (inner: any) {
        console.error("[Ventas] Error adicional al guardar venta offline en fallback:", inner);
        const message = typeof inner?.message === "string" ? inner.message.toLowerCase() : "";
        const name = (inner as any)?.name || "";
        const isQuota =
          name === "QuotaExceededError" ||
          message.includes("quota") ||
          message.includes("storage") ||
          message.includes("no space");

        if (isQuota) {
          alert("No se pudo guardar la venta: no hay espacio en el dispositivo. Liberá espacio y anotá esta venta manualmente.");
        } else {
          alert("Error inesperado. Esta venta no quedó guardada, anotala manualmente.");
        }
      }
    }
  };

  // ─── CORREGIR ─────────────────────────────────────────────────────────────
  const handleCorregir = () => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }
    if (!confirmedSale) return;
    setTicket(confirmedSale.items.map((i) => ({ ...i })));
    setConfirmedSale(null);
    if (confirmedSale.id && isOnline) {
      fetch(`/api/ventas/${confirmedSale.id}/anular`, { method: "POST" });
      fetchStats();
    }
  };

  // ─── Barcode handling ─────────────────────────────────────────────────────
  const sellableProducts = useMemo(
    () => products.filter((product) => product.showInGrid !== false && product.readyForSale !== false),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let res = sellableProducts;
    if (activeCategory) res = res.filter(p => p.categoryId === activeCategory);
    if (cajaSearch) {
      const q = cajaSearch.toLowerCase();
      res = res.filter(p => p.name.toLowerCase().includes(q) || p.barcode === q);
    }
    return res;
  }, [sellableProducts, activeCategory, cajaSearch]);

  const handleBarcodeScan = useCallback((result: string) => {
    // 1. Buscar en productos base
    const product = sellableProducts.find(p => p.barcode === result);
    if (product) {
      handleProductTap(product);
      setShowScanner(false);
      return;
    }

    // 2. Buscar en variantes de todos los productos
    for (const p of sellableProducts) {
      if (p.variants) {
        const variant = p.variants.find(v => v.barcode === result);
        if (variant) {
          handleProductTap(p, variant);
          setShowScanner(false);
          return;
        }
      }
    }

    // Not found
    alert(`Código ${result} no encontrado.`);
  }, [handleProductTap, sellableProducts]);
  handleBarcodeScanRef.current = handleBarcodeScan;

  // ─── Ticket item controls ─────────────────────────────────────────────────
  const changeQty = (index: number, delta: number) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

    setTicket((prev) => {
      const newTicket = [...prev];
      const item = newTicket[index];
      
      if (delta > 0 && item.maxStock !== undefined && item.quantity >= item.maxStock) {
        alert("Stock máximo alcanzado");
        return prev;
      }

      newTicket[index] = { ...item, quantity: item.quantity + delta };
      if (newTicket[index].quantity <= 0) newTicket.splice(index, 1);
      return newTicket;
    });
  };

  // ─── Cash numpad ──────────────────────────────────────────────────────────
  const handleCashButton = () => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

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

        {cashSuggestions.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {cashSuggestions.map((s) => (
              <button
                key={s}
                className="btn btn-sm btn-ghost"
                style={{ flex: 1, minWidth: "0", fontSize: "13px" }}
                onClick={() => setReceivedAmount(String(s))}
              >
                {formatARS(s)}
              </button>
            ))}
          </div>
        )}

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

  useEffect(() => {
    setSelectedIndex(0);
  }, [cajaSearch, activeCategory]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cajaSearch && filteredProducts.length > 0) {
        handleProductTap(filteredProducts[selectedIndex]);
        setCajaSearch("");
        setSelectedIndex(0);
      } else if (!cajaSearch && ticket.length > 0) {
        handleCashButton(); // Quick checkout shortcut!
      }
    }
  };

  // ─── Main caja screen ─────────────────────────────────────────────────────
  return (
    <div className="pos-layout">

      {/* Status Bar */}
      <div className="status-bar">
        <button
          type="button"
          className="status-bar-item"
          onClick={() => setShowTotalsBreakdown(true)}
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
          title="Ver desglose de caja"
        >
          <span className="status-bar-label">En Caja</span>
          <span className="status-bar-value" style={{ color: "var(--primary)" }}>
            {formatARS(cajaStats.enCaja)}
          </span>
        </button>
        <div className="separator" style={{ width: "1px", height: "32px", background: "var(--border-2)" }} />
        <div className="status-bar-item" style={{ alignItems: "flex-end" }}>
          <span className="status-bar-label">Ganancia estimada</span>
          <span className="status-bar-value" style={{ color: cajaStats.ganancia !== null && cajaStats.ganancia >= 0 ? "var(--primary)" : "var(--red)" }}>
            {cajaStats.ganancia !== null ? formatARS(cajaStats.ganancia) : "—"}
          </span>
        </div>
      </div>
      
      {/* Header */}
      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
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
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginLeft: "auto" }}>
           <button className="btn btn-sm btn-primary" aria-label="Escanear" title="Escanear" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px 14px", minHeight: "42px", minWidth: "120px", fontSize: 0, fontWeight: 700 }} onClick={() => setShowScanner(true)} disabled={operationsDisabled}>
             <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", lineHeight: 1 }}>
               <BarcodeActionIcon />
               Escanear
             </span>
             📷
           </button>
           <button 
             className="btn btn-sm btn-ghost" 
             style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px 14px", minHeight: "42px", minWidth: "150px", fontSize: 0, color: "var(--text)", fontWeight: 700 }} 
             onClick={() => setShowRestockModal(true)}
              disabled={operationsDisabled}
           >
             <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", lineHeight: 1, color: "var(--text)" }}>
               <AddStockActionIcon />
               Agregar stock
             </span>
             📦 Recepción
           </button>
           {activeShift && canManageCurrentShift && (
             <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setShowTransferShift(true)}>
               Transferir
             </button>
           )}
           <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px", fontSize: "12px", color: "var(--red)" }} onClick={() => setShowCloseShift(true)} disabled={!activeShift || !canManageCurrentShift}>
             Cerrar Caja
           </button>
        </div>
      </div>

      {shiftLocked && (
        <div
          style={{
            margin: "12px 16px 0",
            padding: "12px 14px",
            borderRadius: "14px",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            background: "rgba(245, 158, 11, 0.12)",
            color: "var(--text)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {shiftLockMessage}
        </div>
      )}


      {/* POS BODY (Row on Desktop, Column on Mobile) */}
      <div className="pos-body">
        
        {/* Main Content Area (Scrollable) */}
        <div className="pos-main no-print">
        
        {/* Search bar */}
        <div style={{ padding: "12px 16px 0", display: "flex", gap: "8px", flexShrink: 0 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px" }}>🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar producto o código de barras..."
              value={cajaSearch}
              onChange={(e) => setCajaSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              style={{
                width: "100%",
                padding: "12px 12px 12px 36px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text)",
                fontSize: "14px",
                outline: "none"
              }}
            />
            {cajaSearch && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCajaSearch("")}
                style={{ flexShrink: 0, padding: "0 10px", height: "36px", position: "absolute", right: "0", top: "50%", transform: "translateY(-50%)" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {isDesktop && (
          <div style={{ padding: "6px 16px 0", color: "var(--text-3)", fontSize: "12px" }}>
            Acepta lectora USB: escaneÃ¡ y el producto entra directo sin tocar el buscador.
          </div>
        )}

      {/* Category Filter Pills (Scrollable Horizontal) */}
      {categories.length > 0 && (
        <div style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px 0",
          overflowX: "auto",
          whiteSpace: "nowrap",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: `1px solid ${activeCategory === null ? "var(--primary)" : "var(--border)"}`,
              background: activeCategory === null ? "var(--primary)" : "var(--surface)",
              color: activeCategory === null ? "white" : "var(--text-2)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                border: `1px solid ${activeCategory === c.id ? c.color || "var(--primary)" : "var(--border)"}`,
                background: activeCategory === c.id ? c.color || "var(--primary)" : "var(--surface)",
                color: activeCategory === c.id ? "white" : "var(--text-2)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {activeCategory !== c.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color || "var(--text-3)" }} />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "14px", padding: "40px 0" }}>
          No hay productos
        </div>
      ) : (
        <div className="product-grid" style={{ padding: "0 16px 16px", paddingBottom: "100px", alignContent: "start" }}>
          {filteredProducts.map((product, i) => {
            const inTicket = ticket.find((t) => t.productId === product.id && !t.variantId);
            const isSelected = i === selectedIndex && cajaSearch.length > 0;
            
            return (
              <button
                key={product.id}
                className="product-btn"
                ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: 'nearest' }); }}
                onClick={() => handleProductTap(product)}
                onMouseDown={() => handleLongPressStart(product)}
                onMouseUp={handleLongPressEnd}
                onTouchStart={() => handleLongPressStart(product)}
                onTouchEnd={handleLongPressEnd}
                disabled={operationsDisabled}
                style={
                  inTicket 
                  ? { borderColor: "var(--primary)", background: "rgba(var(--primary-rgb, 34, 197, 94), 0.08)", fontSize: "13px", ...(isSelected ? { outline: "2px solid var(--primary)", transform: "scale(1.02)" } : {}) } 
                  : { fontSize: "13px", ...(isSelected ? { outline: "2px solid var(--text)", transform: "scale(1.02)" } : {}) }
                }
              >
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
        </div>
      )}
      </div> {/* End of HTML Main Content Area */}


      {/* Sidebar / Bottom Block (Fixed) */}
      <div className="pos-sidebar no-print">
        
        {/* Ticket Header / Summary */}
        {ticket.length > 0 ? (
          <div 
            onClick={() => setIsTicketExpanded(!isTicketExpanded)}
            style={{ 
              padding: "12px 16px", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              cursor: "pointer",
              background: "var(--surface-2)" 
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>({ticket.length} {ticket.length === 1 ? 'ítem' : 'ítems'})</span>
              <span style={{ fontSize: "10px", color: "var(--text-3)" }}>{isTicketExpanded ? '▲' : '▼'}</span>
            </div>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--primary)" }}>{formatARS(total)}</span>
          </div>
        ) : (
          <div style={{ padding: "14px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "14px", background: "var(--surface-2)" }}>
            Tocá un producto para empezar
          </div>
        )}

        {/* Collapsible Ticket Detail */}
        {ticket.length > 0 && (isTicketExpanded || isDesktop) && (
          <div className="desktop-ticket-scroll" style={{ padding: "0 16px", maxHeight: "40vh", overflowY: "auto", borderTop: "1px solid var(--border)" }}>
            {ticket.map((item, idx) => (
              <div key={idx} className="ticket-item">
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); changeQty(idx, -1); }}
                    disabled={operationsDisabled}
                    style={{ width: "28px", height: "28px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "16px" }}
                  >
                    −
                  </button>
                  <span style={{ minWidth: "20px", textAlign: "center", fontWeight: 600 }}>{item.quantity}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); changeQty(idx, 1); }}
                    disabled={operationsDisabled}
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
            {lastSale && ticket.length > 0 && (
              <div style={{ marginTop: "8px", marginBottom: "8px" }}>
                <button
                  onClick={handleRepetir}
                  disabled={operationsDisabled}
                  style={{ width: "100%", padding: "10px", background: "var(--surface-3)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", color: "var(--text-2)", fontSize: "13px", fontWeight: 600 }}
                >
                  ↩ Repetir última venta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Separator / Border */}
        <div style={{ height: "1px", background: "var(--border)", width: "100%" }} />

        {/* Secondary Actions: OTRO, GASTO, RETIRO */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(3, 1fr)", 
          gap: "8px", 
          padding: "8px 12px",
          background: "var(--surface)"
        }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ fontSize: "12px", color: "var(--text-2)", border: "1px solid var(--border)" }}
            onClick={() => {
              if (!ensureCanOperateCurrentShift()) return;
              setShowOtro(true);
            }}
            disabled={operationsDisabled}
          >
            ➕ OTRO
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ fontSize: "12px", color: "var(--text-2)", border: "1px solid var(--border)" }}
            onClick={() => {
              if (!ensureCanOperateCurrentShift()) return;
              setShowGasto(true);
            }}
            disabled={operationsDisabled}
          >
            💸 GASTO
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ fontSize: "12px", color: "var(--text-2)", border: "1px solid var(--border)" }}
            onClick={() => {
              if (!ensureCanOperateCurrentShift()) return;
              setShowRetiro(true);
            }}
            disabled={operationsDisabled}
          >
            💰 RETIRO
          </button>
        </div>

        {/* Payment Methods Grid */}
        <div style={{ 
          padding: "8px 12px 12px", 
          display: "grid", 
          gridTemplateColumns: "repeat(3, 1fr)", 
          gap: "8px",
          background: "var(--surface)"
        }}>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", borderStyle: "solid", height: "54px" }}
            onClick={handleCashButton}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>💵</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>EFECTIVO</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", height: "54px" }}
            onClick={() => handlePay("MERCADOPAGO")}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>📱</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>MP</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", height: "54px" }}
            onClick={() => handlePay("TRANSFER")}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>🏦</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>TRANSF.</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", height: "54px" }}
            onClick={() => handlePay("DEBIT")}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>💳</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>DÉBITO</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", height: "54px" }}
            onClick={() => handlePay("CREDIT_CARD")}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>🏧</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>TARJETA</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ flexDirection: "column", gap: "2px", borderColor: "var(--amber)", color: "var(--amber)", height: "54px" }}
            onClick={() => {
              if (!ensureCanOperateCurrentShift()) return;
              setShowCredit(true);
            }}
            disabled={total === 0 || operationsDisabled}
          >
            <span style={{ fontSize: "18px" }}>📋</span>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>FIADO</span>
          </button>
        </div>
      </div> {/* End of POS Sidebar */}

      </div> {/* End of POS BODY */}

      {/* Modals */}
      {showGasto && (
        <GastoModal
          employeeId={employeeId}
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
          employeeId={employeeId}
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
      {showCloseShift && activeShift && (
        <CloseShiftModal 
          onConfirm={handleCloseShift} 
          onCancel={() => setShowCloseShift(false)}
          summary={{
            openingAmount: cajaStats.openingAmount ?? activeShift.openingAmount ?? 0,
            ventasEfectivo: cajaStats.ventasEfectivo ?? 0,
            gastos: cajaStats.totalGastos ?? 0,
            retiros: cajaStats.totalRetiros ?? 0,
            expectedAmount: cajaStats.enCaja,
          }}
        />
      )}
      {showTransferShift && activeShift && (
        <TransferShiftModal
          currentResponsibleName={shiftResponsibleName}
          onConfirm={handleTransferShift}
          onCancel={() => setShowTransferShift(false)}
        />
      )}
      {showScanner && (
        <BarcodeScanner 
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
      {showTotalsBreakdown && (
        <CajaTotalsBreakdownModal
          stats={cajaStats}
          onClose={() => setShowTotalsBreakdown(false)}
        />
      )}

      {/* Variant Selector Modal */}
      {variantSelector && (
        <div className="modal-overlay animate-fade-in" onClick={() => setVariantSelector(null)} style={{ zIndex: 10000 }}>
          <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px", width: "95%", maxHeight: "80vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Seleccionar {variantSelector.product.name}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {variantSelector.product.variants?.map((v) => (
                <button
                  key={v.id}
                  className="btn btn-ghost"
                  style={{ justifyContent: "space-between", padding: "16px", borderRadius: "12px", background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  onClick={() => handleProductTap(variantSelector.product, v)}
                  disabled={v.stock <= 0}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Stock: {v.stock}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--primary)" }}>{formatARS(variantSelector.product.price)}</div>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: "16px" }} onClick={() => setVariantSelector(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {showRestockModal && (
          <QuickRestockModal
            products={products}
            branchId={branchId}
            employeeId={employeeId}
            onClose={() => setShowRestockModal(false)}
            onSuccess={() => {
            setShowRestockModal(false);
            fetchProducts(); // Refresh stock immediately
          }}
        />
      )}
      <MpIncomingPaymentToasts
        branchId={branchId}
        enabled={Boolean(activeShift && (userRole === "OWNER" || canOperateCurrentShift))}
      />
    </div>
  );
}
