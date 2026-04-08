"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { formatARS, getCashSuggestions } from "@/lib/utils";
import useSWR from "swr";
import { applyPromoEngine, type ActivePromotion } from "@/lib/promo-engine";
import { formatSaleItemWeightLabel, getSaleItemSubtotal, parseWeightInputToGrams } from "@/lib/sale-item";
import NumPad from "@/components/ui/NumPad";
import ConfirmationScreen from "@/components/caja/ConfirmationScreen";
import GastoModal from "@/components/caja/GastoModal";
import OtroModal from "@/components/caja/OtroModal";
import RetiroModal from "@/components/caja/RetiroModal";
import CreditCustomerModal from "@/components/caja/CreditCustomerModal";
import CajaTotalsBreakdownModal from "@/components/caja/CajaTotalsBreakdownModal";
import OpenShiftModal, { type ShiftAssignee } from "@/components/turnos/OpenShiftModal";
import CloseShiftModal from "@/components/turnos/CloseShiftModal";
import TransferShiftModal from "@/components/turnos/TransferShiftModal";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import ModalPortal from "@/components/ui/ModalPortal";
import TicketModal from "@/components/ticket/TicketModal";
import InvoiceModal from "@/components/fiscal/InvoiceModal";
import type { InvoicePreviewData } from "@/lib/invoice-format";
import DigitalSalesCarousel from "@/components/caja/DigitalSalesCarousel";
import OperationalSubscriptionModal from "@/components/subscription/OperationalSubscriptionModal";

import { savePendingSale } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/sync";
import { useIsDesktop } from "@/lib/hooks";
import { playAudio, preloadAudio } from "@/lib/audio";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  name: string;
  barcode?: string | null;
  internalCode?: string | null;
  price?: number | null;
  cost?: number | null;
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
  cost?: number | null;
  barcode?: string | null;
  emoji?: string | null;
  image?: string | null;
  categoryId?: string | null;
  stock?: number | null;
  availableStock?: number | null;
  minStock?: number | null;
  showInGrid?: boolean;
  readyForSale?: boolean;
  allowNegativeStock?: boolean;
  soldByWeight?: boolean;
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
  soldByWeight?: boolean;
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
  isDemo?: boolean;
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

// ... (types)

type ShiftReminderDelivery = "NEXT_SHIFT" | "SCHEDULED";
const REMINDER_LOCAL_MAX_DELAY_MS = 2_147_000_000;

interface PendingShiftReminder {
  id: string;
  message: string;
  delivery: ShiftReminderDelivery;
  scheduledFor: string | null;
  createdByLabel: string;
  createdAt: string;
}

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

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function computeStockFlags(availableStock: number, minStock?: number | null) {
  return {
    isNegativeStock: availableStock < 0,
    isOutOfStock: availableStock === 0,
    isBelowMinStock:
      typeof minStock === "number" &&
      minStock > 0 &&
      availableStock > 0 &&
      availableStock <= minStock,
  };
}

function isSellableVariant(variant: Variant, allowNegativeStock: boolean) {
  const availableStock = variant.availableStock ?? variant.stock ?? 0;
  return (
    isPositiveFiniteNumber(variant.price) &&
    isPositiveFiniteNumber(variant.cost) &&
    (allowNegativeStock || availableStock > 0)
  );
}

function isSellableProduct(product: Product, allowNegativeStock: boolean) {
  if (product.variants && product.variants.length > 0) {
    return product.variants.some((variant) => isSellableVariant(variant, allowNegativeStock));
  }

  const availableStock = product.availableStock ?? product.stock ?? 0;
  return (
    isPositiveFiniteNumber(product.price) &&
    isPositiveFiniteNumber(product.cost) &&
    (allowNegativeStock || availableStock > 0)
  );
}

function updateProductStockForTicketItem(product: Product, item: TicketItem, direction: 1 | -1): Product {
  if (item.productId !== product.id) {
    return product;
  }

  const quantityDelta = item.quantity * direction;

  if (item.variantId && product.variants && product.variants.length > 0) {
    const nextVariants = product.variants.map((variant) => {
      if (variant.id !== item.variantId) {
        return variant;
      }

      const nextStock = (variant.availableStock ?? variant.stock ?? 0) + quantityDelta;
      return {
        ...variant,
        stock: nextStock,
        availableStock: nextStock,
        ...computeStockFlags(nextStock, variant.minStock),
      };
    });

    return {
      ...product,
      variants: nextVariants,
      isNegativeStock: nextVariants.some((variant) => variant.isNegativeStock),
      isOutOfStock:
        nextVariants.length > 0 &&
        nextVariants.every((variant) => !variant.isNegativeStock && variant.isOutOfStock),
      isBelowMinStock:
        nextVariants.some((variant) => variant.isBelowMinStock) ||
        nextVariants.some((variant) => !variant.isNegativeStock && variant.isOutOfStock),
    };
  }

  const nextStock = (product.availableStock ?? product.stock ?? 0) + quantityDelta;
  return {
    ...product,
    stock: nextStock,
    availableStock: nextStock,
    ...computeStockFlags(nextStock, product.minStock),
  };
}

function applyTicketStockChange(products: Product[], items: TicketItem[], direction: 1 | -1) {
  if (items.length === 0) {
    return products;
  }

  return products.map((product) => {
    let nextProduct = product;

    for (const item of items) {
      if (item.productId === product.id) {
        nextProduct = updateProductStockForTicketItem(nextProduct, item, direction);
      }
    }

    return nextProduct;
  });
}

