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
import ModalPortal from "@/components/ui/ModalPortal";
import TicketModal from "@/components/ticket/TicketModal";
import InvoiceModal from "@/components/fiscal/InvoiceModal";
import type { InvoicePreviewData } from "@/lib/invoice-format";

import { savePendingSale } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/sync";
import { useIsDesktop } from "@/lib/hooks";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  name: string;
  barcode?: string | null;
  stock: number;
  availableStock?: number | null;
  minStock: number;
  isNegativeStock?: boolean;
  isOutOfStock?: boolean;
  isBelowMinStock?: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
  emoji?: string | null;
  categoryId?: string | null;
  stock?: number | null;
  availableStock?: number | null;
  minStock?: number | null;
  showInGrid?: boolean;
  readyForSale?: boolean;
  allowNegativeStock?: boolean;
  isNegativeStock?: boolean;
  isOutOfStock?: boolean;
  isBelowMinStock?: boolean;
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
  ticketNumber?: number | null;
  total: number;
  paymentMethod: "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT";
  items: TicketItem[];
  creditCustomerName?: string;
  receivedAmount?: number;
}

interface InvoiceDraft {
  docType: number;
  docNro: string;
  receiverName: string;
  receiverIvaConditionId: number | null;
}

interface ActiveShift {
  id: string;
  openingAmount: number;
  employeeId: string | null;
  employeeName: string;
  employee?: {
    id: string;
    name: string;
  } | null;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

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

function getVariantStockBadge(variant: Variant) {
  if (variant.isNegativeStock) {
    return {
      label: "Stock negativo",
      color: "var(--red)",
      background: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.24)",
    };
  }

  if (variant.isOutOfStock) {
    return {
      label: "Sin stock",
      color: "var(--text-2)",
      background: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.22)",
    };
  }

  if (variant.isBelowMinStock) {
    return {
      label: "Stock bajo",
      color: "var(--amber)",
      background: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.24)",
    };
  }

  return null;
}

function getProductStockBadge(product: Product) {
  if (product.variants && product.variants.length > 0) {
    const negativeCount = product.variants.filter((variant) => variant.isNegativeStock).length;
    const outCount = product.variants.filter((variant) => variant.isOutOfStock).length;
    const lowCount = product.variants.filter((variant) => variant.isBelowMinStock).length;

    if (negativeCount > 0) {
      return {
        label: `${negativeCount} en negativo`,
        color: "var(--red)",
        background: "rgba(239,68,68,0.12)",
        border: "rgba(239,68,68,0.24)",
      };
    }

    if (outCount > 0) {
      return {
        label: `${outCount} sin stock`,
        color: "var(--text-2)",
        background: "rgba(148,163,184,0.14)",
        border: "rgba(148,163,184,0.22)",
      };
    }

    if (lowCount > 0) {
      return {
        label: `${lowCount} bajo mínimo`,
        color: "var(--amber)",
        background: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.24)",
      };
    }

    return null;
  }

  if (product.isNegativeStock) {
    return {
      label: "Stock negativo",
      color: "var(--red)",
      background: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.24)",
    };
  }

  if (product.isOutOfStock) {
    return {
      label: "Sin stock",
      color: "var(--text-2)",
      background: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.22)",
    };
  }

  if (product.isBelowMinStock) {
    return {
      label: "Stock bajo",
      color: "var(--amber)",
      background: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.24)",
    };
  }

  return null;
}

function createClientSaleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CajaPage() {
  const params = useParams();
  const branchId = params.branchId as string;
  const isDesktop = useIsDesktop();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;
  const employeeId = session?.user?.employeeId;
  const isCashier = userRole === "EMPLOYEE" && session?.user?.employeeRole === "CASHIER";
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ticket, setTicket] = useState<TicketItem[]>([]);
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
  const [ticketSaleId, setTicketSaleId] = useState<string | null>(null);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [showInvoiceDraftModal, setShowInvoiceDraftModal] = useState(false);
  const [confirmedInvoice, setConfirmedInvoice] = useState<InvoicePreviewData | null>(null);
  const [showGasto, setShowGasto] = useState(false);
  const [showOtro, setShowOtro] = useState(false);
  const [showRetiro, setShowRetiro] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [showCashNumpad, setShowCashNumpad] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showTransferShift, setShowTransferShift] = useState(false);
  const [showTotalsBreakdown, setShowTotalsBreakdown] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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
  const allowNegativeStock = products[0]?.allowNegativeStock ?? false;
  const total = ticket.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cashSuggestions = getCashSuggestions(total);
  const shiftResponsibleName = activeShift?.employee?.name || activeShift?.employeeName || "Dueño";
  const canOperateCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "EMPLOYEE") {
      // Solo el responsable puede operar (vender/gastar)
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return true;
  }, [activeShift, employeeId, userRole]);

  const canManageCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "OWNER") return true;
    if (userRole === "EMPLOYEE") {
      // El responsable O un encargado pueden gestionar el turno (cerrar/transferir)
      if (session?.user?.employeeRole === "MANAGER") return true;
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return false;
  }, [activeShift, employeeId, userRole, session?.user?.employeeRole]);
  const shiftLocked = Boolean(activeShift && !canOperateCurrentShift);
  const operationsDisabled = !activeShift || shiftLocked;
  
  const shiftLockMessage = useMemo(() => {
    if (!activeShift || !shiftLocked) return null;
    
    if (session?.user?.employeeRole === "MANAGER") {
      return `La caja esta a nombre de ${shiftResponsibleName}. Sos Encargado, podés cerrar o transferir este turno si es necesario.`;
    }
    
    if (userRole === "EMPLOYEE") {
      return `La caja esta a nombre de ${shiftResponsibleName}. Pedile al responsable que te transfiera el turno para poder operar.`;
    }
    
    return `La caja esta a nombre de ${shiftResponsibleName}. Transferí o cerrá el turno para operar desde esta sesión.`;
  }, [activeShift, shiftLocked, session?.user?.employeeRole, userRole, shiftResponsibleName]);

  // ─── WakeLock Logic ───────────────────────────────────────────────────────
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    const wakeLockNavigator = navigator as NavigatorWithWakeLock;
    const wakeLock = wakeLockNavigator.wakeLock;

    if (activeShift && wakeLock) {
      const requestWakeLock = async () => {
        try {
          wakeLockRef.current = await wakeLock.request("screen");
        } catch {}
      };
      void requestWakeLock();
    } else if (!activeShift && wakeLockRef.current) {
      void wakeLockRef.current.release().then(() => {
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
        variantSelector ||
        showCashNumpad ||
        confirmedSale ||
        showInvoiceDraftModal ||
        invoiceSaleId;

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
    showScanner, variantSelector, showCashNumpad, confirmedSale, showInvoiceDraftModal, invoiceSaleId
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

  const getSelectionAvailableStock = (product: Product, variant?: Variant) =>
    variant
      ? (variant.availableStock ?? variant.stock ?? 0)
      : (product.availableStock ?? product.stock ?? 0);

  const getItemAvailableStock = (item: TicketItem) => {
    const product = item.productId ? products.find((candidate) => candidate.id === item.productId) : null;
    if (!product) return null;

    if (item.variantId) {
      const variant = product.variants?.find((candidate) => candidate.id === item.variantId);
      return variant ? (variant.availableStock ?? variant.stock ?? 0) : null;
    }

    return product.availableStock ?? product.stock ?? 0;
  };

  const shouldWarnNegativeStock = (availableStock: number, previousQuantity: number, nextQuantity: number) => {
    if (!allowNegativeStock || nextQuantity <= previousQuantity) return false;
    if (availableStock <= 0) return previousQuantity === 0 && nextQuantity > 0;
    return previousQuantity <= availableStock && nextQuantity > availableStock;
  };

  const confirmNegativeStock = (itemName: string, availableStock: number, nextQuantity: number) => {
    const projectedStock = availableStock - nextQuantity;
    return window.confirm(
      `${itemName} no tiene stock cargado suficiente.\n\n` +
      `Stock disponible: ${availableStock}.\n` +
      `En el ticket: ${nextQuantity}.\n` +
      `Quedaria en ${projectedStock}.\n\n` +
      "Confirma solo si el producto ya esta en el local y falta cargarlo.",
    );
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

    const targetName = variant ? `${product.name} - ${variant.name}` : product.name;
    const targetStock = getSelectionAvailableStock(product, variant);
    const existing = ticket.find((item) => (variant ? item.variantId === variant.id : item.productId === product.id));
    const previousQuantity = existing?.quantity ?? 0;
    const nextQuantity = previousQuantity + 1;

    if (!allowNegativeStock && existing && existing.quantity >= targetStock) {
      alert(`No hay mÃ¡s stock de ${targetName}`);
      return;
    }

    if (!allowNegativeStock && targetStock <= 0) {
      alert(`${targetName} no tiene stock disponible`);
      return;
    }

    if (shouldWarnNegativeStock(targetStock, previousQuantity, nextQuantity) && !confirmNegativeStock(targetName, targetStock, nextQuantity)) {
      return;
    }

    setTicket((prev) => {
      if (existing) {
        if (!allowNegativeStock && existing.quantity >= targetStock) {
          alert(`No hay más stock de ${targetName}`);
          return prev;
        }
        return prev.map((item) =>
          (variant ? item.variantId === variant.id : item.productId === product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      if (!allowNegativeStock && targetStock <= 0) {
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
          maxStock: allowNegativeStock ? undefined : targetStock
        },
      ];
    });

    if (variant) setVariantSelector(null);
  }, [activeShift, allowNegativeStock, canOperateCurrentShift, ticket]);

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
    const clientSaleId = createClientSaleId();
    const reqBody = {
      items: ticket,
      total,
      paymentMethod: method,
      receivedAmount: received,
      creditCustomerId,
      createdByEmployeeId: employeeId,
      clientSaleId,
      branchId,
    };

    try {
        const newSale: Sale = {
          id: "", // Will be set if online
          ticketNumber: null,
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
          newSale.ticketNumber = typeof sale.ticketNumber === "number" ? sale.ticketNumber : null;
        } else {
          // OFFLINE SAVE (sin conexión)
          try {
            await savePendingSale(reqBody);
            alert("Estás sin conexión. La venta se guardó como pendiente para sincronizar.");
          } catch (err: unknown) {
            console.error("[Ventas] Error guardando venta offline:", err);
            const message =
              err instanceof Error && typeof err.message === "string" ? err.message.toLowerCase() : "";
            const name = err instanceof Error ? err.name : "";
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
        setConfirmedSale({ ...newSale, ...(received ? { receivedAmount: received } : {}) });
        setConfirmedInvoice(null);
        if (invoiceDraft && newSale.id) {
          setInvoiceSaleId(newSale.id);
        } else {
          setInvoiceSaleId(null);
          if (invoiceDraft) {
            alert("La venta quedo registrada, pero la factura solo se puede emitir con conexion.");
          }
        }
        setTicket([]);
      setReceivedAmount("");
      setShowCashNumpad(false);
      fetchStats();
    } catch (err: unknown) {
      console.error("[Ventas] Error de red o inesperado al registrar venta:", err);

      // Fallback: intentar guardar como pendiente aunque pensáramos que había conexión
      try {
        await savePendingSale(reqBody);
        alert("Hubo un problema de conexión. La venta se guardó como pendiente para sincronizar.");
      } catch (inner: unknown) {
        console.error("[Ventas] Error adicional al guardar venta offline en fallback:", inner);
        const message =
          inner instanceof Error && typeof inner.message === "string" ? inner.message.toLowerCase() : "";
        const name = inner instanceof Error ? inner.name : "";
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
    if (confirmedInvoice?.status === "ISSUED") {
      alert("Esta venta ya tiene una factura emitida. En esta version no se puede corregir sin nota de credito.");
      return;
    }
    setTicketSaleId(null);
    setInvoiceSaleId(null);
    setTicket(confirmedSale.items.map((i) => ({ ...i })));
    setConfirmedSale(null);
    setConfirmedInvoice(null);
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
    setShowScanner(false);

    // 1. Buscar en productos base
    const product = sellableProducts.find(p => p.barcode === result);
    if (product) {
      handleProductTap(product);
      return;
    }

    // 2. Buscar en variantes de todos los productos
    for (const p of sellableProducts) {
      if (p.variants) {
        const variant = p.variants.find(v => v.barcode === result);
        if (variant) {
          handleProductTap(p, variant);
          return;
        }
      }
    }

    // Not found
    window.setTimeout(() => {
      alert(`Codigo ${result} no encontrado.`);
    }, 0);
    return;
    alert(`Código ${result} no encontrado.`);
  }, [handleProductTap, sellableProducts]);
  handleBarcodeScanRef.current = handleBarcodeScan;

  // ─── Ticket item controls ─────────────────────────────────────────────────
  const changeQty = (index: number, delta: number) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

    const ticketItem = ticket[index];
    if (!ticketItem) return;

    const availableStock = getItemAvailableStock(ticketItem);
    const nextQuantity = ticketItem.quantity + delta;

    if (!allowNegativeStock && delta > 0 && ticketItem.maxStock !== undefined && ticketItem.quantity >= ticketItem.maxStock) {
      alert("Stock mÃ¡ximo alcanzado");
      return;
    }

    if (
      delta > 0 &&
      availableStock !== null &&
      shouldWarnNegativeStock(availableStock, ticketItem.quantity, nextQuantity) &&
      !confirmNegativeStock(ticketItem.name, availableStock, nextQuantity)
    ) {
      return;
    }

    setTicket((prev) => {
      const newTicket = [...prev];
      const item = newTicket[index];

      if (!allowNegativeStock && delta > 0 && item.maxStock !== undefined && item.quantity >= item.maxStock) {
        alert("Stock máximo alcanzado");
        return prev;
      }

      newTicket[index] = { ...item, quantity: item.quantity + delta };
      if (newTicket[index].quantity <= 0) newTicket.splice(index, 1);
      return newTicket;
    });
  };

  const [editingQty, setEditingQty] = useState<{ index: number; draft: string } | null>(null);

  const commitQtyEdit = (index: number, rawValue: string) => {
    const parsed = parseInt(rawValue, 10);
    const ticketItem = ticket[index];
    setEditingQty(null);
    if (!rawValue.trim() || isNaN(parsed) || parsed <= 0) {
      setTicket((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    if (!ticketItem) return;

    const availableStock = getItemAvailableStock(ticketItem);
    if (
      allowNegativeStock &&
      availableStock !== null &&
      shouldWarnNegativeStock(availableStock, ticketItem.quantity, parsed) &&
      !confirmNegativeStock(ticketItem.name, availableStock, parsed)
    ) {
      return;
    }

    setTicket((prev) => {
      const newTicket = [...prev];
      const item = newTicket[index];
      const clamped = !allowNegativeStock && item.maxStock !== undefined ? Math.min(parsed, item.maxStock) : parsed;
      newTicket[index] = { ...item, quantity: clamped };
      return newTicket;
    });
  };

  // ─── Cash numpad ───────────────────────────────────────────────
  const handleCashButton = () => {
    if (!ensureCanOperateCurrentShift()) return;
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

  useEffect(() => {
    setSelectedIndex(0);
  }, [cajaSearch, activeCategory]);

  // ─── Confirmed sale overlay ────────────────────────────────────────────────
  if (confirmedSale) {
    return (
      <>
        <ConfirmationScreen
          sale={confirmedSale}
          onChange={
            confirmedSale.paymentMethod === "CASH" && typeof confirmedSale.receivedAmount === "number"
              ? Math.max(0, confirmedSale.receivedAmount - confirmedSale.total)
              : null
          }
          onCorregir={handleCorregir}
          onListo={() => {
            setTicketSaleId(null);
            setInvoiceSaleId(null);
            setConfirmedSale(null);
            setConfirmedInvoice(null);
            setInvoiceDraft(null);
          }}
          onEmitTicket={() => {
            if (confirmedSale.id) {
              setTicketSaleId(confirmedSale.id);
            }
          }}
          onEmitInvoice={() => {
            if (confirmedSale.id) {
              setInvoiceSaleId(confirmedSale.id);
            }
          }}
          pauseAutoClose={Boolean(ticketSaleId || invoiceSaleId)}
        />
        {ticketSaleId ? (
          <TicketModal branchId={branchId} saleId={ticketSaleId} onClose={() => setTicketSaleId(null)} />
        ) : null}
        {invoiceSaleId ? (
          <InvoiceModal
            branchId={branchId}
            saleId={invoiceSaleId}
            mode="emit"
            initialDraft={invoiceDraft}
            onResolved={(nextInvoice) => setConfirmedInvoice(nextInvoice)}
            onClose={() => setInvoiceSaleId(null)}
          />
        ) : null}
      </>
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
          onClick={() => {
            if (isCashier) return;
            setShowTotalsBreakdown(true);
          }}
          style={{ background: "transparent", border: "none", cursor: !isCashier ? "pointer" : "default" }}
          title={isCashier ? "" : "Ver desglose de caja"}
        >
          <span className="status-bar-label">En Caja</span>
          <span className="status-bar-value" style={{ color: "var(--primary)" }}>
            {formatARS(cajaStats.enCaja)}
          </span>
        </button>
        <div className="separator" style={{ width: "1px", height: "32px", background: "var(--border-2)" }} />
        <div className="status-bar-item" style={{ alignItems: "flex-end", opacity: isCashier ? 0 : 1 }}>
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
            const stockBadge = getProductStockBadge(product);
            
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
                {stockBadge && (
                  <span
                    style={{
                      marginTop: "6px",
                      alignSelf: "flex-start",
                      padding: "3px 7px",
                      borderRadius: "999px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: stockBadge.color,
                      background: stockBadge.background,
                      border: `1px solid ${stockBadge.border}`,
                    }}
                  >
                    {stockBadge.label}
                  </span>
                )}
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
            {ticket.map((item, idx) => {
              const availableStock = getItemAvailableStock(item);
              const projectedStock = availableStock === null ? null : availableStock - item.quantity;
              const itemNeedsNegativeStock = allowNegativeStock && projectedStock !== null && projectedStock < 0;

              return (
              <div key={idx} className="ticket-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.name}</span>
                  {itemNeedsNegativeStock && (
                    <div
                      style={{
                        marginTop: "4px",
                        display: "inline-flex",
                        padding: "3px 7px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "var(--red)",
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.24)",
                      }}
                    >
                      Queda en {projectedStock}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); changeQty(idx, -1); }}
                    disabled={operationsDisabled}
                    style={{ width: "28px", height: "28px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "16px" }}
                  >
                    −
                  </button>
                  {editingQty?.index === idx ? (
                    <input
                      type="number"
                      inputMode="numeric"
                      value={editingQty.draft}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingQty({ index: idx, draft: e.target.value })}
                      onBlur={(e) => { e.stopPropagation(); commitQtyEdit(idx, editingQty.draft); }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") commitQtyEdit(idx, editingQty.draft);
                        if (e.key === "Escape") setEditingQty(null);
                      }}
                      style={{
                        width: "48px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: "15px",
                        background: "var(--surface)",
                        border: "1.5px solid var(--primary)",
                        borderRadius: "6px",
                        color: "var(--text)",
                        padding: "2px 4px",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!operationsDisabled) setEditingQty({ index: idx, draft: String(item.quantity) });
                      }}
                      title="Tocá para editar cantidad"
                      style={{
                        minWidth: "28px",
                        textAlign: "center",
                        fontWeight: 700,
                        cursor: operationsDisabled ? "default" : "text",
                        padding: "2px 4px",
                        borderRadius: "4px",
                        border: operationsDisabled ? "none" : "1px dashed var(--border)",
                        fontSize: "15px",
                        userSelect: "none",
                      }}
                    >
                      {item.quantity}
                    </span>
                  )}
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
            )})}
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
          gridTemplateColumns: isCashier ? "repeat(2, 1fr)" : "repeat(4, 1fr)", 
          gap: "8px", 
          padding: "8px 12px",
          background: "var(--surface)"
        }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{
              fontSize: "12px",
              color: invoiceDraft ? "var(--primary)" : "var(--text-2)",
              border: "1px solid var(--border)",
            }}
            onClick={() => {
              if (!ensureCanOperateCurrentShift()) return;
              setShowInvoiceDraftModal(true);
            }}
            disabled={total === 0 || operationsDisabled || !isOnline}
            title={!isOnline ? "Necesitas conexion para emitir factura." : "Preparar factura electronica"}
          >
            {invoiceDraft ? "FACTURA LISTA" : "CON FACTURA"}
          </button>
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
      {showInvoiceDraftModal && (
        <InvoiceModal
          branchId={branchId}
          mode="emit"
          initialDraft={invoiceDraft}
          onSaveDraft={(draft) => setInvoiceDraft(draft)}
          onClose={() => setShowInvoiceDraftModal(false)}
        />
      )}

      {/* Variant Selector Modal */}
      {variantSelector && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => setVariantSelector(null)} style={{ zIndex: 10000 }}>
            <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px", width: "95%", maxHeight: "80vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Seleccionar {variantSelector.product.name}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {variantSelector.product.variants?.map((v) => (
                (() => {
                  const stockBadge = getVariantStockBadge(v);
                  return (
                    <button
                      key={v.id}
                      className="btn btn-ghost"
                      style={{ justifyContent: "space-between", padding: "16px", borderRadius: "12px", background: "var(--surface-2)", border: "1px solid var(--border)" }}
                      onClick={() => handleProductTap(variantSelector.product, v)}
                      disabled={!allowNegativeStock && (v.availableStock ?? v.stock) <= 0}
                    >
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                          Stock: {v.availableStock ?? v.stock}
                        </div>
                        {stockBadge && (
                          <div
                            style={{
                              marginTop: "6px",
                              display: "inline-flex",
                              padding: "3px 7px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              fontWeight: 700,
                              color: stockBadge.color,
                              background: stockBadge.background,
                              border: `1px solid ${stockBadge.border}`,
                            }}
                          >
                            {stockBadge.label}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--primary)" }}>{formatARS(variantSelector.product.price)}</div>
                    </button>
                  );
                })()
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: "16px" }} onClick={() => setVariantSelector(null)}>
              Cancelar
            </button>
            </div>
          </div>
        </ModalPortal>
      )}

      <MpIncomingPaymentToasts
        branchId={branchId}
        enabled={Boolean(activeShift && (userRole === "OWNER" || canOperateCurrentShift))}
      />
    </div>
  );
}