export default function CajaPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = params.branchId as string;
  const isDesktop = useIsDesktop();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;
  const employeeId = session?.user?.employeeId;
  const employeeRole = session?.user?.employeeRole;
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
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
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
  const [couponRecord, setCouponRecord] = useState<{ id: string; discountKind: "PERCENTAGE" | "FIXED_PRICE"; discountValue: number; code?: string; promotion?: { type: string; combos?: { productId: string; variantId: string | null; quantity: number }[] } } | null>(null);
  
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showTransferShift, setShowTransferShift] = useState(false);
  const [showTotalsBreakdown, setShowTotalsBreakdown] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showReminderComposer, setShowReminderComposer] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderDelivery, setReminderDelivery] = useState<ShiftReminderDelivery>("NEXT_SHIFT");
  const [reminderScheduledFor, setReminderScheduledFor] = useState("");
  const [pendingReminder, setPendingReminder] = useState<PendingShiftReminder | null>(null);

  const [cajaSearch, setCajaSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [variantSelector, setVariantSelector] = useState<{ product: Product } | null>(null);
  const [weightSelector, setWeightSelector] = useState<{ product: Product; variant?: Variant; draft: string } | null>(null);
  const [isTicketExpanded, setIsTicketExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [subscriptionPromptMessage, setSubscriptionPromptMessage] = useState("");
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState(false);
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [subscriptionPromptError, setSubscriptionPromptError] = useState("");
  const [activatingPreviewSubscription, setActivatingPreviewSubscription] = useState(false);
  const [previewSubscriptionError, setPreviewSubscriptionError] = useState("");
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleBarcodeScanRef = useRef<(code: string) => void>(() => {});
  const hasPlayedStartupRef = useRef(false);
  const prevPromosCountRef = useRef(0);
  const allowNegativeStock = products[0]?.allowNegativeStock ?? false;
  
  const keyboardScanBufferRef = useRef("");
  const keyboardScanStartedAtRef = useRef(0);
  const keyboardScanLastKeyAtRef = useRef(0);
  const pendingManualSearchRef = useRef("");
  const manualSearchTimerRef = useRef<number | null>(null);
  const reminderTimeoutRef = useRef<number | null>(null);
  const scheduledReminderIdRef = useRef<string | null>(null);

  const isOnline = useOnlineStatus();
  const { data: promotions } = useSWR<ActivePromotion[]>(`/api/promociones?active=true`, (url: string) => fetch(url).then(r => r.json()));

  const promoResult = useMemo(() => {
    if (!promotions && !couponRecord) return null;
    return applyPromoEngine({
      items: ticket.map((i) => ({
        ...i,
        productId: i.productId ?? null,
        variantId: i.variantId ?? null,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        soldByWeight: Boolean(i.soldByWeight),
        cost: i.cost ?? null,
      })),
      promotions: promotions ?? [],
      coupon: couponRecord,
      expiryInfo: [], // Zona Roja days calculation for later
    });
  }, [ticket, promotions, couponRecord]);

  // ─── Audio Effects ────────────────────────────────────────────────────────
  useEffect(() => {
    if (products.length > 0 && !hasPlayedStartupRef.current) {
      hasPlayedStartupRef.current = true;
      void playAudio("/hello_k24.wav", 0.6);
    }
  }, [products]);

  useEffect(() => {
    // Preload system sounds for zero-delay playback
    preloadAudio([
      "/blip.wav",
      "/promo.wav",
      "/tap.wav",
      "/turno.wav",
      "/scanner.wav",
      "/hello_k24.wav",
    ]);
  }, []);

  useEffect(() => {
    const currentPromosCount = promoResult?.applications?.length ?? 0;
    if (currentPromosCount > prevPromosCountRef.current) {
      void playAudio("/promo.wav", 0.7);
    }
    prevPromosCountRef.current = currentPromosCount;
  }, [promoResult]);

  const rawTotal = ticket.reduce((sum, item) => sum + getSaleItemSubtotal(item), 0);
  const total = promoResult ? promoResult.total : rawTotal;
  const cashSuggestions = getCashSuggestions(total);
  const activeShiftId = activeShift?.isDemo ? null : activeShift?.id ?? null;
  const shiftResponsibleName = activeShift?.employee?.name || activeShift?.employeeName || "Dueño";
  const canOperateCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "EMPLOYEE") {
      // Solo el responsable puede operar (vender/gastar)
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return true;
  }, [activeShift, userRole, employeeId]);

  const canManageCurrentShift = useMemo(() => {
    if (!activeShift) return false;
    if (userRole === "OWNER") return true;
    if (userRole === "EMPLOYEE") {
      // El responsable O un encargado pueden gestionar el turno (cerrar/transferir)
      if (employeeRole === "MANAGER") return true;
      return Boolean(employeeId && activeShift.employeeId && activeShift.employeeId === employeeId);
    }
    return false;
  }, [activeShift, employeeId, userRole, employeeRole]);
  const canCreateReminders = useMemo(() => {
    if (userRole === "OWNER") return true;
    if (employeeRole === "MANAGER") return true;
    return Boolean(activeShift && canOperateCurrentShift);
  }, [activeShift, canOperateCurrentShift, employeeRole, userRole]);
  const shiftLocked = Boolean(activeShift && !canOperateCurrentShift);
  const operationsDisabled = !activeShift || shiftLocked;
  
  const shiftLockMessage = useMemo(() => {
    if (!activeShift || !shiftLocked) return null;
    
    if (employeeRole === "MANAGER") {
      return `La caja esta a nombre de ${shiftResponsibleName}. Sos Encargado, podés cerrar o transferir este turno si es necesario.`;
    }
    
    if (userRole === "EMPLOYEE") {
      return `La caja esta a nombre de ${shiftResponsibleName}. Pedile al responsable que te transfiera el turno para poder operar.`;
    }
    
    return `La caja esta a nombre de ${shiftResponsibleName}. Transferí o cerrá el turno para operar desde esta sesión.`;
  }, [activeShift, employeeRole, shiftLocked, userRole, shiftResponsibleName]);

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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const overlayOpen =
        showGasto ||
        showOtro ||
        showRetiro ||
        showCredit ||
        showOpenShift ||
        showCloseShift ||
        showTransferShift ||
        showScanner ||
        showReminderComposer ||
        pendingReminder ||
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
    clearPendingManualSearch,
    resetKeyboardScannerState,
    showGasto, showOtro, showRetiro, showCredit, showOpenShift, showCloseShift,
    showTransferShift, showScanner, showReminderComposer, pendingReminder, variantSelector,
    showCashNumpad, confirmedSale, showInvoiceDraftModal, invoiceSaleId
  ]);

  // ─── Startup Logic: Onboarding & Shift ──────────────────────────────────
  const promptSubscriptionActivation = useCallback((message: string) => {
    setSubscriptionPromptMessage(message);
    setSubscriptionPromptError("");
    setShowSubscriptionPrompt(true);
  }, []);

  const handleActivateSubscription = useCallback(async () => {
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
  }, [branchId]);

  const handleActivatePreviewSubscription = useCallback(async () => {
    setActivatingPreviewSubscription(true);
    setPreviewSubscriptionError("");

    try {
      const response = await fetch("/api/subscription/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ origin: "SALE_PREVIEW" }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.init_point) {
        setPreviewSubscriptionError(data?.error || "No se pudo generar el link de pago.");
        setActivatingPreviewSubscription(false);
        return;
      }

      window.location.href = data.init_point;
    } catch {
      setPreviewSubscriptionError("No se pudo conectar con el sistema de suscripciones.");
      setActivatingPreviewSubscription(false);
    }
  }, [branchId]);

  const explainShiftLock = useCallback(() => {
    alert(`La caja está a nombre de ${shiftResponsibleName}. Transferí o cerrá el turno para operar con este usuario.`);
  }, [shiftResponsibleName]);

  const clearReminderTimer = useCallback(() => {
    if (reminderTimeoutRef.current) {
      window.clearTimeout(reminderTimeoutRef.current);
      reminderTimeoutRef.current = null;
    }
    scheduledReminderIdRef.current = null;
  }, []);

  const scheduleReminderLocally = useCallback((reminder: PendingShiftReminder) => {
    if (!reminder.scheduledFor) {
      clearReminderTimer();
      setPendingReminder((current) => current ?? reminder);
      return;
    }

    const scheduledAt = new Date(reminder.scheduledFor).getTime();
    if (!Number.isFinite(scheduledAt)) {
      clearReminderTimer();
      return;
    }

    const delay = scheduledAt - Date.now();
    if (delay <= 0) {
      clearReminderTimer();
      setPendingReminder((current) => current ?? reminder);
      return;
    }

    clearReminderTimer();
    scheduledReminderIdRef.current = reminder.id;
    reminderTimeoutRef.current = window.setTimeout(() => {
      scheduledReminderIdRef.current = null;
      reminderTimeoutRef.current = null;
      setPendingReminder((current) => current ?? reminder);
    }, Math.min(delay, REMINDER_LOCAL_MAX_DELAY_MS));
  }, [clearReminderTimer]);

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
      void playAudio("/turno.wav", 0.6);
      fetchStats();
    } else {
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        const demoShift = createDemoShift({ openingAmount, assignee });
        setActiveShift(demoShift);
        setShowOpenShift(false);
        setShowCloseShift(false);
        setShowTransferShift(false);
        setCajaStats((prev) => ({
          ...prev,
          openingAmount,
          enCaja: openingAmount,
        }));
        void playAudio("/turno.wav", 0.6);
        return;
      }
      alert(data?.error || "No se pudo abrir el turno.");
    }
  };

  const handleCloseShift = async (amount: number, note: string) => {
    if (!activeShift) return;
    if (!canManageCurrentShift) {
      explainShiftLock();
      return;
    }
    if (activeShift.isDemo) {
      setActiveShift(null);
      setShowCloseShift(false);
      setShowOpenShift(true);
      setTicket([]);
      setReceivedAmount("");
      setCajaStats((prev) => ({
        ...prev,
        openingAmount: undefined,
        enCaja: 0,
      }));
      void playAudio("/turno.wav", 0.6);
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
      void playAudio("/turno.wav", 0.6);
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
    if (activeShift.isDemo) {
      setActiveShift((current) =>
        current
          ? {
              ...current,
              employeeId: assignee.employeeId,
              employeeName: assignee.employeeName,
              employee: assignee.employeeId
                ? {
                    id: assignee.employeeId,
                    name: assignee.employeeName,
                  }
                : null,
            }
          : current,
      );
      setShowTransferShift(false);
      void playAudio("/turno.wav", 0.6);
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
      void playAudio("/turno.wav", 0.6);
      fetchStats();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No se pudo transferir el turno.");
    }
  };

  const fetchProducts = useCallback(async () => {
    try {
      const [res, catRes] = await Promise.all([
        fetch(`/api/productos?view=grid`, {
          headers: { "x-branch-id": branchId },
        }),
        fetch(`/api/categorias`, {
          headers: { "x-branch-id": branchId },
        }),
      ]);

      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : []);
      }

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(Array.isArray(catData) ? catData : []);
      }
    } finally {
    }
  }, [branchId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats/hoy`, {
        headers: { "x-branch-id": branchId }
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setCajaStats(data);
    } catch {}
  }, [branchId]);

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
        if (activeShift?.isDemo) {
          return;
        }

        setActiveShift(null);
        setShowTransferShift(false);
        setShowCloseShift(false);
        setShowOpenShift(true);
      }
    } catch {}
  }, [activeShift?.isDemo, branchId]);

  const loadCajaData = useCallback(async () => {
    try {
      await Promise.all([fetchProducts(), fetchStats(), fetchActiveShift()]);
    } catch {}
  }, [fetchActiveShift, fetchProducts, fetchStats]);

  useEffect(() => {
    if (status === "loading") return;
    void loadCajaData();
  }, [loadCajaData, status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const refreshShift = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void fetchActiveShift();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshShift();
      }
    };

    const intervalId = window.setInterval(refreshShift, 60_000);
    window.addEventListener("focus", refreshShift);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshShift);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchActiveShift, status]);

  const resetReminderComposer = useCallback(() => {
    setReminderMessage("");
    setReminderDelivery("NEXT_SHIFT");
    setReminderScheduledFor("");
    setSavingReminder(false);
  }, []);

  const fetchPendingReminder = useCallback(async () => {
    if (!activeShift) {
      clearReminderTimer();
      setPendingReminder(null);
      return;
    }

    if (pendingReminder) {
      return;
    }

    try {
      const res = await fetch("/api/turnos/reminders", {
        headers: { "x-branch-id": branchId },
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const nextReminder = data?.reminder ?? null;

      if (!nextReminder) {
        clearReminderTimer();
        setPendingReminder(null);
        return;
      }

      if (
        nextReminder.delivery === "SCHEDULED" &&
        nextReminder.scheduledFor &&
        new Date(nextReminder.scheduledFor).getTime() > Date.now()
      ) {
        if (scheduledReminderIdRef.current !== nextReminder.id) {
          scheduleReminderLocally(nextReminder);
        }
        return;
      }

      clearReminderTimer();
      setPendingReminder((current) => current ?? nextReminder);
    } catch {}
  }, [activeShift, branchId, clearReminderTimer, pendingReminder, scheduleReminderLocally]);

  useEffect(() => {
    if (!activeShiftId) {
      clearReminderTimer();
      setPendingReminder(null);
      return;
    }

    void fetchPendingReminder();
  }, [activeShiftId, clearReminderTimer, fetchPendingReminder]);

  useEffect(() => {
    if (!activeShiftId) {
      return;
    }

    const refreshReminder = () => {
      void fetchPendingReminder();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshReminder();
      }
    };

    window.addEventListener("focus", refreshReminder);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshReminder);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeShiftId, fetchPendingReminder]);

  useEffect(() => {
    return () => {
      clearReminderTimer();
    };
  }, [clearReminderTimer]);

  const acknowledgePendingReminder = useCallback(async () => {
    if (!pendingReminder) return;

    const reminderId = pendingReminder.id;
    setPendingReminder(null);

    try {
      await fetch(`/api/turnos/reminders/${reminderId}/ack`, {
        method: "POST",
        headers: { "x-branch-id": branchId },
      });
      void fetchPendingReminder();
    } catch {}
  }, [branchId, fetchPendingReminder, pendingReminder]);

  const handleSaveReminder = async () => {
    if (!reminderMessage.trim()) {
      alert("Escribe un recordatorio.");
      return;
    }

    setSavingReminder(true);
    try {
      const res = await fetch("/api/turnos/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          message: reminderMessage,
          delivery: reminderDelivery,
          scheduledFor:
            reminderDelivery === "SCHEDULED" && reminderScheduledFor
              ? new Date(reminderScheduledFor).toISOString()
              : null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 402) {
          promptSubscriptionActivation(data?.error || "Necesitas una suscripcion activa para dejar recordatorios de turno.");
          return;
        }

        alert(data?.error || "No se pudo guardar el recordatorio.");
        return;
      }

      resetReminderComposer();
      setShowReminderComposer(false);
      alert("Recordatorio guardado.");
      void fetchPendingReminder();
    } catch {
      alert("No se pudo guardar el recordatorio.");
    } finally {
      setSavingReminder(false);
    }
  };

  // ─── Product tap ─────────────────────────────────────────────────────────
  const ensureCanOperateCurrentShift = useCallback(() => {
    if (!activeShift) {
      alert("Abrí un turno para operar.");
      return false;
    }

    if (!canOperateCurrentShift) {
      explainShiftLock();
      return false;
    }

    return true;
  }, [activeShift, canOperateCurrentShift, explainShiftLock]);

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

  const shouldWarnNegativeStock = useCallback((availableStock: number, previousQuantity: number, nextQuantity: number) => {
    if (!allowNegativeStock || nextQuantity <= previousQuantity) return false;
    if (availableStock <= 0) return previousQuantity === 0 && nextQuantity > 0;
    return previousQuantity <= availableStock && nextQuantity > availableStock;
  }, [allowNegativeStock]);

  const formatStockAmount = (amount: number, soldByWeight = false) =>
    soldByWeight ? `${(amount / 1000).toFixed(3)} kg` : String(amount);

  const confirmNegativeStock = (itemName: string, availableStock: number, nextQuantity: number, soldByWeight = false) => {
    const projectedStock = availableStock - nextQuantity;
    return window.confirm(
      `${itemName} no tiene stock cargado suficiente.\n\n` +
      `Stock disponible: ${formatStockAmount(availableStock, soldByWeight)}.\n` +
      `En el ticket: ${formatStockAmount(nextQuantity, soldByWeight)}.\n` +
      `Quedaria en ${formatStockAmount(projectedStock, soldByWeight)}.\n\n` +
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

    if (product.soldByWeight) {
      if (variant) {
        setVariantSelector(null);
      }
      setWeightSelector({ product, variant, draft: "" });
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

    if (shouldWarnNegativeStock(targetStock, previousQuantity, nextQuantity) && !confirmNegativeStock(targetName, targetStock, nextQuantity, Boolean(product.soldByWeight))) {
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

      // Al agregar un producto nuevo, mantener el panel colapsado
      setIsTicketExpanded(false);

      return [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id,
          name: targetName,
          price:
            variant && typeof variant.price === "number" && Number.isFinite(variant.price)
              ? variant.price
              : product.price,
          quantity: 1,
          cost:
            variant && typeof variant.cost === "number" && Number.isFinite(variant.cost)
              ? variant.cost
              : undefined,
          maxStock: allowNegativeStock ? undefined : targetStock
        },
      ];
    });

    if (variant) setVariantSelector(null);
  }, [allowNegativeStock, ensureCanOperateCurrentShift, shouldWarnNegativeStock, ticket]);

  // Long press = eliminar item del ticket
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const handleLongPressStart = (product: Product) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

    longPressTimer.current = setTimeout(() => {
      setTicket((prev) => prev.filter((i) => i.productId !== product.id));
    }, 400);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ─── REPETIR ─────────────────────────────────────────────────────────────
  const confirmWeightSelection = () => {
    if (!weightSelector) {
      return;
    }

    const quantity = parseWeightInputToGrams(weightSelector.draft);
    if (quantity === null || quantity <= 0) {
      alert("Ingresá un peso válido.");
      return;
    }

    const { product, variant } = weightSelector;
    const targetName = variant ? `${product.name} - ${variant.name}` : product.name;
    const targetStock = getSelectionAvailableStock(product, variant);
    const existing = ticket.find((item) => (variant ? item.variantId === variant.id : item.productId === product.id));
    const previousQuantity = existing?.quantity ?? 0;
    const nextQuantity = previousQuantity + quantity;
    const unitPrice =
      variant && typeof variant.price === "number" && Number.isFinite(variant.price)
        ? variant.price
        : product.price;
    const unitCost =
      variant && typeof variant.cost === "number" && Number.isFinite(variant.cost)
        ? variant.cost
        : product.cost ?? undefined;

    if (!allowNegativeStock && targetStock <= 0) {
      alert(`${targetName} no tiene stock disponible`);
      return;
    }

    if (!allowNegativeStock && nextQuantity > targetStock) {
      alert(`No hay más stock de ${targetName}`);
      return;
    }

    if (
      shouldWarnNegativeStock(targetStock, previousQuantity, nextQuantity) &&
      !confirmNegativeStock(targetName, targetStock, nextQuantity, Boolean(product.soldByWeight))
    ) {
      return;
    }

    setTicket((prev) => {
      const existingIndex = prev.findIndex((item) =>
        variant ? item.variantId === variant.id : item.productId === product.id,
      );

      if (existingIndex >= 0) {
        const nextTicket = [...prev];
        nextTicket[existingIndex] = {
          ...nextTicket[existingIndex],
          quantity: nextTicket[existingIndex].quantity + quantity,
        };
        return nextTicket;
      }

      setIsTicketExpanded(false);
      return [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id,
          name: targetName,
          price: unitPrice,
          quantity,
          soldByWeight: true,
          cost: unitCost,
          maxStock: allowNegativeStock ? undefined : targetStock,
        },
      ];
    });

    setWeightSelector(null);
  };

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
      couponCode: couponRecord?.code,
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
              let serverCode = "";
              try {
                const parsed = JSON.parse(errorText);
                if (parsed && typeof parsed.error === "string") {
                  serverMessage = parsed.error;
                }
                if (parsed && typeof parsed.code === "string") {
                  serverCode = parsed.code;
                }
              } catch {}
              console.error("[Ventas] Error HTTP registrando venta:", res.status, errorText);
              if (res.status === 402 || serverCode === "NO_SUBSCRIPTION_OPERATIONAL") {
                setPreviewSubscriptionError("");
                setPreviewSale({
                  ...newSale,
                  ...(received ? { receivedAmount: received } : {}),
                });
                setShowCashNumpad(false);
                void playAudio("/blip.wav", 0.8);
                return;
              }
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
        setProducts((current) => applyTicketStockChange(current, ticket, -1));
        setTicket([]);
        setCouponRecord(null);
      setReceivedAmount("");
      setShowCashNumpad(false);
      void playAudio("/blip.wav", 0.8);
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
      fetch(`/api/ventas/${confirmedSale.id}/anular`, { method: "POST" })
        .then((response) => {
          if (!response.ok) {
            return;
          }

          setProducts((current) => applyTicketStockChange(current, confirmedSale.items, 1));
          fetchStats();
        })
        .catch(() => {});
    }
  };

  // ─── Barcode handling ─────────────────────────────────────────────────────
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (product.showInGrid === false || product.categoryShowInGrid === false) {
          return false;
        }

        if (isSellableProduct(product, allowNegativeStock)) {
          return true;
        }

        if (product.isOutOfStock || product.isNegativeStock || product.isBelowMinStock) {
          return true;
        }

        return product.variants?.some((variant) => variant.isOutOfStock || variant.isNegativeStock || variant.isBelowMinStock) ?? false;
      }),
    [products, allowNegativeStock],
  );

  const filteredProducts = useMemo(() => {
    let res = visibleProducts;
    if (activeCategory) res = res.filter(p => p.categoryId === activeCategory);
    if (cajaSearch) {
      const q = cajaSearch.toLowerCase();
      res = res.filter(p => p.name.toLowerCase().includes(q) || p.barcode === q);
    }
    return res;
  }, [visibleProducts, activeCategory, cajaSearch]);

  const handleBarcodeScan = useCallback((result: string) => {
    setShowScanner(false);
    void playAudio("/scanner.wav", 0.7);

    // 1. Buscar en productos base
    const product = visibleProducts.find(p => p.barcode === result);
    if (product) {
      handleProductTap(product);
      return;
    }

    // 2. Buscar en variantes de todos los productos
    for (const p of visibleProducts) {
      if (p.variants) {
        const variant = p.variants.find(v => v.barcode === result);
        if (variant) {
          handleProductTap(p, variant);
          return;
        }
      }
    }

    // Not found locally? It might be a Coupon!
    fetch("/api/cupones/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: result }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.valid) {
          setCouponRecord({ ...data.coupon, code: result });
          
          if (data.coupon?.promotion?.type === "COMBO" && data.coupon.promotion.combos) {
            // Apply items to cart iteratively
            data.coupon.promotion.combos.forEach((cItem: { productId: string; variantId: string | null; quantity: number }) => {
              const p = visibleProducts.find((vp) => vp.id === cItem.productId);
              if (p) {
                const v = p.variants?.find((vv) => vv.id === cItem.variantId);
                // Si el item precisa cantidad > 1, usamos un tickteo en bucle temporal, o aplicamos un delta
                // Ya que `handleProductTap` usa el estado anterior (prev), iterar no rompe la consistencia.
                for (let i = 0; i < cItem.quantity; i++) {
                  handleProductTap(p, v);
                }
              }
            });
            alert("¡Combo aplicado con éxito! Revisá tu carrito.");
          } else {
            alert("¡Cupón aplicado con éxito al carrito!");
          }
        } else {
          alert(`Código ${result} no encontrado o cupón inválido.`);
        }
      })
      .catch(() => {
        alert(`Código ${result} no encontrado.`);
      });
  }, [handleProductTap, visibleProducts]);
  handleBarcodeScanRef.current = handleBarcodeScan;

  // ─── Ticket item controls ─────────────────────────────────────────────────
  const changeQty = (index: number, delta: number) => {
    if (!ensureCanOperateCurrentShift()) {
      return;
    }

    const ticketItem = ticket[index];
    if (!ticketItem) return;

    const availableStock = getItemAvailableStock(ticketItem);
    const quantityStep = ticketItem.soldByWeight ? 50 : 1;
    const nextQuantity = ticketItem.quantity + delta * quantityStep;

    if (!allowNegativeStock && delta > 0 && ticketItem.maxStock !== undefined && nextQuantity > ticketItem.maxStock) {
      alert("Stock mÃ¡ximo alcanzado");
      return;
    }

    if (
      delta > 0 &&
      availableStock !== null &&
      shouldWarnNegativeStock(availableStock, ticketItem.quantity, nextQuantity) &&
      !confirmNegativeStock(ticketItem.name, availableStock, nextQuantity, Boolean(ticketItem.soldByWeight))
    ) {
      return;
    }

    setTicket((prev) => {
      const newTicket = [...prev];
      const item = newTicket[index];

      if (!allowNegativeStock && delta > 0 && item.maxStock !== undefined && nextQuantity > item.maxStock) {
        alert("Stock máximo alcanzado");
        return prev;
      }

      newTicket[index] = { ...item, quantity: item.quantity + delta * quantityStep };
      if (newTicket[index].quantity <= 0) newTicket.splice(index, 1);
      return newTicket;
    });
  };

  const [editingQty, setEditingQty] = useState<{ index: number; draft: string } | null>(null);

  const commitQtyEdit = (index: number, rawValue: string) => {
    const ticketItem = ticket[index];
    const parsed = ticketItem?.soldByWeight ? parseWeightInputToGrams(rawValue) : parseInt(rawValue, 10);
    setEditingQty(null);
    if (!rawValue.trim() || parsed === null || Number.isNaN(parsed) || parsed <= 0) {
      setTicket((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    if (!ticketItem) return;

    const availableStock = getItemAvailableStock(ticketItem);
    if (
      allowNegativeStock &&
      availableStock !== null &&
      shouldWarnNegativeStock(availableStock, ticketItem.quantity, parsed) &&
      !confirmNegativeStock(ticketItem.name, availableStock, parsed, Boolean(ticketItem.soldByWeight))
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
          canEmitTicket={confirmedInvoice?.status !== "ISSUED"}
          ticketActionLabel={confirmedSale.ticketNumber ? "VER TICKET" : "EMITIR TICKET"}
          pauseAutoClose={Boolean(ticketSaleId || invoiceSaleId)}
        />
        {ticketSaleId ? (
          <TicketModal
            branchId={branchId}
            saleId={ticketSaleId}
            emitOnOpen={!confirmedSale.ticketNumber}
            onResolved={(nextTicket) => {
              const nextTicketNumber = nextTicket.ticketNumber ? Number(nextTicket.ticketNumber) : null;
              setConfirmedSale((prev) =>
                prev
                  ? {
                      ...prev,
                      ticketNumber: Number.isInteger(nextTicketNumber) ? nextTicketNumber : prev.ticketNumber ?? null,
                    }
                  : prev,
              );
            }}
            onClose={() => setTicketSaleId(null)}
          />
        ) : null}
        {invoiceSaleId ? (
          <InvoiceModal
            branchId={branchId}
            saleId={invoiceSaleId}
            mode={confirmedInvoice ? "view" : "emit"}
            initialDraft={invoiceDraft}
            onResolved={(nextInvoice) => setConfirmedInvoice(nextInvoice)}
            onClose={() => setInvoiceSaleId(null)}
          />
        ) : null}
      </>
    );
  }

  // ─── Cash numpad overlay ──────────────────────────────────────────────────
  if (previewSale) {
    return (
      <ConfirmationScreen
        sale={previewSale}
        onChange={
          previewSale.paymentMethod === "CASH" && typeof previewSale.receivedAmount === "number"
            ? Math.max(0, previewSale.receivedAmount - previewSale.total)
            : null
        }
        onCorregir={() => {
          setPreviewSale(null);
          setPreviewSubscriptionError("");
        }}
        onListo={() => void handleActivatePreviewSubscription()}
        onEmitTicket={() => {}}
        onEmitInvoice={() => {}}
        canEmitTicket={false}
        canEmitInvoice={false}
        pauseAutoClose
        title="VENTA REGISTRADA"
        description="Una vez que actives tu cuenta, esta es la velocidad que vas a tener en tu negocio."
        primaryActionLabel="ACTIVA TU CUENTA PARA EMPEZAR"
        primaryActionLoadingLabel="Generando link..."
        primaryActionLoading={activatingPreviewSubscription}
        footerText={
          previewSubscriptionError ||
          "Todavia no registramos esta venta. Activa tu cuenta y empeza a operar de verdad."
        }
      />
    );
  }

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
        {isCashier ? (
          <DigitalSalesCarousel stats={cajaStats} />
        ) : (
          <div className="status-bar-item" style={{ alignItems: "flex-end" }}>
            <span className="status-bar-label">Ganancia estimada</span>
            <span className="status-bar-value" style={{ color: cajaStats.ganancia !== null && cajaStats.ganancia >= 0 ? "var(--primary)" : "var(--red)" }}>
              {cajaStats.ganancia !== null ? formatARS(cajaStats.ganancia) : "—"}
            </span>
          </div>
        )}
      </div>
      
      {/* Header */}
      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {activeShift ? (
          <span style={{ fontSize: "13px", color: "var(--text-3)", fontWeight: 600, display: "flex", gap: "8px", alignItems: "center" }}>
            {!isOnline && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", display: "inline-block" }} />}
            TURNO: {activeShift.employee?.name || activeShift.employeeName || "Activo"}
            {activeShift.isDemo ? (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(59,130,246,.14)",
                  border: "1px solid rgba(59,130,246,.24)",
                  color: "#bfdbfe",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                }}
              >
                Demo
              </span>
            ) : null}
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

           {canCreateReminders && (
             <button className="btn btn-sm btn-ghost" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setShowReminderComposer(true)}>
               Recordatorio
             </button>
           )}

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

      {activeShift?.isDemo && (
        <div
          style={{
            margin: "12px 16px 0",
            padding: "12px 14px",
            borderRadius: "14px",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            background: "rgba(59, 130, 246, 0.12)",
            color: "var(--text)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          Modo demo activo. La caja se abrio visualmente con {formatARS(activeShift.openingAmount)}, pero no se registro un turno real todavia.
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
            Acepta lectora USB o Bluetooth para escanear códigos de barras. También podés usar la cámara del dispositivo haciendo click en el botón &quot;Escanear&quot;.
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
            const isUnavailable = !isSellableProduct(product, allowNegativeStock);
             
            return (
              <button
                key={product.id}
                className="product-btn"
                ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: 'nearest' }); }}
                onClick={() => handleProductTap(product)}
                onContextMenu={(event) => event.preventDefault()}
                onMouseDown={() => handleLongPressStart(product)}
                onMouseUp={handleLongPressEnd}
                onTouchStart={() => handleLongPressStart(product)}
                onTouchEnd={handleLongPressEnd}
                disabled={operationsDisabled}
                style={{
                  fontSize: "13px",
                  ...(inTicket
                    ? {
                        borderColor: "var(--primary)",
                        background: "rgba(var(--primary-rgb, 34, 197, 94), 0.08)",
                      }
                    : {}),
                  ...(isUnavailable
                    ? {
                        opacity: 0.68,
                        borderColor: "rgba(148,163,184,.28)",
                        background: "rgba(148,163,184,.06)",
                      }
                    : {}),
                  ...(isSelected
                    ? {
                        outline: `2px solid ${inTicket ? "var(--primary)" : "var(--text)"}`,
                        transform: "scale(1.02)",
                      }
                    : {}),
                }}
              >
                <div
                  className="product-btn-media"
                  aria-hidden="true"
                  style={isUnavailable ? { filter: "grayscale(0.18) saturate(0.82)", opacity: 0.9 } : undefined}
                >
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} draggable={false} />
                  ) : product.emoji ? (
                    <div className="product-btn-media-fallback" data-kind="emoji">
                      {product.emoji}
                    </div>
                  ) : (
                    <div className="product-btn-media-fallback" data-kind="letter">
                      {product.name.slice(0, 1)}
                    </div>
                  )}
                </div>

                <div className="product-btn-body">
                  <span className="product-btn-name">{product.name}</span>
                  {product.soldByWeight && (
                    <span
                      style={{
                        justifySelf: "start",
                        padding: "3px 7px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "#f8fafc",
                        background: "linear-gradient(180deg, rgba(245,158,11,.92), rgba(217,119,6,.92))",
                        border: "1px solid rgba(251,191,36,.45)",
                      }}
                    >
                      Por peso
                    </span>
                  )}
                  <span className="product-btn-price">{formatARS(product.price)}</span>
                  {stockBadge && (
                    <span
                      style={{
                        justifySelf: "start",
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
                </div>
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
                    {inTicket.soldByWeight ? Math.round(inTicket.quantity) : inTicket.quantity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      </div> {/* End of HTML Main Content Area */}


      {/* Sidebar - Panel de Caja (aparece desde atrás de la barra inferior en móvil) */}
      <div className={`pos-sidebar no-print ${ticket.length > 0 ? 'has-content' : 'collapsed'}`}>
        
        {/* Ticket Header / Summary (Sticky dentro del sidebar) */}
        {ticket.length > 0 ? (
          <div
            onClick={() => setIsTicketExpanded(!isTicketExpanded)}
            style={{
              padding: "14px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>({ticket.length} {ticket.length === 1 ? 'ítem' : 'ítems'})</span>
            </div>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--primary)" }}>{formatARS(total)}</span>
          </div>
        ) : (
          <div 
            style={{ 
              padding: "4px 16px", 
              textAlign: "center", 
              color: "var(--text-3)", 
              fontSize: "10px", 
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              opacity: 0.5,
            }}
          >
            + Agregá un producto
          </div>
        )}

        {/* Collapsible Ticket Detail & Payment Buttons */}
        {ticket.length > 0 && (isTicketExpanded || isDesktop) && (
          <div style={{ 
            overflowY: "auto", 
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}>
            {ticket.map((item, idx) => {
              const availableStock = getItemAvailableStock(item);
              const projectedStock = availableStock === null ? null : availableStock - item.quantity;
              const itemNeedsNegativeStock = allowNegativeStock && projectedStock !== null && projectedStock < 0;
              const projectedStockLabel = item.soldByWeight && projectedStock !== null
                ? `${(projectedStock / 1000).toFixed(3)} kg`
                : projectedStock;

              return (
              <div key={idx} className="ticket-item" style={{ padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "13px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-3)", marginTop: "3px" }}>
                    <span>{item.soldByWeight ? formatSaleItemWeightLabel(item) : `x${item.quantity}`}</span>
                    {promoResult?.adjustedItems[idx]?.appliedPromoType === 'COMBO' && <span style={{ background: "linear-gradient(90deg, #ec4899, #8b5cf6)", color: "#fff", fontSize: "9px", fontWeight: 800, padding: "2px 5px", borderRadius: "4px" }}>COMBO</span>}
                    {promoResult?.adjustedItems[idx]?.appliedPromoType === 'ZONA_ROJA' && <span style={{ background: "var(--red)", color: "#fff", fontSize: "9px", fontWeight: 800, padding: "2px 5px", borderRadius: "4px" }}>ROJA</span>}
                  </span>
                  {itemNeedsNegativeStock && (
                    <div
                      style={{
                        marginTop: "4px",
                        display: "inline-flex",
                        padding: "2px 6px",
                        borderRadius: "999px",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "var(--red)",
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.24)",
                      }}
                    >
                      Queda {projectedStockLabel}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); changeQty(idx, -1); }}
                    disabled={operationsDisabled}
                    style={{ width: "26px", height: "26px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "14px", flexShrink: 0 }}
                  >
                    −
                  </button>
                  {editingQty?.index === idx ? (
                    <input
                      type={item.soldByWeight ? "text" : "number"}
                      inputMode={item.soldByWeight ? "decimal" : "numeric"}
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
                        width: "42px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: "14px",
                        background: "var(--surface)",
                        border: "1.5px solid var(--primary)",
                        borderRadius: "6px",
                        color: "var(--text)",
                        padding: "2px 4px",
                        outline: "none",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!operationsDisabled) {
                          setEditingQty({
                            index: idx,
                            draft: item.soldByWeight ? (item.quantity / 1000).toFixed(3) : String(item.quantity),
                          });
                        }
                      }}
                      title={item.soldByWeight ? "Toca para editar peso" : "Tocá para editar cantidad"}
                      style={{
                        minWidth: item.soldByWeight ? "58px" : "42px",
                        textAlign: "center",
                        fontWeight: 700,
                        cursor: operationsDisabled ? "default" : "text",
                        padding: "2px 4px",
                        borderRadius: "4px",
                        border: operationsDisabled ? "none" : "1px dashed var(--border)",
                        fontSize: "14px",
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
                      {item.soldByWeight ? formatSaleItemWeightLabel(item) : item.quantity}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); changeQty(idx, 1); }}
                    disabled={operationsDisabled}
                    style={{ width: "26px", height: "26px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-2)", fontSize: "14px", flexShrink: 0 }}
                  >
                    +
                  </button>
                  <span style={{ minWidth: "60px", textAlign: "right", fontWeight: 600, fontSize: "13px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    {promoResult?.adjustedItems[idx] && promoResult.adjustedItems[idx].price < item.price ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: "var(--text-3)", fontSize: "10px", fontWeight: 500 }}>{formatARS(getSaleItemSubtotal(item))}</span>
                        <span style={{ color: "var(--primary)" }}>{formatARS(promoResult.adjustedItems[idx].price * (item.soldByWeight ? item.quantity / 1000 : item.quantity))}</span>
                      </>
                    ) : (
                      formatARS(getSaleItemSubtotal(item))
                    )}
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
            
            {promoResult && promoResult.totalDiscount > 0 && (
              <div style={{ marginTop: "4px", marginBottom: "12px", padding: "10px 12px", background: "rgba(34, 197, 94, 0.08)", borderRadius: "var(--radius)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--primary)" }}>Promociones aplicadas:</span>
                  <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--primary)" }}>- {formatARS(promoResult.totalDiscount)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {promoResult.applications.map((app, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "var(--primary)", fontSize: "11px", fontWeight: 500 }}>
                      <span style={{ opacity: 0.8 }}>✓ {app.description}</span>
                      <span style={{ opacity: 0.9 }}>- {formatARS(app.discountAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Separator / Border */}
            <div style={{ height: "1px", background: "var(--border)", margin: "12px 0" }} />

            {/* Secondary Actions: OTRO, GASTO, RETIRO */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isCashier ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: "8px",
              padding: "8px 12px 16px",
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
              padding: "0 12px 16px",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
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
          </div>
        )}
      </div> {/* End of POS Sidebar */}

      </div> {/* End of POS BODY */}

      {/* Modals */}
      {showReminderComposer && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => { setShowReminderComposer(false); resetReminderComposer(); }}>
            <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Dejar recordatorio</h2>
                  <p style={{ color: "var(--text-2)", fontSize: "14px", margin: "8px 0 0" }}>
                    Sirve para recordar algo al proximo turno o dispararlo a una hora puntual.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${reminderDelivery === "NEXT_SHIFT" ? "btn-green" : "btn-ghost"}`}
                    onClick={() => setReminderDelivery("NEXT_SHIFT")}
                  >
                    Al empezar el proximo turno
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${reminderDelivery === "SCHEDULED" ? "btn-green" : "btn-ghost"}`}
                    onClick={() => setReminderDelivery("SCHEDULED")}
                  >
                    A una hora puntual
                  </button>
                </div>

                {reminderDelivery === "SCHEDULED" && (
                  <div>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                      Fecha y hora
                    </label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={reminderScheduledFor}
                      onChange={(e) => setReminderScheduledFor(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                    Mensaje
                  </label>
                  <textarea
                    className="input"
                    value={reminderMessage}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    placeholder="Ej: revisar la heladera, dejar cambio chico, controlar pedido..."
                    rows={5}
                    maxLength={500}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ marginTop: "6px", textAlign: "right", fontSize: "12px", color: "var(--text-3)" }}>
                    {reminderMessage.trim().length}/500
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setShowReminderComposer(false);
                      resetReminderComposer();
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="btn btn-green" style={{ flex: 1.5 }} onClick={handleSaveReminder} disabled={savingReminder}>
                    {savingReminder ? "Guardando..." : "Guardar recordatorio"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {pendingReminder && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => void acknowledgePendingReminder()}>
            <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--primary)" }}>
                    Recordatorio
                  </div>
                  <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "6px 0 0" }}>
                    {pendingReminder.delivery === "SCHEDULED" ? "Mensaje para este turno" : "Mensaje del turno anterior"}
                  </h2>
                </div>

                <div
                  style={{
                    borderRadius: "16px",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    padding: "16px",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.45,
                    fontSize: "15px",
                  }}
                >
                  {pendingReminder.message}
                </div>

                <div style={{ fontSize: "13px", color: "var(--text-2)" }}>
                  Lo dejo {pendingReminder.createdByLabel}
                  {pendingReminder.scheduledFor
                    ? ` para ${new Intl.DateTimeFormat("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(pendingReminder.scheduledFor))}`
                    : "."}
                </div>

                <button className="btn btn-green" onClick={() => void acknowledgePendingReminder()}>
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showGasto && (
        <GastoModal
          employeeId={employeeId}
          onClose={() => setShowGasto(false)}
          onSuccess={() => { setShowGasto(false); fetchStats(); }}
          onSubscriptionRequired={(message) => {
            setShowGasto(false);
            promptSubscriptionActivation(message);
          }}
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
          onSubscriptionRequired={(message) => {
            setShowRetiro(false);
            promptSubscriptionActivation(message);
          }}
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
                      <div style={{ fontWeight: 700, color: "var(--primary)" }}>
                        {formatARS(
                          typeof v.price === "number" && Number.isFinite(v.price)
                            ? v.price
                            : variantSelector.product.price,
                        )}
                      </div>
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

      {weightSelector && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => setWeightSelector(null)} style={{ zIndex: 10001 }}>
            <div
              className="modal animate-slide-up"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "460px",
                width: "95%",
                maxHeight: "88vh",
                overflowY: "auto",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "4px" }}>Pesar producto</h2>
                  <div style={{ color: "var(--text-3)", fontSize: "13px" }}>
                    {weightSelector.variant ? `${weightSelector.product.name} - ${weightSelector.variant.name}` : weightSelector.product.name}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setWeightSelector(null)} style={{ padding: "8px 12px" }}>
                  Cerrar
                </button>
              </div>

              <div
                style={{
                  borderRadius: "18px",
                  overflow: "hidden",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  minHeight: "220px",
                  display: "flex",
                  alignItems: "stretch",
                  justifyContent: "center",
                }}
              >
                {weightSelector.product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={weightSelector.product.image}
                    alt={weightSelector.product.name}
                    style={{ width: "100%", height: "220px", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", minHeight: "220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--text-2)" }}>
                    <div style={{ fontSize: "44px" }}>{weightSelector.product.emoji || "🧾"}</div>
                    <div style={{ fontSize: "13px" }}>Sin foto disponible</div>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>Precio por kilo</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--primary)" }}>
                      {formatARS(
                        typeof weightSelector.variant?.price === "number" && Number.isFinite(weightSelector.variant.price)
                          ? weightSelector.variant.price
                          : weightSelector.product.price,
                      )}
                      /kg
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>Disponible</div>
                    <div style={{ fontSize: "18px", fontWeight: 700 }}>
                      {(() => {
                        const availableStock = getSelectionAvailableStock(weightSelector.product, weightSelector.variant);
                        return weightSelector.product.soldByWeight
                          ? `${(availableStock / 1000).toFixed(3)} kg`
                          : availableStock;
                      })()}
                    </div>
                  </div>
                </div>

                <label style={{ display: "grid", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
                    Peso a vender
                  </span>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    placeholder="250 g, 0.25 kg, 1/4"
                    value={weightSelector.draft}
                    onChange={(e) => setWeightSelector((current) => current ? { ...current, draft: e.target.value } : current)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmWeightSelection();
                      }
                      if (e.key === "Escape") {
                        setWeightSelector(null);
                      }
                    }}
                    autoFocus
                  />
                </label>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "var(--text-2)" }}>Subtotal estimado</span>
                  <strong>
                    {(() => {
                      const quantity = parseWeightInputToGrams(weightSelector.draft);
                      if (quantity === null || quantity <= 0) return "—";
                      const unitPrice =
                        typeof weightSelector.variant?.price === "number" && Number.isFinite(weightSelector.variant.price)
                          ? weightSelector.variant.price
                          : weightSelector.product.price;
                      return formatARS((unitPrice * quantity) / 1000);
                    })()}
                  </strong>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                <button className="btn btn-ghost" onClick={() => setWeightSelector(null)}>
                  Cancelar
                </button>
                <button className="btn btn-green" onClick={confirmWeightSelection}>
                  Agregar al ticket
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showSubscriptionPrompt && (
        <OperationalSubscriptionModal
          message={subscriptionPromptMessage || "Necesitas una suscripcion activa para usar esta accion."}
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
    </div>
  );
}

function createDemoShift(args: {
  openingAmount: number;
  assignee: ShiftAssignee;
}): ActiveShift {
  return {
    id: `demo-shift-${Date.now()}`,
    openingAmount: args.openingAmount,
    employeeId: args.assignee.employeeId,
    employeeName: args.assignee.employeeName,
    isDemo: true,
    employee: args.assignee.employeeId
      ? {
          id: args.assignee.employeeId,
          name: args.assignee.employeeName,
        }
      : null,
  };
}
