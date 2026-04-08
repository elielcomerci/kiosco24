"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatARS, applyPercentage } from "@/lib/utils";
import {
  BarcodeLookupResponse,
  BarcodeSuggestion,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import { parseWeightInputToGrams } from "@/lib/sale-item";
import BarcodeScanner from "@/components/caja/BarcodeScanner";
import CategoryModal, { type CategoryRecord } from "@/components/config/CategoryModal";
import CatalogSpreadsheetModal from "@/components/products/CatalogSpreadsheetModal";
import BulkVariantGroupModal, { type BulkVariantGroupPayload } from "@/components/products/BulkVariantGroupModal";
import InventoryValuationModal from "@/components/products/InventoryValuationModal";
import ProductThumb from "@/components/products/ProductThumb";
import ProductsActionsMenu from "@/components/products/ProductsActionsMenu";
import RestockHistoryModal from "@/components/products/RestockHistoryModal";
import WelcomeSubscriptionOfferModal from "@/components/subscription/WelcomeSubscriptionOfferModal";
import BackButton from "@/components/ui/BackButton";
import ModalPortal from "@/components/ui/ModalPortal";
import PrintablePage from "@/components/print/PrintablePage";
import { useRegisterShortcuts } from "@/components/ui/BranchWorkspace";
import {
  planStockTransfer,
  type StockTransferStrategy,
  type TransferPlanLotInput,
} from "@/lib/stock-transfer-plan";
import { optimizeProductImage, optimizeReceiptImage } from "@/lib/image-upload";

interface Variant {
  id?: string;
  name: string;
  barcode: string | null;
  internalCode?: string | null;
  price?: number | null;
  cost?: number | null;
  stock: number | null;
  availableStock?: number | null;
  minStock: number | null;
  readyForSale?: boolean;
  isNegativeStock?: boolean;
  isOutOfStock?: boolean;
  isBelowMinStock?: boolean;
  expiredQuantity?: number;
  expiringSoonQuantity?: number;
  nextExpiryOn?: string | null;
  hasTrackedLots?: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  priceMin?: number;
  priceMax?: number;
  hasVariablePrices?: boolean;
  cost: number | null;
  emoji: string | null;
  barcode: string | null;
  internalCode: string | null;
  image: string | null;
  brand: string | null;
  description: string | null;
  presentation: string | null;
  supplierName: string | null;
  notes: string | null;
  categoryId: string | null;
  stock: number | null;
  availableStock?: number | null;
  minStock: number | null;
  showInGrid: boolean;
  soldByWeight: boolean;
  readyForSale?: boolean;
  allowNegativeStock?: boolean;
  platformProductId?: string | null;
  platformSyncMode?: PlatformSyncMode;
  platformSourceUpdatedAt?: string | null;
  platformUpdateAvailable?: boolean;
  isNegativeStock?: boolean;
  isOutOfStock?: boolean;
  isBelowMinStock?: boolean;
  expiredQuantity?: number;
  expiringSoonQuantity?: number;
  nextExpiryOn?: string | null;
  hasTrackedLots?: boolean;
  variants?: Variant[];
}

type LotDraft = {
  id?: string;
  quantity: string;
  expiresOn: string;
  existing?: boolean;
};

type RestockAttachmentDraft = {
  url: string;
  name: string;
};

type StockModalOperation = "receive" | "correct";

type ProductModalSavePayload = {
  openStockAfter?: boolean;
  productId?: string;
  productName?: string;
  hasVariants?: boolean;
};

type ProductModalDraft = {
  name?: string;
  barcode?: string | null;
  internalCode?: string | null;
  image?: string | null;
  brand?: string | null;
  description?: string | null;
  presentation?: string | null;
  supplierName?: string | null;
  categoryId?: string | null;
  soldByWeight?: boolean;
};

type PricingMode = "SHARED" | "BRANCH";
type PlatformSyncMode = "MANUAL" | "AUTO";
type PlatformSyncActionMode = "image" | "text" | "all";
type ProductModalScannerTarget = "barcode" | "catalog";

type TransferLotRecord = TransferPlanLotInput & {
  id: string;
};

type StockModalPreset = {
  initialSearch?: string;
  initialOperation?: StockModalOperation;
  spotlightProductId?: string | null;
  entryNote?: string | null;
};

type Category = CategoryRecord;
type CollaborativeLookupState = "idle" | "loading" | "ready" | "error";
const AUTO_SUGGESTED_CATEGORY_COLOR = "#64748b";

const EMOJIS = ["🧃", "🥤", "🍫", "🍬", "🍭", "🥜", "🧀", "🍞", "🥛", "🧹", "🧴", "🪥", "📦", "💊", "🪙", "🎴"];

function lotOwnerKey(productId: string, variantId?: string | null) {
  return variantId ? `variant:${variantId}` : `product:${productId}`;
}

function parseStockQuantity(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatStockQuantity(quantity: number | null | undefined, soldByWeight = false) {
  if (quantity === null || quantity === undefined) {
    return "";
  }

  return soldByWeight ? (quantity / 1000).toFixed(3) : String(quantity);
}

function parseStockQuantityInput(value: string, soldByWeight = false) {
  return soldByWeight ? parseWeightInputToGrams(value, true) : parseStockQuantity(value);
}

function validLotRows(rows: LotDraft[], includeExisting: boolean) {
  return rows.filter((row) => {
    if (!includeExisting && row.existing) {
      return false;
    }

    const quantity = parseStockQuantity(row.quantity);
    return Boolean(quantity && row.expiresOn);
  });
}

function serializeLotRows(rows: LotDraft[] | undefined, includeExisting: boolean) {
  return JSON.stringify(
    validLotRows(rows ?? [], includeExisting).map((row) => ({
      quantity: parseStockQuantity(row.quantity),
      expiresOn: row.expiresOn,
    })),
  );
}

function matchesProductSearch(product: Product, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }

  // Buscar por palabras completas para más flexibilidad
  const queryWords = query.split(/\s+/).filter(Boolean);

  const searchableValues = [
    product.name,
    product.barcode,
    product.internalCode,
    product.brand,
    product.supplierName,
    product.description,
    product.presentation,
    product.notes,
    ...(product.variants?.flatMap((variant) => [
      variant.name,
      variant.barcode,
      variant.internalCode,
    ]) ?? []),
  ];

  const searchText = searchableValues
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase())
    .join(" ");

  // Todos los palabras de la búsqueda deben estar presentes en el texto combinado
  return queryWords.every((word) => searchText.includes(word));
}

function normalizeLookupCandidate(value?: string | null) {
  const normalized = normalizeBarcodeCode(value ?? "");
  return normalized || null;
}

function buildProductLookupCodeSet(product: Product) {
  const codes = new Set<string>();

  const productCode = normalizeLookupCandidate(product.barcode);
  if (productCode) {
    codes.add(productCode);
  }

  for (const variant of product.variants ?? []) {
    const variantCode = normalizeLookupCandidate(variant.barcode);
    if (variantCode) {
      codes.add(variantCode);
    }
  }

  return codes;
}

function buildSuggestionLookupCodeSet(suggestion: BarcodeSuggestion) {
  const codes = new Set<string>();

  const suggestionCode = normalizeLookupCandidate(suggestion.code);
  if (suggestionCode) {
    codes.add(suggestionCode);
  }

  for (const variant of suggestion.variants ?? []) {
    const variantCode = normalizeLookupCandidate(variant.barcode);
    if (variantCode) {
      codes.add(variantCode);
    }
  }

  return codes;
}

function buildCollaborativeSuggestionKey(suggestion: BarcodeSuggestion) {
  const variantsKey = (suggestion.variants ?? [])
    .map((variant) => `${variant.name}:${normalizeLookupCandidate(variant.barcode) ?? ""}`)
    .join("|");

  return [
    suggestion.name.trim().toLocaleLowerCase("es-AR"),
    normalizeLookupCandidate(suggestion.code) ?? "",
    variantsKey,
  ].join("::");
}

function findLocalProductForSuggestion(products: Product[], suggestion: BarcodeSuggestion) {
  const suggestionCodes = buildSuggestionLookupCodeSet(suggestion);
  if (suggestionCodes.size === 0) {
    return null;
  }

  return (
    products.find((product) => {
      const productCodes = buildProductLookupCodeSet(product);
      for (const code of productCodes) {
        if (suggestionCodes.has(code)) {
          return true;
        }
      }

      return false;
    }) ?? null
  );
}

function mergeProductsById(primary: Product[], extra: Product[]) {
  const merged = new Map<string, Product>();

  for (const product of primary) {
    merged.set(product.id, product);
  }

  for (const product of extra) {
    if (!merged.has(product.id)) {
      merged.set(product.id, product);
    }
  }

  return Array.from(merged.values());
}

function findCategoryByNameInList(categoryName: string, sourceCategories: Category[]) {
  const normalizedCategoryName = categoryName.trim().toLocaleLowerCase("es-AR");
  return (
    sourceCategories.find(
      (category) =>
        category.name.trim().toLocaleLowerCase("es-AR") === normalizedCategoryName,
    ) ?? null
  );
}

function formatExpiryBadge(product: Product) {
  if ((product.expiredQuantity ?? 0) > 0) {
    return `${product.expiredQuantity} vencido${product.expiredQuantity === 1 ? "" : "s"}`;
  }

  if ((product.expiringSoonQuantity ?? 0) > 0 && product.nextExpiryOn) {
    const formattedDate = new Date(product.nextExpiryOn).toLocaleDateString("es-AR");
    return `${product.expiringSoonQuantity} vence${product.expiringSoonQuantity === 1 ? "" : "n"} ${formattedDate}`;
  }

  return null;
}

function renderExpiryBadge(product: Product) {
  const label = formatExpiryBadge(product);
  if (!label) {
    return null;
  }

  const isExpired = (product.expiredQuantity ?? 0) > 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        color: isExpired ? "var(--red)" : "var(--amber)",
        background: isExpired ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
        border: `1px solid ${isExpired ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
      }}
    >
      {isExpired ? "Vencido" : "Próximo"}
      <span style={{ fontWeight: 600 }}>{label}</span>
    </span>
  );
}

function getProductStockBadge(product: Product) {
  if (product.variants && product.variants.length > 0) {
    const negativeCount = product.variants.filter((variant) => variant.isNegativeStock).length;
    const outCount = product.variants.filter((variant) => variant.isOutOfStock).length;
    const lowCount = product.variants.filter((variant) => variant.isBelowMinStock).length;

    if (negativeCount > 0) {
      return {
        tone: "negative" as const,
        label: `${negativeCount} variante${negativeCount === 1 ? "" : "s"} en negativo`,
      };
    }

    if (outCount > 0) {
      return {
        tone: "out" as const,
        label: `${outCount} variante${outCount === 1 ? "" : "s"} sin stock`,
      };
    }

    if (lowCount > 0) {
      return {
        tone: "low" as const,
        label: `${lowCount} variante${lowCount === 1 ? "" : "s"} bajo mínimo`,
      };
    }

    return null;
  }

  if (product.isNegativeStock) {
    return {
      tone: "negative" as const,
      label: `Stock negativo: ${product.availableStock ?? product.stock ?? 0}`,
    };
  }

  if (product.isOutOfStock) {
    return {
      tone: "out" as const,
      label: "Sin stock",
    };
  }

  if (product.isBelowMinStock) {
    return {
      tone: "low" as const,
      label: `Stock bajo${typeof product.minStock === "number" && product.minStock > 0 ? ` · mín. ${product.minStock}` : ""}`,
    };
  }

  return null;
}

function renderStockBadge(product: Product) {
  if (!product.variants || product.variants.length === 0) {
    return null;
  }

  const badge = getProductStockBadge(product);
  if (!badge) {
    return null;
  }

  const palette =
    badge.tone === "negative"
      ? {
          color: "var(--red)",
          background: "rgba(239,68,68,0.12)",
          border: "rgba(239,68,68,0.25)",
        }
      : badge.tone === "out"
        ? {
            color: "var(--text-2)",
            background: "rgba(148,163,184,0.14)",
            border: "rgba(148,163,184,0.22)",
          }
        : {
            color: "var(--amber)",
            background: "rgba(245,158,11,0.12)",
            border: "rgba(245,158,11,0.25)",
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        color: palette.color,
        background: palette.background,
        border: `1px solid ${palette.border}`,
      }}
    >
      {badge.label}
    </span>
  );
}

function getProductTotalStock(product: Product) {
  if (product.variants && product.variants.length > 0) {
    return product.variants.reduce((acc, variant) => acc + (variant.stock || 0), 0);
  }

  return product.stock;
}

function renderProductStockSummary(product: Product) {
  const totalStock = getProductTotalStock(product);
  if (totalStock === null || totalStock === undefined) {
    return null;
  }

  const isVariantProduct = Boolean(product.variants && product.variants.length > 0);

  const tone =
    typeof totalStock === "number" && totalStock < 0
      ? {
          color: "var(--red)",
          background: "rgba(127,29,29,.82)",
          border: "rgba(248,113,113,.35)",
        }
      : totalStock > 0
        ? {
            color: "#f8fafc",
            background: "rgba(15,23,42,.92)",
            border: "rgba(148,163,184,.24)",
          }
        : {
            color: "#fff7ed",
            background: "rgba(124,45,18,.9)",
            border: "rgba(251,146,60,.35)",
          };

  const availableHint =
    typeof product.availableStock === "number" && product.availableStock !== product.stock
      ? ` - Vendible ${formatStockQuantity(product.availableStock, product.soldByWeight)}`
      : "";

  const statusHint = !isVariantProduct
    ? product.isNegativeStock
      ? " - Negativo"
      : product.isOutOfStock
        ? " - Sin stock"
        : product.isBelowMinStock
          ? typeof product.minStock === "number" && product.minStock > 0
            ? ` - Bajo min. ${formatStockQuantity(product.minStock, product.soldByWeight)}`
            : " - Bajo minimo"
          : ""
    : "";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "8px",
        padding: "6px 10px",
        borderRadius: "999px",
        fontSize: "calc(12px * var(--device-font-scale, 1))",
        fontWeight: 800,
        color: tone.color,
        background: tone.background,
        border: `1px solid ${tone.border}`,
        boxShadow: "0 8px 18px rgba(2,6,23,.18)",
      }}
    >
      <span style={{ letterSpacing: ".02em", textTransform: "uppercase", opacity: 0.86 }}>Stock</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatStockQuantity(totalStock, product.soldByWeight)}</span>
      {availableHint && <span style={{ fontWeight: 700, opacity: 0.92 }}>{availableHint}</span>}
      {statusHint && <span style={{ fontWeight: 700, opacity: 0.92 }}>{statusHint}</span>}
    </div>
  );
}

function renderPlatformSyncBadge(product: Product, visible: boolean) {
  if (!visible || !product.platformProductId || !product.platformUpdateAvailable) {
    return null;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        color: "#38bdf8",
        background: "rgba(56,189,248,0.12)",
        border: "1px solid rgba(56,189,248,0.22)",
      }}
    >
      Base general actualizada
    </span>
  );
}

function getProductCardBorder(product: Product) {
  const badge = getProductStockBadge(product);
  if (!badge) {
    return {
      border: "1px solid var(--border)",
      boxShadow: "none",
    };
  }

  if (badge.tone === "negative") {
    return {
      border: "1px solid rgba(239,68,68,0.55)",
      boxShadow: "0 0 0 1px rgba(239,68,68,0.14) inset",
    };
  }

  if (badge.tone === "out") {
    return {
      border: "1px solid rgba(148,163,184,0.42)",
      boxShadow: "0 0 0 1px rgba(148,163,184,0.08) inset",
    };
  }

  return {
    border: "1px solid rgba(245,158,11,0.5)",
    boxShadow: "0 0 0 1px rgba(245,158,11,0.1) inset",
  };
}

// ─── Product Form Modal ────────────────────────────────────────────────────────
function ProductModal({
  product,
  draft = null,
  branchId,
  pricingMode,
  categories,
  onClose,
  onSave,
  onCategoriesChange,
  isOwner,
  allowOpenStockAfter = true,
  onOpenCorrection,
}: {
  product: Product | null;
  draft?: ProductModalDraft | null;
  branchId: string;
  pricingMode: PricingMode;
  categories: Category[];
  onClose: () => void;
  onSave: (payload?: ProductModalSavePayload) => void;
  onCategoriesChange: (categories: Category[]) => void;
  isOwner: boolean;
  allowOpenStockAfter?: boolean;
  onOpenCorrection?: () => void;
}) {
  const isNew = !product;
  const isInlineCreateOnly = isNew && !allowOpenStockAfter;
  const draftSeed = product ? null : draft;
  const [name, setName] = useState(product?.name ?? draftSeed?.name ?? "");
  const [emoji, setEmoji] = useState(product?.emoji || "");
  const [barcode, setBarcode] = useState(product?.barcode ?? draftSeed?.barcode ?? "");
  const [internalCode, setInternalCode] = useState(product?.internalCode ?? draftSeed?.internalCode ?? "");
  const [image, setImage] = useState(product?.image ?? draftSeed?.image ?? "");
  const [brand, setBrand] = useState(product?.brand ?? draftSeed?.brand ?? "");
  const [description, setDescription] = useState(product?.description ?? draftSeed?.description ?? "");
  const [presentation, setPresentation] = useState(product?.presentation ?? draftSeed?.presentation ?? "");
  const [supplierName, setSupplierName] = useState(product?.supplierName ?? draftSeed?.supplierName ?? "");
  const [notes, setNotes] = useState(product?.notes || "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? draftSeed?.categoryId ?? "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [cost, setCost] = useState(product?.cost?.toString() || "");
  const initialSoldByWeight = product?.soldByWeight ?? draftSeed?.soldByWeight ?? false;
  const [stock, setStock] = useState(formatStockQuantity(product?.stock ?? null, initialSoldByWeight));
  const [stockAdjustment, setStockAdjustment] = useState("");
  const [minStock, setMinStock] = useState(formatStockQuantity(product?.minStock ?? null, initialSoldByWeight));
  const [showInGrid, setShowInGrid] = useState(product?.showInGrid ?? true);
  const [soldByWeight, setSoldByWeight] = useState(initialSoldByWeight);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<ProductModalScannerTarget | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(product?.variants || []);
  const [variantStockAdjustments, setVariantStockAdjustments] = useState<Record<string, string>>({});
  const [hasVariants, setHasVariants] = useState((product?.variants?.length ?? 0) > 0);
  const [suggestion, setSuggestion] = useState<BarcodeSuggestion | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<BarcodeSuggestion[]>([]);
  const [catalogSuggestions, setCatalogSuggestions] = useState<BarcodeSuggestion[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showCatalogBrowser, setShowCatalogBrowser] = useState(false);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "ready">("idle");
  const [nameLookupState, setNameLookupState] = useState<"idle" | "loading" | "ready">("idle");
  const [catalogLookupState, setCatalogLookupState] = useState<"idle" | "loading" | "ready">("idle");
  const [dismissedSuggestionCode, setDismissedSuggestionCode] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [platformSyncMode, setPlatformSyncMode] = useState<PlatformSyncMode>(product?.platformSyncMode ?? "MANUAL");
  const [syncingPlatform, setSyncingPlatform] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const normalizedBarcode = normalizeBarcodeCode(barcode);
  const productHasTrackedLots = Boolean(product?.hasTrackedLots);
  const originalSimpleStock = product?.stock ?? 0;
  const parsedStockAdjustment = parseStockQuantityInput(stockAdjustment, soldByWeight);
  const projectedSimpleStock =
    parsedStockAdjustment !== null && parsedStockAdjustment > 0
      ? originalSimpleStock + parsedStockAdjustment
      : null;
  const lookupCode =
    !hasVariants &&
    canLookupBarcode(normalizedBarcode) &&
    dismissedSuggestionCode !== normalizedBarcode
      ? normalizedBarcode
      : null;
  const visibleSuggestion =
    lookupCode &&
    suggestion &&
    normalizeBarcodeCode(suggestion.code) === lookupCode
      ? suggestion
      : null;
  const effectiveLookupState =
    !lookupCode ? "idle" : visibleSuggestion ? "ready" : lookupState === "loading" ? "loading" : "idle";
  const normalizedNameQuery = name.trim();
  const normalizedCatalogQuery = catalogSearch.trim();
  const shouldLookupByName =
    isNew &&
    normalizedNameQuery.length >= 3 &&
    !visibleSuggestion &&
    !applyingSuggestion;
  const normalizedCatalogCode = normalizeBarcodeCode(catalogSearch);
  const canFilterCatalog =
    isNew &&
    (normalizedCatalogQuery.length === 0 ||
      normalizedCatalogQuery.length >= 2 ||
      canLookupBarcode(normalizedCatalogCode));
  const hasPlatformLink = Boolean(product?.platformProductId);
  const canManagePlatformSync = hasPlatformLink && isOwner;

  const toNum = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const updateVariant = (index: number, changes: Partial<Variant>) => {
    setVariants((prev) =>
      prev.map((variant, variantIndex) =>
        variantIndex === index
          ? { ...variant, ...changes }
          : variant,
      ),
    );
  };

  const findCategoryByName = (categoryName: string, sourceCategories: Category[] = categories) => {
    const normalizedCategoryName = categoryName.trim().toLocaleLowerCase("es-AR");
    return (
      sourceCategories.find(
        (category) =>
          category.name.trim().toLocaleLowerCase("es-AR") === normalizedCategoryName,
      ) ?? null
    );
  };

  const refreshCategories = async (selectedCategoryId?: string) => {
    const catRes = await fetch("/api/categorias", {
      headers: { "x-branch-id": branchId },
    });
    if (!catRes.ok) {
      alert("No se pudieron actualizar las categorias.");
      return null;
    }

    const catData = await catRes.json();
    const nextCategories = Array.isArray(catData) ? (catData as Category[]) : [];
    onCategoriesChange(nextCategories);

    if (selectedCategoryId) {
      setCategoryId(selectedCategoryId);
    }

    return nextCategories;
  };

  const ensureSuggestionCategory = async (categoryName: string) => {
    const trimmedCategoryName = categoryName.trim();
    if (!trimmedCategoryName) {
      return null;
    }

    const existingCategory = findCategoryByName(trimmedCategoryName);
    if (existingCategory) {
      setCategoryId(existingCategory.id);
      return existingCategory.id;
    }

    const res = await fetch("/api/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({
        name: trimmedCategoryName,
        color: AUTO_SUGGESTED_CATEGORY_COLOR,
        showInGrid: true,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "No se pudo crear la categoria sugerida.");
    }

    const savedCategory = (await res.json()) as Category;
    await refreshCategories(savedCategory.id);
    return savedCategory.id;
  };

  const applySuggestion = async (nextSuggestion: BarcodeSuggestion) => {
    setApplyingSuggestion(true);

    try {
    const suggestedVariants = (nextSuggestion.variants ?? []).map((variant) => ({
      name: variant.name,
      barcode: variant.barcode,
      stock: null,
      minStock: null,
    }));

      if (nextSuggestion.categoryName) {
        await ensureSuggestionCategory(nextSuggestion.categoryName);
      }

      setName(nextSuggestion.name);
      setBrand(nextSuggestion.brand || "");
      setDescription(nextSuggestion.description || "");
      setPresentation(nextSuggestion.presentation || "");
      setBarcode(suggestedVariants.length > 0 ? "" : (nextSuggestion.code || ""));
    if (nextSuggestion.image) {
      setImage(nextSuggestion.image);
    }
    if (suggestedVariants.length > 0) {
      setHasVariants(true);
      setVariants(suggestedVariants);
      setStock("");
      setMinStock("");
    } else {
      setHasVariants(false);
    }
    setNameSuggestions([]);
    setNameLookupState("idle");
    setCatalogSearch("");
    setCatalogLookupState("idle");
    setShowCatalogBrowser(false);
    setSuggestion(nextSuggestion);
    setLookupState("ready");
    setDismissedSuggestionCode(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "No se pudo aplicar la sugerencia.");
    } finally {
      setApplyingSuggestion(false);
    }
  };

  useEffect(() => {
    if (!lookupCode) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLookupState("loading");

      try {
        const res = await fetch(`/api/platform-products/lookup?code=${encodeURIComponent(lookupCode)}`, {
          headers: { "x-branch-id": branchId },
        });
        const data = (await res.json()) as BarcodeLookupResponse;

        if (cancelled) return;

        if (data.found && data.suggestion) {
          setSuggestion(data.suggestion);
          setLookupState("ready");
        } else {
          setSuggestion(null);
          setLookupState("idle");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setSuggestion(null);
          setLookupState("idle");
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [lookupCode]);

  useEffect(() => {
    if (!shouldLookupByName) {
      setNameSuggestions([]);
      setNameLookupState("idle");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setNameLookupState("loading");

      try {
        const res = await fetch(`/api/platform-products/lookup?q=${encodeURIComponent(normalizedNameQuery)}`, {
          headers: { "x-branch-id": branchId },
        });
        const data = (await res.json()) as BarcodeLookupResponse;

        if (cancelled) return;

        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        setNameSuggestions(suggestions);
        setNameLookupState(suggestions.length > 0 ? "ready" : "idle");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setNameSuggestions([]);
          setNameLookupState("idle");
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedNameQuery, shouldLookupByName]);

  useEffect(() => {
    if (!isNew || applyingSuggestion) {
      setCatalogSuggestions([]);
      setCatalogLookupState("idle");
      return;
    }

    if (!canFilterCatalog) {
      setCatalogSuggestions([]);
      setCatalogLookupState("idle");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCatalogLookupState("loading");

      try {
        const params = new URLSearchParams({
          browse: "1",
          limit: "12",
        });

        if (normalizedCatalogQuery) {
          params.set("q", normalizedCatalogQuery);
        }

        const res = await fetch(`/api/platform-products/lookup?${params.toString()}`, {
          headers: { "x-branch-id": branchId },
        });
        const data = (await res.json()) as BarcodeLookupResponse;

        if (cancelled) return;

        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        setCatalogSuggestions(suggestions);
        setCatalogLookupState(suggestions.length > 0 ? "ready" : "idle");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setCatalogSuggestions([]);
          setCatalogLookupState("idle");
        }
      }
    }, normalizedCatalogQuery ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [applyingSuggestion, canFilterCatalog, isNew, normalizedCatalogQuery]);

  const handleSave = async (openStockAfter = false) => {
    if (!name.trim()) return;
    setLoading(true);
    setSaveError(null);

    const normalizedMinStock = hasVariants ? null : parseStockQuantityInput(minStock, soldByWeight);

    const payload = {
      name: name.trim(),
      emoji: emoji || null,
      barcode: hasVariants ? null : (barcode.trim() || null),
      internalCode: internalCode.trim() || null,
      image: image || null,
      brand: brand.trim() || null,
      description: description.trim() || null,
      presentation: presentation.trim() || null,
      supplierName: supplierName.trim() || null,
      notes: notes.trim() || null,
      categoryId: categoryId || null,
      price: isInlineCreateOnly ? null : toNum(price),
      cost: isInlineCreateOnly ? null : toNum(cost),
      stock: hasVariants ? undefined : isInlineCreateOnly ? 0 : isNew ? (parsedStockAdjustment !== null && parsedStockAdjustment > 0 ? parsedStockAdjustment : parseStockQuantityInput(stock, soldByWeight)) : undefined,
      stockAdjustment: hasVariants ? undefined : isNew ? undefined : (parsedStockAdjustment !== null && parsedStockAdjustment > 0 ? parsedStockAdjustment : undefined),
      minStock: normalizedMinStock,
      showInGrid,
      soldByWeight,
      ...(isOwner ? { platformSyncMode } : {}),
      variants: hasVariants ? variants.map((v, i) => {
        const key = v.id || `index-${i}`;
        const adjustment = parseStockQuantityInput(variantStockAdjustments[key] || "", soldByWeight);
        const currentVariantStock = v.stock ?? 0;
        const isNewVariant = !v.id;
        
        return {
          id: v.id,
          name: v.name.trim(),
          barcode: v.barcode?.trim() || null,
          internalCode: v.internalCode?.trim() || null,
          price: isInlineCreateOnly ? null : toNum(v.price?.toString() || ""),
          cost: isInlineCreateOnly ? null : toNum(v.cost?.toString() || ""),
          stock: isInlineCreateOnly ? null : isNewVariant ? (adjustment !== null && adjustment > 0 ? adjustment : parseStockQuantityInput(v.stock?.toString() || "", soldByWeight)) : undefined,
          stockAdjustment: isNewVariant ? undefined : (adjustment !== null && adjustment > 0 ? adjustment : undefined),
          minStock: parseStockQuantityInput(v.minStock?.toString() || "", soldByWeight)
        };
      }).filter(v => v.name) : []
    };

    try {
      const res = await (isNew ? fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(payload),
      }) : fetch(`/api/productos/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(payload),
      }));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSaveError(data?.error || "No se pudo guardar el producto.");
        return;
      }

      onSave({
        openStockAfter,
        productId: typeof data?.id === "string" ? data.id : product?.id,
        productName: typeof data?.name === "string" ? data.name : name.trim(),
        hasVariants: Array.isArray(data?.variants) ? data.variants.length > 0 : hasVariants,
      });
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo guardar el producto.");
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async (mode: PlatformSyncActionMode = "all") => {
    if (!product) {
      return;
    }

    setSyncingPlatform(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/productos/${product.id}/sync-platform`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSaveError(data?.error || "No se pudo sincronizar con la base general.");
        return;
      }

      onSave();
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo sincronizar con la base general.");
    } finally {
      setSyncingPlatform(false);
    }
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/productos/${product!.id}`, {
        method: "DELETE",
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSaveError(data?.error || "No se pudo eliminar el producto.");
        return;
      }

      onSave();
    } catch (error) {
      console.error(error);
      setSaveError("No se pudo eliminar el producto.");
      return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
        className="modal-overlay animate-fade-in" 
        onClick={onClose}
        style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }} // Alineado abajo para tel.
      >
        <div 
          className="modal animate-slide-up" 
          onClick={(e) => e.stopPropagation()}
          style={{ 
            maxHeight: "85dvh", // usa dvh y menor % para dejar espacio al teclado virtual
            overflowY: "auto", 
            padding: "20px",
            width: "100%",
            maxWidth: "500px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
              {isNew ? "Nuevo producto" : "Editar producto"}
            </h2>
          </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Codigo de barras
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              ref={barcodeRef}
              className="input"
              placeholder={hasVariants ? "Las variantes llevan su propio codigo" : "Escanea o escribe el codigo"}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              style={{ flex: 1 }}
              autoFocus={isNew}
              disabled={hasVariants}
            />
            <button
              className="btn btn-ghost"
              style={{ padding: "0 16px", flexShrink: 0, fontSize: "20px" }}
              onClick={() => setScannerTarget("barcode")}
              title="Escanear con camara"
              disabled={hasVariants}
            >
              📷
            </button>
          </div>
          {hasVariants && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
              Al usar variantes, el codigo principal se elimina y cada variante usa el suyo.
            </div>
          )}
          {effectiveLookupState === "loading" && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
              Buscando en la base general...
            </div>
          )}
          {effectiveLookupState === "ready" && visibleSuggestion && (
            <div
              style={{
                marginTop: "10px",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
                Base general
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {visibleSuggestion.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={visibleSuggestion.image ?? undefined}
                    alt={visibleSuggestion.name}
                    style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "10px",
                      background: "var(--surface)",
                      border: "1px dashed var(--border)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{visibleSuggestion.name}</div>
                  {(visibleSuggestion.brand || visibleSuggestion.presentation || visibleSuggestion.description) && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      {[suggestion?.brand, suggestion?.presentation, suggestion?.description].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {visibleSuggestion.categoryName && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      Categoria sugerida: {visibleSuggestion.categoryName}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setDismissedSuggestionCode(normalizeBarcodeCode(barcode));
                  }}
                >
                  Ocultar
                </button>
                <button
                  className="btn btn-green"
                  style={{ flex: 1 }}
                  onClick={() => visibleSuggestion && void applySuggestion(visibleSuggestion)}
                  disabled={applyingSuggestion}
                >
                  {applyingSuggestion ? "Aplicando..." : "Usar"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Codigo interno
          </label>
          <input
            className="input"
            placeholder="SKU o referencia propia"
            value={internalCode}
            onChange={(e) => setInternalCode(e.target.value)}
          />
        </div>

        {/* Emoji Picker */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
          <button
            style={{
              width: "56px",
              height: "56px",
              fontSize: "28px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onClick={() => setShowEmojiPicker((v) => !v)}
          >
            {emoji || "＋"}
          </button>
            <input
              className="input"
              placeholder="Nombre del producto *"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameSuggestions.length > 0) {
                  setNameSuggestions([]);
                }
              }}
              style={{ flex: 1 }}
            />
          </div>

        {shouldLookupByName && (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
              Coincidencias en base general
            </div>

            {nameLookupState === "loading" && (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Buscando coincidencias por nombre...
              </div>
            )}

            {nameLookupState !== "loading" && nameSuggestions.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                No encontramos una ficha parecida todavia.
              </div>
            )}

            {nameSuggestions.map((item) => (
              <div
                key={`${item.code}-${item.name}`}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  padding: "10px",
                  borderRadius: "12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: "var(--surface-2)",
                      border: "1px dashed var(--border)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  {(item.brand || item.presentation || item.description) && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      {[item.brand, item.presentation, item.description].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {item.categoryName && (
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                      Categoria sugerida: {item.categoryName}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-green"
                  style={{ flexShrink: 0 }}
                  onClick={() => void applySuggestion(item)}
                  disabled={applyingSuggestion}
                >
                  {applyingSuggestion ? "Aplicando..." : "Usar"}
                </button>
              </div>
            ))}
          </div>
        )}

        {isNew && (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "var(--radius)",
              border: "1px solid rgba(56,189,248,0.18)",
              background: "rgba(56,189,248,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowCatalogBrowser((current) => !current)}
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                padding: 0,
                border: "none",
                background: "transparent",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#38bdf8" }}>
                  Base general
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.45 }}>
                  {showCatalogBrowser
                    ? "Busca por nombre o codigo y carga la ficha en un toque."
                    : "Opcional. Abrila solo si necesitas buscar en la base colaborativa."}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {showCatalogBrowser && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--text-3)",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: "rgba(15,23,42,0.08)",
                      border: "1px solid rgba(148,163,184,0.18)",
                    }}
                  >
                    {catalogSuggestions.length} visibles
                  </span>
                )}
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#38bdf8" }}>
                  {showCatalogBrowser ? "Ocultar" : "Abrir"}
                </span>
              </div>
            </button>

            {showCatalogBrowser && (
              <>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                className="input"
                placeholder="Buscar por nombre o escanear codigo"
                value={catalogSearch}
                onChange={(e) => {
                  setShowCatalogBrowser(true);
                  setCatalogSearch(e.target.value);
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0 14px", flexShrink: 0, fontSize: "20px" }}
                onClick={() => {
                  setShowCatalogBrowser(true);
                  setScannerTarget("catalog");
                }}
                title="Escanear para buscar en la base general"
              >
                📷
              </button>
            </div>

            {!canFilterCatalog && (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Escribe al menos 2 letras o escanea un codigo para filtrar mejor.
              </div>
            )}

            {canFilterCatalog && catalogLookupState === "loading" && (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                Cargando productos de la base general...
              </div>
            )}

            {canFilterCatalog && catalogLookupState !== "loading" && catalogSuggestions.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                No encontramos coincidencias en la base general.
              </div>
            )}

            {catalogSuggestions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "280px",
                  overflowY: "auto",
                  paddingRight: "2px",
                }}
              >
                {catalogSuggestions.map((item) => (
                  <div
                    key={`catalog-${item.code}-${item.name}`}
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px",
                      borderRadius: "12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "10px",
                          background: "var(--surface-2)",
                          border: "1px dashed var(--border)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      {(item.brand || item.presentation || item.description) && (
                        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                          {[item.brand, item.presentation, item.description].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px", fontSize: "12px", color: "var(--text-3)" }}>
                        {item.code && <span>Cod. {item.code}</span>}
                        {item.categoryName && <span>{item.categoryName}</span>}
                        {item.variants && item.variants.length > 0 && (
                          <span>{item.variants.length} variante{item.variants.length === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-green"
                      style={{ flexShrink: 0 }}
                      onClick={() => void applySuggestion(item)}
                      disabled={applyingSuggestion}
                    >
                      {applyingSuggestion ? "Aplicando..." : "Usar"}
                    </button>
                  </div>
                ))}
              </div>
            )}
              </>
            )}
          </div>
        )}

        {showEmojiPicker && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              padding: "10px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              marginBottom: "12px",
            }}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                style={{ fontSize: "24px", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
                onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
              >
                {e}
              </button>
            ))}
            <button
              style={{ fontSize: "12px", color: "var(--text-3)", padding: "4px 8px", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => { setEmoji(""); setShowEmojiPicker(false); }}
            >
              Quitar
            </button>
          </div>
        )}

        {/* Categoría & Foto */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px", alignItems: "flex-end" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block" }}>
                Categoría
              </label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0 }}
                onClick={() => setShowCategoryModal(true)}
              >
                + Nueva
              </button>
            </div>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ width: "100%", background: "var(--surface)", cursor: "pointer" }}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
              Foto
            </label>
            <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "10px", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "var(--surface)" }}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : uploadingImage ? (
                <span className="animate-pulse" style={{ fontSize: "12px" }}>...</span>
              ) : (
                <span style={{ fontSize: "18px", opacity: 0.5 }}>📷</span>
              )}

              <input
                type="file"
                accept="image/*"
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                disabled={uploadingImage}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  try {
                    const optimizedFile = await optimizeProductImage(file);
                    const formData = new FormData();
                    formData.append("file", optimizedFile);
                    formData.append("folder", "products");
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.secure_url) setImage(data.secure_url);
                  } catch (err) {
                    console.error(err);
                  }
                  setUploadingImage(false);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
              Marca
            </label>
            <input
              className="input"
              placeholder="Opcional"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
              Presentacion
            </label>
            <input
              className="input"
              placeholder="Ej: 500 ml"
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Proveedor habitual
          </label>
          <input
            className="input"
            placeholder="Opcional"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Descripcion
          </label>
          <textarea
            className="input"
            placeholder="Opcional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
            Notas internas
          </label>
          <textarea
            className="input"
            placeholder="Dato util para tu equipo: proveedor, ubicacion, compra minima..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        {canManagePlatformSync && (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "14px",
              border: "1px solid rgba(56,189,248,0.18)",
              background: "rgba(56,189,248,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#38bdf8" }}>
                Base colaborativa
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.5 }}>
                Sincroniza foto y datos descriptivos desde la base general. Precio, stock y demas datos operativos quedan locales.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(["MANUAL", "AUTO"] as PlatformSyncMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={platformSyncMode === mode ? "btn btn-green" : "btn btn-ghost"}
                  style={{ flex: 1, minWidth: "120px" }}
                  onClick={() => setPlatformSyncMode(mode)}
                >
                  {mode === "AUTO" ? "Auto" : "Manual"}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 }}>
              {platformSyncMode === "AUTO"
                ? "Los proximos cambios aprobados en la base general se aplican solos en este producto."
                : "Si la base mejora, lo vas a ver y podes aplicarlo cuando quieras."}
            </div>
            {product?.platformUpdateAvailable && (
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8" }}>
                  Hay cambios disponibles en la base general.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid rgba(56,189,248,0.32)" }}
                    onClick={() => void handleSyncNow("image")}
                    disabled={syncingPlatform || loading}
                  >
                    {syncingPlatform ? "Actualizando..." : "Solo fotos"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid rgba(56,189,248,0.32)" }}
                    onClick={() => void handleSyncNow("text")}
                    disabled={syncingPlatform || loading}
                  >
                    {syncingPlatform ? "Actualizando..." : "Titulos y textos"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid rgba(56,189,248,0.32)" }}
                    onClick={() => void handleSyncNow("all")}
                    disabled={syncingPlatform || loading}
                  >
                    {syncingPlatform ? "Actualizando..." : "Todo"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              background: "var(--surface-2)",
              color: "var(--text-3)",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            <div>
              {isInlineCreateOnly
                ? "Armá la ficha y volvés al ingreso para cargar cantidad, costo y precio sin salir del flujo."
                : hasVariants
                  ? "Cada variante lleva su propio precio, costo, stock y codigo."
                  : "Completa precio, costo y stock para venderlo."}
            </div>
            {!isInlineCreateOnly && (
              <div style={{ marginTop: "6px" }}>
                {hasVariants
                  ? pricingMode === "SHARED"
                    ? "Los precios y costos de variantes se comparten entre sucursales."
                    : "Los precios y costos de variantes se manejan por sucursal."
                  : pricingMode === "SHARED"
                    ? "Precio y costo: todas las sucursales."
                    : "Precio y costo: solo esta sucursal."}
              </div>
            )}
          </div>

          {!isInlineCreateOnly && !hasVariants && (
            <div style={{ display: "grid", gridTemplateColumns: isInlineCreateOnly ? "1fr" : "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Precio</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ textAlign: "right" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Costo</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                style={{ textAlign: "right" }}
              />
            </div>
          </div>
          )}

        {/* Modificador de Variantes y Stock/Barcode alternativo */}
        <div style={{ marginBottom: "12px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                const checked = e.target.checked;
                setHasVariants(checked);
                if (checked) {
                  setBarcode("");
                }
              }}
              disabled={!isNew && productHasTrackedLots}
            />
            Tiene múltiples sabores/variantes
          </label>
          {!isNew && productHasTrackedLots && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--amber)" }}>
              Este producto ya tiene vencimientos cargados. La estructura de variantes queda bloqueada en esta versión.
            </div>
          )}
        </div>

        {hasVariants ? (
          <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {variants.map((v, i) => {
              const currentVariantStock = v.stock ?? 0;

              return (
              <div key={i} style={{ border: "1px solid var(--border)", padding: "10px", borderRadius: "8px", background: "var(--surface)" }}>
                 <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                   <input 
                     className="input" 
                     placeholder="Nombre variante (ej: Naranja) *" 
                     value={v.name} 
                     onChange={(e) => updateVariant(i, { name: e.target.value })} 
                     style={{flex: 1}} 
                   />
                   <button 
                     className="btn btn-sm btn-ghost" 
                     onClick={() => {
                        const newV = [...variants];
                        newV.splice(i, 1);
                        setVariants(newV);
                     }} 
                     style={{color: "var(--red)", fontSize: "16px"}}
                     disabled={Boolean(v.id && v.hasTrackedLots)}
                     title={v.id && v.hasTrackedLots ? "Quitá los vencimientos desde Corregir inventario antes de eliminar esta variante." : undefined}
                   >
                     🗑
                   </button>
                 </div>
                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>CODIGO INTERNO</label>
                      <input
                        className="input"
                        placeholder="Interno..."
                        value={v.internalCode || ""}
                        onChange={(e) => updateVariant(i, { internalCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>CÓDIGO (OPCIONAL)</label>
                      <input 
                        className="input" 
                        placeholder="Código..." 
                        value={v.barcode || ""} 
                        onChange={(e) => updateVariant(i, { barcode: e.target.value })} 
                      />
                    </div>
                 </div>
                 <div style={{ display: "grid", gridTemplateColumns: isInlineCreateOnly ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "8px", marginTop: "8px" }}>
                    {!isInlineCreateOnly && (
                      <>
                        <div>
                          <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>PRECIO</label>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="0"
                            value={v.price?.toString() || ""}
                            onChange={(e) => updateVariant(i, { price: e.target.value ? parseFloat(e.target.value) : null })}
                            style={{ textAlign: "right" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>COSTO</label>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="0"
                            value={v.cost?.toString() || ""}
                            onChange={(e) => updateVariant(i, { cost: e.target.value ? parseFloat(e.target.value) : null })}
                            style={{ textAlign: "right" }}
                          />
                        </div>
                      </>
                    )}
                    {!isInlineCreateOnly && (
                      <div style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontSize: "9px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>
                            Stock Actual
                          </span>
                          <span style={{ 
                            fontSize: "10px", 
                            fontWeight: 700, 
                            padding: "2px 6px", 
                            borderRadius: "4px",
                            background: currentVariantStock < 0 ? "rgba(239,68,68,0.14)" : "var(--surface-2)",
                            color: currentVariantStock < 0 ? "var(--red)" : "var(--text-2)",
                            border: currentVariantStock < 0 ? "1px solid rgba(239,68,68,0.24)" : "1px solid var(--border)",
                          }}>
                            {formatStockQuantity(currentVariantStock, soldByWeight)}
                          </span>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <div>
                            <label style={{ fontSize: "8px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                              <span>{soldByWeight ? "Peso que entra" : "Unidades que entran"}</span>
                              {!isNew && onOpenCorrection && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: "8px", padding: "0px 4px", height: "auto", marginLeft: "auto", display: "inline-block" }}
                                  onClick={onOpenCorrection}
                                  title="Abrir panel de corrección de stock"
                                >
                                  🧮 Corregir
                                </button>
                              )}
                            </label>
                            <input
                              className="input"
                              type={soldByWeight ? "text" : "number"}
                              inputMode={soldByWeight ? "decimal" : "numeric"}
                              step={soldByWeight ? "0.001" : "1"}
                              min={0}
                              placeholder="0"
                              value={variantStockAdjustments[v.id || `index-${i}`] || ""}
                              onChange={(e) => {
                                const key = v.id || `index-${i}`;
                                setVariantStockAdjustments((prev) => ({ ...prev, [key]: e.target.value.startsWith("-") ? "" : e.target.value }));
                              }}
                              disabled={Boolean(v.id && v.hasTrackedLots)}
                              style={{ textAlign: "right", fontSize: "14px", fontWeight: 600 }}
                            />
                          </div>
                          
                          <div>
                            <label style={{ fontSize: "8px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px", display: "block" }}>
                              {soldByWeight ? "Peso final" : "Stock final"}
                            </label>
                            <div style={{ 
                              padding: "8px", 
                              borderRadius: "6px", 
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              textAlign: "right",
                              minHeight: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                            }}>
                              <span style={{ 
                                fontSize: "18px", 
                                fontWeight: 800,
                                color: (() => {
                                  const key = v.id || `index-${i}`;
                                  const adj = parseStockQuantityInput(variantStockAdjustments[key] || "", soldByWeight);
                                  return adj !== null && adj > 0 ? "var(--green)" : "var(--text-3)";
                                })(),
                              }}>
                                {(() => {
                                  const key = v.id || `index-${i}`;
                                  const adj = parseStockQuantityInput(variantStockAdjustments[key] || "", soldByWeight);
                                  if (adj !== null && adj > 0) return formatStockQuantity(currentVariantStock + adj, soldByWeight);
                                  return formatStockQuantity(v.stock, soldByWeight) || "—";
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>MINIMO{soldByWeight ? " (kg)" : ""}</label>
                      <input
                        className="input"
                        type={soldByWeight ? "text" : "number"}
                        inputMode={soldByWeight ? "decimal" : "numeric"}
                        step={soldByWeight ? "0.001" : "1"}
                        placeholder={soldByWeight ? "0.000" : "0"}
                        value={formatStockQuantity(v.minStock, soldByWeight)}
                        onChange={(e) => updateVariant(i, { minStock: parseStockQuantityInput(e.target.value, soldByWeight) })}
                        style={{ textAlign: "right" }}
                      />
                    </div>
                 </div>
                 {v.id && v.hasTrackedLots && (
                   <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--amber)" }}>
                    Esta variante tiene vencimientos cargados. Ajustá su stock desde Corregir inventario.
                   </div>
                 )}
              </div>
            )})}
            <button 
              className="btn btn-sm btn-ghost" 
              style={{ border: "1px dashed var(--border)", padding: "8px" }}
              onClick={() =>
                setVariants([
                  ...variants,
                  {
                    name: "",
                    barcode: null,
                    internalCode: null,
                    price: toNum(price),
                    cost: toNum(cost),
                    stock: null,
                    minStock: null,
                  },
                ])
              }
            >
              + Agregar Variante
            </button>
          </div>
        ) : (
          <>
            {/* Stock Base */}
            {!isInlineCreateOnly && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>
                  Stock Actual
                </span>
                <span style={{ 
                  fontSize: "12px", 
                  fontWeight: 700, 
                  padding: "4px 8px", 
                  borderRadius: "6px",
                  background: originalSimpleStock < 0 ? "rgba(239,68,68,0.14)" : "var(--surface-2)",
                  color: originalSimpleStock < 0 ? "var(--red)" : "var(--text-2)",
                  border: originalSimpleStock < 0 ? "1px solid rgba(239,68,68,0.24)" : "1px solid var(--border)",
                }}>
                  {formatStockQuantity(originalSimpleStock, soldByWeight)}
                </span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", display: "block", margin: 0 }}>
                      {soldByWeight ? "Peso que entra" : "Unidades que entran"}
                    </label>
                    {!isNew && onOpenCorrection && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: "10px", padding: "2px 6px", height: "auto" }}
                        onClick={onOpenCorrection}
                        title="Abrir panel de corrección de stock"
                      >
                        🧮 Corregir inventario
                      </button>
                    )}
                  </div>
                  <input
                    className="input"
                    type={soldByWeight ? "text" : "number"}
                    inputMode={soldByWeight ? "decimal" : "numeric"}
                    step={soldByWeight ? "0.001" : "1"}
                    min={0}
                    placeholder="0"
                    value={stockAdjustment}
                    onChange={(e) => setStockAdjustment(e.target.value.startsWith("-") ? "" : e.target.value)}
                    style={{ textAlign: "right", fontSize: "16px", fontWeight: 600 }}
                    disabled={!isNew && productHasTrackedLots}
                  />
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "4px" }}>
                    {soldByWeight ? "Ingresá en kg (ej: 1.5)" : "Se suma arriba del stock actual"}
                  </div>
                </div>
                
                <div>
                  <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: "6px", display: "block" }}>
                    {soldByWeight ? "Peso final" : "Stock después del ingreso"}
                  </label>
                  <div style={{ 
                    padding: "12px", 
                    borderRadius: "8px", 
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    textAlign: "right",
                    minHeight: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}>
                    <span style={{ 
                      fontSize: "24px", 
                      fontWeight: 800,
                      color: projectedSimpleStock !== null ? "var(--green)" : "var(--text-3)",
                    }}>
                      {projectedSimpleStock !== null 
                        ? formatStockQuantity(projectedSimpleStock, soldByWeight) 
                        : (formatStockQuantity(originalSimpleStock, soldByWeight) || "—")}
                    </span>
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "4px" }}>
                    {projectedSimpleStock !== null ? "Se suma arriba del stock actual" : "Sin cambios"}
                  </div>
                </div>
              </div>
              
              {originalSimpleStock < 0 && (
                <div style={{ fontSize: "11px", color: "var(--text-2)", marginTop: "8px" }}>
                  El producto está en negativo. Ingresá lo que llegó y el sistema calculará el stock final.
                </div>
              )}
            </div>
            )}
            
            {/* Stock Min. */}
            {!isInlineCreateOnly && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                Stock min.{soldByWeight ? " (kg)" : ""}
              </label>
              <input
                className="input"
                type="number"
                inputMode={soldByWeight ? "decimal" : "numeric"}
                step={soldByWeight ? "0.001" : "1"}
                placeholder="—"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                style={{ textAlign: "right" }}
              />
            </div>
            )}
            {!isNew && productHasTrackedLots && (
              <div style={{ marginTop: "-4px", marginBottom: "12px", fontSize: "12px", color: "var(--amber)" }}>
                Este producto tiene vencimientos cargados. Ajustá el stock desde Corregir inventario para no romper el desglose por lotes.
              </div>
            )}

            {false && (
            <>
            {/* Barcode Base */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Código de barras</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  ref={barcodeRef}
                  className="input"
                  placeholder="Escaneá o escribí el código"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0 16px", flexShrink: 0, fontSize: "20px" }}
                  onClick={() => setScannerTarget("barcode")}
                  title="Escanear con cámara"
                >
                  📷
                </button>
              </div>
              {effectiveLookupState === "loading" && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-3)" }}>
                  Buscando datos sugeridos...
                </div>
              )}
              {effectiveLookupState === "ready" && visibleSuggestion && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "12px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)" }}>
                    Datos sugeridos
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    {visibleSuggestion!.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={visibleSuggestion!.image ?? undefined}
                        alt={visibleSuggestion!.name || "Producto"}
                        style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "10px",
                          background: "var(--surface)",
                          border: "1px dashed var(--border)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{visibleSuggestion!.name}</div>
                      {(visibleSuggestion!.brand || visibleSuggestion!.presentation || visibleSuggestion!.description) && (
                        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>
                          {[suggestion?.brand, suggestion?.presentation, suggestion?.description].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDismissedSuggestionCode(normalizeBarcodeCode(barcode));
                      }}
                    >
                      Ocultar
                    </button>
                    <button
                      className="btn btn-green"
                      style={{ flex: 1 }}
                      onClick={() => {
                        if (visibleSuggestion) {
                          void applySuggestion(visibleSuggestion);
                        }
                      }}
                    >
                      Usar
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}

        {isNew && allowOpenStockAfter && (
          <div style={{ marginBottom: "12px", fontSize: "12px", color: "var(--text-3)" }}>
            {hasVariants
              ? "Tip: podés usar Crear y definir stock para dejar cada variante lista con su stock y vencimientos enseguida."
              : "Tip: podés usar Crear y definir stock para dejar el producto listo en el mismo flujo."}
          </div>
        )}

        {/* showInGrid toggle */}
        {!isNew && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              marginBottom: "12px",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>Mostrar en caja</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Si está oculto no aparece al vender</div>
            </div>
            <button
              style={{
                width: "44px",
                height: "24px",
                borderRadius: "99px",
                background: showInGrid ? "var(--green)" : "var(--border)",
                border: "none",
                cursor: "pointer",
                transition: "background 0.2s",
                position: "relative",
                flexShrink: 0,
              }}
              onClick={() => setShowInGrid((v) => !v)}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: showInGrid ? "22px" : "2px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            marginBottom: "12px",
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>Vender por peso</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
              El precio y el costo se toman por kilo, y la venta se carga en gramos.
            </div>
          </div>
          <button
            style={{
              width: "44px",
              height: "24px",
              borderRadius: "99px",
              background: soldByWeight ? "var(--green)" : "var(--border)",
              border: "none",
              cursor: "pointer",
              transition: "background 0.2s",
              position: "relative",
              flexShrink: 0,
            }}
            onClick={() => setSoldByWeight((v) => !v)}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: soldByWeight ? "22px" : "2px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Actions */}
        {saveError && (
          <div style={{ fontSize: "12px", color: "var(--red)", marginBottom: "8px" }}>
            {saveError}
          </div>
        )}
        <div style={{ display: "flex", gap: "8px" }}>
          {!isNew && (
            <button
              className="btn btn-ghost"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
              onClick={handleDelete}
              disabled={loading}
            >
              {confirming ? "¿Confirmar?" : "🗑"}
            </button>
          )}
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          {isNew && allowOpenStockAfter && (
            <button
              className="btn btn-ghost"
              style={{ flex: 2, border: "1px solid var(--border)" }}
              onClick={() => void handleSave(true)}
              disabled={loading || !name.trim()}
            >
              {loading ? "..." : "Crear y definir stock"}
            </button>
          )}
          <button
            className="btn btn-green"
            style={{ flex: isNew && allowOpenStockAfter ? 1.6 : 2 }}
            onClick={() => void handleSave(false)}
            disabled={loading || !name.trim()}
          >
            {loading ? "..." : isNew ? (allowOpenStockAfter ? "Crear" : "Crear producto") : "Guardar"}
          </button>
        </div>
      </div>
      
      {scannerTarget && (
        <BarcodeScanner
          onScan={(result) => {
            if (scannerTarget === "catalog") {
              setShowCatalogBrowser(true);
              setCatalogSearch(result);
            } else {
              setBarcode(result);
            }
            setScannerTarget(null);
          }}
          onClose={() => setScannerTarget(null)}
        />
      )}
      {showCategoryModal && (
        <CategoryModal
          category="new"
          onClose={() => setShowCategoryModal(false)}
          onSave={(savedCategory) => {
            setShowCategoryModal(false);
            void refreshCategories(savedCategory?.id ?? undefined);
          }}
        />
      )}
    </div>
  );
}

// ─── StockLoadingModal ────────────────────────────────────────────────────────
function StockLoadingModal({
  products,
  branchId,
  categories,
  pricingMode,
  isOwner,
  onClose,
  onSaved,
  onCategoriesChange,
  initialSearch = "",
  initialOperation = "receive",
  spotlightProductId = null,
  entryNote = null,
}: {
  products: Product[];
  branchId: string;
  categories: Category[];
  pricingMode: PricingMode;
  isOwner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onCategoriesChange: (categories: Category[]) => void;
  initialSearch?: string;
  initialOperation?: StockModalOperation;
  spotlightProductId?: string | null;
  entryNote?: string | null;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"sumar" | "corregir">(initialOperation === "correct" ? "corregir" : "sumar");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [lotInputs, setLotInputs] = useState<Record<string, LotDraft[]>>({});
  const [loadedLots, setLoadedLots] = useState<Record<string, LotDraft[]>>({});
  const [openLotPanels, setOpenLotPanels] = useState<Record<string, boolean>>({});
  const [lotLoading, setLotLoading] = useState<Record<string, boolean>>({});
  const [supplierName, setSupplierName] = useState("");
  const [restockNote, setRestockNote] = useState("");
  const [trackCosts, setTrackCosts] = useState(initialOperation === "receive");
  const [attachments, setAttachments] = useState<RestockAttachmentDraft[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [inlineCreateDraft, setInlineCreateDraft] = useState<ProductModalDraft | null>(null);
  const [inlineSpotlightProductId, setInlineSpotlightProductId] = useState<string | null>(spotlightProductId);
  const [collaborativeSuggestions, setCollaborativeSuggestions] = useState<BarcodeSuggestion[]>([]);
  const [collaborativeLookupState, setCollaborativeLookupState] = useState<CollaborativeLookupState>("idle");
  const [collaborativeError, setCollaborativeError] = useState<string | null>(null);
  const [creatingCollaborativeKey, setCreatingCollaborativeKey] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(initialOperation !== "receive");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const isReceiveFlow = initialOperation === "receive";
  const modalTitle = isReceiveFlow ? "📥 Recibir mercadería" : "🧮 Corregir inventario";
  const saveLabel = isReceiveFlow ? "Guardar ingreso" : "Guardar corrección";
  const trimmedSearch = search.trim();
  const normalizedSearchCode = normalizeBarcodeCode(trimmedSearch);
  const shouldLookupCollaborative =
    isReceiveFlow &&
    (trimmedSearch.length >= 2 || canLookupBarcode(normalizedSearchCode));

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setMode(initialOperation === "correct" ? "corregir" : "sumar");
    setSupplierName("");
    setRestockNote("");
    setTrackCosts(initialOperation === "receive");
    setAttachments([]);
    setCostInputs({});
    setPriceInputs({});
    setSaveError(null);
    setInlineNotice(null);
    setInlineCreateDraft(null);
    setCollaborativeSuggestions([]);
    setCollaborativeLookupState("idle");
    setCollaborativeError(null);
    setCreatingCollaborativeKey(null);
    setScannerOpen(false);
    setDetailsOpen(initialOperation !== "receive");
  }, [initialOperation]);

  useEffect(() => {
    setInlineSpotlightProductId(spotlightProductId);
  }, [spotlightProductId]);

  useEffect(() => {
    if (supplierName.trim() || restockNote.trim() || attachments.length > 0 || !trackCosts) {
      setDetailsOpen(true);
    }
  }, [attachments.length, restockNote, supplierName, trackCosts]);

  useEffect(() => {
    if (!inlineNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInlineNotice(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [inlineNotice]);

  const handlePickAttachments = () => {
    attachmentInputRef.current?.click();
  };

  const buildInlineProductDraft = (): ProductModalDraft => {
    const trimmedSearch = search.trim();
    const normalizedSearchCode = normalizeBarcodeCode(trimmedSearch);
    const barcodeSeed = canLookupBarcode(normalizedSearchCode) ? normalizedSearchCode : null;

    return {
      name: barcodeSeed ? "" : trimmedSearch,
      barcode: barcodeSeed,
      supplierName: supplierName.trim() || null,
      soldByWeight: false,
    };
  };

  const openInlineCreate = () => {
    setInlineCreateDraft(buildInlineProductDraft());
  };

  const refreshModalCategories = async () => {
    const catRes = await fetch("/api/categorias", {
      headers: { "x-branch-id": branchId },
    });

    if (!catRes.ok) {
      throw new Error("No se pudieron actualizar las categorías.");
    }

    const catData = await catRes.json();
    const nextCategories = Array.isArray(catData) ? (catData as Category[]) : [];
    onCategoriesChange(nextCategories);
    return nextCategories;
  };

  const ensureCollaborativeCategory = async (categoryName: string | null | undefined) => {
    const trimmedCategoryName = categoryName?.trim() ?? "";
    if (!trimmedCategoryName) {
      return null;
    }

    const localCategory = findCategoryByNameInList(trimmedCategoryName, categories);
    if (localCategory) {
      return localCategory.id;
    }

    const refreshedCategories = await refreshModalCategories();
    const refreshedCategory = findCategoryByNameInList(trimmedCategoryName, refreshedCategories);
    if (refreshedCategory) {
      return refreshedCategory.id;
    }

    const createResponse = await fetch("/api/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({
        name: trimmedCategoryName,
        color: AUTO_SUGGESTED_CATEGORY_COLOR,
        showInGrid: true,
      }),
    });

    if (!createResponse.ok) {
      const data = await createResponse.json().catch(() => null);
      throw new Error(data?.error || "No se pudo crear la categoría sugerida.");
    }

    const savedCategory = (await createResponse.json()) as Category;
    const nextCategories = await refreshModalCategories();
    return findCategoryByNameInList(trimmedCategoryName, nextCategories)?.id ?? savedCategory.id ?? null;
  };

  const fetchLatestProducts = async () => {
    const response = await fetch("/api/productos?view=grid", {
      headers: { "x-branch-id": branchId },
    });

    if (!response.ok) {
      throw new Error("No pudimos actualizar la lista local antes de crear el producto.");
    }

    const data = await response.json();
    return Array.isArray(data) ? (data as Product[]) : [];
  };

  const handleCreateFromCollaborativeSuggestion = async (suggestion: BarcodeSuggestion) => {
    const suggestionKey = buildCollaborativeSuggestionKey(suggestion);
    setCollaborativeError(null);
    setInlineNotice(null);
    setCreatingCollaborativeKey(suggestionKey);

    try {
      let matchedProduct = findLocalProductForSuggestion(products, suggestion);

      if (!matchedProduct) {
        try {
          const latestProducts = await fetchLatestProducts();
          matchedProduct = findLocalProductForSuggestion(latestProducts, suggestion);
        } catch (error) {
          console.error(error);
        }
      }

      if (matchedProduct) {
        await onSaved();
        setInlineSpotlightProductId(matchedProduct.id);
        setInlineNotice(
          "Este producto ya estaba disponible localmente. Ahora podés cargar cantidad, costo y precio.",
        );
        return;
      }

      const normalizedVariants = (suggestion.variants ?? [])
        .map((variant) => ({
          name: variant.name.trim(),
          barcode: normalizeLookupCandidate(variant.barcode),
        }))
        .filter((variant) => variant.name);
      const categoryId = await ensureCollaborativeCategory(suggestion.categoryName);
      const primaryCode = normalizeLookupCandidate(suggestion.code);

      const payload = {
        name: suggestion.name.trim() || primaryCode || "Producto sin nombre",
        barcode: normalizedVariants.length > 0 ? null : primaryCode,
        brand: suggestion.brand?.trim() || null,
        description: suggestion.description?.trim() || null,
        presentation: suggestion.presentation?.trim() || null,
        image: suggestion.image?.trim() || null,
        supplierName: supplierName.trim() || null,
        notes: null,
        categoryId,
        price: null,
        cost: null,
        stock: 0,
        minStock: 0,
        showInGrid: true,
        variants: normalizedVariants.map((variant) => ({
          name: variant.name,
          barcode: variant.barcode,
          internalCode: null,
          price: null,
          cost: null,
          stock: 0,
          minStock: 0,
        })),
        ...(isOwner ? { platformSyncMode: "MANUAL" as const } : {}),
      };

      const response = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo crear el producto desde la base colaborativa.");
      }

      const createdProduct = data as Product;
      await onSaved();
      setInlineSpotlightProductId(createdProduct.id);
      setInlineNotice(
        normalizedVariants.length > 0
          ? "Producto agregado desde la base colaborativa. Ahora podés cargar cantidades y costos por variante."
          : "Producto agregado desde la base colaborativa. Ahora podés cargar cantidades y costos.",
      );
    } catch (error) {
      console.error(error);
      setCollaborativeError(
        error instanceof Error
          ? error.message
          : "No se pudo crear el producto desde la base colaborativa.",
      );
    } finally {
      setCreatingCollaborativeKey(null);
    }
  };

  const handleInlineProductSave = async (payload?: ProductModalSavePayload) => {
    const nextName = payload?.productName?.trim() || buildInlineProductDraft().name || "";
    const nextProductId = payload?.productId ?? null;

    setInlineCreateDraft(null);
    await onSaved();
    if (nextName) {
      setSearch(nextName);
    }
    if (nextProductId) {
      setInlineSpotlightProductId(nextProductId);
    }
    setInlineNotice(
      payload?.hasVariants
        ? "Producto creado. Ahora podés cargar cantidades y costos por variante."
        : "Producto creado. Ahora podés completar cantidad, costo y precio en este ingreso.",
    );
  };

  const handleAttachmentFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setSaveError(null);
    setUploadingAttachments(true);

    try {
      const uploaded: RestockAttachmentDraft[] = [];

      for (const file of Array.from(files).slice(0, 4)) {
        const optimized = await optimizeReceiptImage(file);
        const formData = new FormData();
        formData.append("file", optimized);
        formData.append("folder", "receipts");

        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-branch-id": branchId },
          body: formData,
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || typeof data?.url !== "string") {
          throw new Error(data?.error || "No pudimos subir una foto del comprobante.");
        }

        uploaded.push({
          url: data.url,
          name: optimized.name || file.name || "comprobante",
        });
      }

      setAttachments((prev) => [...prev, ...uploaded].slice(0, 6));
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      setSaveError(error instanceof Error ? error.message : "No pudimos subir una foto del comprobante.");
    } finally {
      setUploadingAttachments(false);
    }
  };

  const removeAttachment = (url: string) => {
    setAttachments((prev) => prev.filter((item) => item.url !== url));
  };

  useEffect(() => {
    if (!shouldLookupCollaborative) {
      setCollaborativeSuggestions([]);
      setCollaborativeLookupState("idle");
      setCollaborativeError(null);
      return;
    }

    const isBarcodeLookup = canLookupBarcode(normalizedSearchCode);
    const controller = new AbortController();
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setCollaborativeLookupState("loading");
      setCollaborativeError(null);

      try {
        const params = new URLSearchParams();
        if (isBarcodeLookup) {
          params.set("code", normalizedSearchCode);
        } else {
          params.set("q", trimmedSearch);
          params.set("limit", "8");
        }

        const response = await fetch(`/api/platform-products/lookup?${params.toString()}`, {
          headers: { "x-branch-id": branchId },
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as BarcodeLookupResponse | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(data && "error" in data ? String(data.error) : "No pudimos consultar la base colaborativa.");
        }

        const rawSuggestions = Array.isArray(data?.suggestions)
          ? data.suggestions
          : data?.suggestion
            ? [data.suggestion]
            : [];
        const dedupedSuggestions = Array.from(
          new Map(
            rawSuggestions.map((suggestion) => [
              buildCollaborativeSuggestionKey(suggestion),
              suggestion,
            ]),
          ).values(),
        );

        setCollaborativeSuggestions(dedupedSuggestions);
        setCollaborativeLookupState(dedupedSuggestions.length > 0 ? "ready" : "idle");
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        console.error(error);
        setCollaborativeSuggestions([]);
        setCollaborativeLookupState("error");
        setCollaborativeError(
          "No pudimos consultar la base colaborativa. El filtro local sigue funcionando.",
        );
      }
    }, isBarcodeLookup ? 220 : 320);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [branchId, normalizedSearchCode, shouldLookupCollaborative, trimmedSearch]);

  const activeSpotlightId = inlineSpotlightProductId ?? spotlightProductId;

  const localSearchMatches = useMemo(
    () => products.filter((product) => matchesProductSearch(product, search)),
    [products, search],
  );

  const collaborativeMatches = useMemo(
    () =>
      collaborativeSuggestions.map((suggestion) => ({
        suggestion,
        localProduct: findLocalProductForSuggestion(products, suggestion),
      })),
    [collaborativeSuggestions, products],
  );

  const collaborativeMatchedLocalProducts = useMemo(
    () =>
      collaborativeMatches.reduce<Product[]>((matches, item) => {
        if (item.localProduct) {
          matches.push(item.localProduct);
        }

        return matches;
      }, []),
    [collaborativeMatches],
  );

  const collaborativeVisibleSuggestions = useMemo(
    () => collaborativeMatches.filter((item) => !item.localProduct).map((item) => item.suggestion),
    [collaborativeMatches],
  );

  const eligible = useMemo(
    () =>
      mergeProductsById(localSearchMatches, collaborativeMatchedLocalProducts).sort((left, right) => {
        if (!activeSpotlightId) {
          return 0;
        }

        if (left.id === activeSpotlightId) {
          return -1;
        }

        if (right.id === activeSpotlightId) {
          return 1;
        }

        return 0;
      }),
    [activeSpotlightId, collaborativeMatchedLocalProducts, localSearchMatches],
  );

  const setQty = (
    key: string,
    val: string,
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => setter((prev) => ({ ...prev, [key]: val }));

  const getPricingKey = (productId: string, variantId?: string | null) =>
    variantId ? `variant:${variantId}` : `product:${productId}`;

  const parseMoneyInput = (value: string) => {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const getInputValue = (productId: string, variantId?: string | null) =>
    variantId ? (variantInputs[variantId] ?? "") : (inputs[productId] ?? "");

  const getRows = (productId: string, variantId?: string | null) =>
    lotInputs[lotOwnerKey(productId, variantId)] ?? [];

  const getLotSum = (productId: string, variantId?: string | null) =>
    validLotRows(getRows(productId, variantId), mode === "corregir")
      .reduce((sum, row) => sum + (parseStockQuantity(row.quantity) ?? 0), 0);

  const computeTargetStock = (currentStock: number | null, productId: string, variantId?: string | null) => {
    const inputVal = getInputValue(productId, variantId);
    const parsedInput = parseStockQuantity(inputVal);
    const lotSum = getLotSum(productId, variantId);

    if (mode === "sumar") {
      const additionWithoutExpiry = parsedInput ?? 0;
      if (additionWithoutExpiry === 0 && lotSum === 0) {
        return null;
      }

      return (currentStock ?? 0) + additionWithoutExpiry + lotSum;
    }

    if (parsedInput !== null) {
      return parsedInput;
    }

    if (lotSum > 0) {
      return currentStock ?? 0;
    }

    return null;
  };

  const getRowError = (currentStock: number | null, productId: string, variantId?: string | null) => {
    if (mode !== "corregir") {
      return null;
    }

    const targetStock = computeTargetStock(currentStock, productId, variantId);
    if (targetStock === null) {
      return null;
    }

    const lotSum = getLotSum(productId, variantId);
    return lotSum > targetStock ? "Los lotes superan el stock final." : null;
  };

  const hasRowChanges = (currentStock: number | null, productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    const inputValue = getInputValue(productId, variantId);
    const currentRows = lotInputs[key];
    const baseline = mode === "corregir" ? serializeLotRows(loadedLots[key], true) : JSON.stringify([]);
    const current = serializeLotRows(currentRows, mode === "corregir");

    return Boolean(
      inputValue.trim() ||
      current !== baseline ||
      (mode === "sumar" && validLotRows(currentRows ?? [], false).length > 0) ||
      (mode === "corregir" && computeTargetStock(currentStock, productId, variantId) !== null && current !== baseline),
    );
  };

  const affectedRows = products.flatMap((product) =>
    product.variants && product.variants.length > 0
      ? product.variants.map((variant) => ({
          product,
          currentStock: variant.stock,
          variantId: variant.id ?? null,
        }))
      : [{ product, currentStock: product.stock, variantId: null }],
  );

  const changesCount = affectedRows.filter((row) =>
    hasRowChanges(row.currentStock, row.product.id, row.variantId),
  ).length;

  const hasInvalidRows = affectedRows.some((row) =>
    Boolean(getRowError(row.currentStock, row.product.id, row.variantId)),
  );

  const loadLots = async (productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    if (loadedLots[key]) {
      setOpenLotPanels((prev) => ({ ...prev, [key]: !prev[key] }));
      return;
    }

    setLotLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams({ productId });
      if (variantId) {
        params.set("variantId", variantId);
      }

      const res = await fetch(`/api/inventario/lotes?${params.toString()}`, {
        headers: { "x-branch-id": branchId },
      });
      const data = await res.json().catch(() => null);
      const mappedLots = Array.isArray(data?.lots)
        ? data.lots.map((lot: { id: string; quantity: number; expiresOn: string }) => ({
            id: lot.id,
            quantity: String(lot.quantity),
            expiresOn: String(lot.expiresOn).slice(0, 10),
            existing: true,
          }))
        : [];

      setLoadedLots((prev) => ({ ...prev, [key]: mappedLots }));
      setLotInputs((prev) => ({ ...prev, [key]: mappedLots }));
      setOpenLotPanels((prev) => ({ ...prev, [key]: true }));
    } finally {
      setLotLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const addLotRow = (productId: string, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { quantity: "", expiresOn: "", existing: false }],
    }));
  };

  const updateLotRow = (
    productId: string,
    index: number,
    field: "quantity" | "expiresOn",
    value: string,
    variantId?: string | null,
  ) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const removeLotRow = (productId: string, index: number, variantId?: string | null) => {
    const key = lotOwnerKey(productId, variantId);
    setLotInputs((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const handleSaveAll = async () => {
    setSaveError(null);
    if (hasInvalidRows) {
      setSaveError("Revisá los productos donde los lotes superan el stock final.");
      return;
    }

    setSaving(true);
    try {
      const items: Array<{
        productId: string;
        variantId?: string;
        quantityWithoutExpiry: number;
        lots: Array<{ quantity: number; expiresOn: string }>;
        unitCost?: number | null;
        salePrice?: number | null;
      }> = [];

      for (const p of products) {
        if (p.variants && p.variants.length > 0) {
          for (const v of p.variants) {
            if (!v.id || !hasRowChanges(v.stock, p.id, v.id)) {
              continue;
            }

            const targetStock = computeTargetStock(v.stock, p.id, v.id);
            const rows = getRows(p.id, v.id);
            const lots = validLotRows(rows, mode === "corregir").map((row) => ({
              quantity: parseStockQuantity(row.quantity) ?? 0,
              expiresOn: row.expiresOn,
            }));
            const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
            const quantityWithoutExpiry =
              mode === "sumar"
                ? (parseStockQuantity(getInputValue(p.id, v.id)) ?? 0)
                : Math.max((targetStock ?? (v.stock ?? 0)) - lotQuantity, 0);

            items.push({
              productId: p.id,
              variantId: v.id,
              quantityWithoutExpiry,
              lots,
              unitCost: parseMoneyInput(costInputs[getPricingKey(p.id, v.id)] ?? ""),
              salePrice: parseMoneyInput(priceInputs[getPricingKey(p.id, v.id)] ?? ""),
            });
          }
        } else {
          if (!hasRowChanges(p.stock, p.id)) {
            continue;
          }

          const targetStock = computeTargetStock(p.stock, p.id);
          const rows = getRows(p.id);
          const lots = validLotRows(rows, mode === "corregir").map((row) => ({
            quantity: parseStockQuantity(row.quantity) ?? 0,
            expiresOn: row.expiresOn,
          }));
          const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
          const quantityWithoutExpiry =
            mode === "sumar"
              ? (parseStockQuantity(getInputValue(p.id)) ?? 0)
              : Math.max((targetStock ?? (p.stock ?? 0)) - lotQuantity, 0);

          items.push({
            productId: p.id,
            quantityWithoutExpiry,
            lots,
            unitCost: parseMoneyInput(costInputs[getPricingKey(p.id)] ?? ""),
            salePrice: parseMoneyInput(priceInputs[getPricingKey(p.id)] ?? ""),
          });
        }
      }

      if (items.length === 0) {
        setSaveError("No hay cambios para guardar.");
        return;
      }

      const res = await fetch("/api/inventario/ingreso-rapido", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": branchId },
        body: JSON.stringify({
          mode,
          operation: initialOperation,
          items,
          note: restockNote.trim() || undefined,
          supplierName: isReceiveFlow ? supplierName.trim() || undefined : undefined,
          trackCosts: isReceiveFlow ? trackCosts : undefined,
          attachmentUrls: isReceiveFlow ? attachments.map((attachment) => attachment.url) : [],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveError(data?.error || "No se pudieron guardar los cambios de stock.");
        return;
      }

      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const renderLotsPanel = (product: Product, currentStock: number | null, variant?: Variant) => {
    const key = lotOwnerKey(product.id, variant?.id);
    const rows = getRows(product.id, variant?.id);
    const existingRows = rows.filter((row) => row.existing);
    const visibleRows = mode === "sumar" ? rows.filter((row) => !row.existing) : rows;
    const rowError = getRowError(currentStock, product.id, variant?.id);

    return (
      <div
        style={{
          marginTop: "10px",
          padding: "12px",
          borderRadius: "12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {mode === "sumar" && existingRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700 }}>
              Lotes actuales
            </div>
            {existingRows.map((row, index) => (
              <div key={`${key}-current-${index}`} style={{ fontSize: "12px", color: "var(--text-2)" }}>
                {row.quantity} u. → {new Date(`${row.expiresOn}T00:00:00`).toLocaleDateString("es-AR")}
              </div>
            ))}
          </div>
        )}

        {visibleRows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {visibleRows.map((row, visibleIndex) => {
              const rowIndex = mode === "sumar"
                ? rows.findIndex((candidate) => candidate === row)
                : visibleIndex;
              return (
                <div key={`${key}-${rowIndex}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    placeholder="Cant."
                    value={row.quantity}
                    onChange={(e) => updateLotRow(product.id, rowIndex, "quantity", e.target.value, variant?.id)}
                    style={{ width: "92px", textAlign: "right" }}
                  />
                  <input
                    className="input"
                    type="date"
                    value={row.expiresOn}
                    onChange={(e) => updateLotRow(product.id, rowIndex, "expiresOn", e.target.value, variant?.id)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ padding: "0 10px" }}
                    onClick={() => removeLotRow(product.id, rowIndex, variant?.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ border: "1px solid var(--border)" }}
            onClick={() => addLotRow(product.id, variant?.id)}
          >
            + Fecha
          </button>
          <span style={{ fontSize: "11px", color: rowError ? "var(--red)" : "var(--text-3)" }}>
            {rowError || (mode === "sumar"
              ? "Los lotes se suman arriba del stock actual."
              : "Si no tocás el total, se usa el stock físico actual.")}
          </span>
        </div>
      </div>
    );
  };

  const productHasChanges = (product: Product) =>
    product.variants && product.variants.length > 0
      ? product.variants.some((variant) => Boolean(variant.id) && hasRowChanges(variant.stock, product.id, variant.id))
      : hasRowChanges(product.stock, product.id);

  const visibleChangedCount = eligible.filter(productHasChanges).length;
  const helperCopy = isReceiveFlow
    ? "Busca por nombre, marca, proveedor, descripción, presentación o código. Si no existe localmente, también consultamos la base colaborativa."
    : "Busca el producto correcto y carga el stock fisico final. El valor reemplaza el inventario actual.";

  const getStatusChipStyle = (tone: "negative" | "out" | "low") =>
    tone === "negative"
      ? {
          color: "var(--red)",
          background: "rgba(239,68,68,0.14)",
          border: "1px solid rgba(239,68,68,0.24)",
        }
      : tone === "out"
        ? {
            color: "var(--text-2)",
            background: "rgba(148,163,184,0.14)",
            border: "1px solid rgba(148,163,184,0.22)",
          }
        : {
            color: "var(--amber)",
            background: "rgba(245,158,11,0.14)",
            border: "1px solid rgba(245,158,11,0.24)",
          };

  const renderQuantityEditor = (product: Product, currentStock: number | null, variant?: Variant) => {
    const variantId = variant?.id ?? null;
    const isVariant = Boolean(variant);
    const canEdit = !isVariant || Boolean(variantId);
    const value = isVariant ? (variantId ? (variantInputs[variantId] ?? "") : "") : (inputs[product.id] ?? "");
    const result = canEdit ? computeTargetStock(currentStock, product.id, variantId) : null;
    const pricingKey = getPricingKey(product.id, variantId);
    const lotKey = lotOwnerKey(product.id, variantId);
    const lotRows = getRows(product.id, variantId);
    const manualLotRows = mode === "sumar" ? lotRows.filter((row) => !row.existing) : lotRows;
    const rowError = canEdit ? getRowError(currentStock, product.id, variantId) : "Esta variante todavia no se puede editar.";
    const hasPendingChanges = canEdit ? hasRowChanges(currentStock, product.id, variantId) : false;
    const availableStock = variant?.availableStock ?? (!isVariant ? product.availableStock : null);

    const handleQuantityChange = (nextValue: string) => {
      if (!canEdit) {
        return;
      }

      if (isVariant && variantId) {
        setQty(variantId, nextValue, setVariantInputs);
        return;
      }

      setQty(product.id, nextValue, setInputs);
    };

    return (
      <div className="restock-modal__editor">
        <div className="restock-modal__stock-line">
          <span className="restock-modal__stock-pill">
            Actual <strong>{currentStock ?? 0}</strong>
          </span>
          {typeof availableStock === "number" && availableStock !== currentStock && (
            <span className="restock-modal__stock-pill">
              Vendible <strong>{availableStock}</strong>
            </span>
          )}
          {manualLotRows.length > 0 && (
            <span className="restock-modal__stock-pill">
              Lotes <strong>{manualLotRows.length}</strong>
            </span>
          )}
          {rowError && (
            <span className="restock-modal__stock-pill restock-modal__stock-pill--error">
              {rowError}
            </span>
          )}
        </div>

        <div className="restock-modal__editor-grid">
          <label className="restock-modal__field-card">
            <span className="restock-modal__field-label">{mode === "sumar" ? "Unidades que entran" : "Stock final"}</span>
            <input
              className="input restock-modal__qty-input"
              type="number"
              inputMode="numeric"
              placeholder={mode === "sumar" ? "0" : "Ej. 24"}
              value={value}
              onChange={(e) => handleQuantityChange(e.target.value)}
              disabled={!canEdit}
            />
            <span className="restock-modal__field-hint">
              {mode === "sumar"
                ? "Usa lotes solo para las unidades con vencimiento."
                : "Si completas lotes, se descuentan del stock final total."}
            </span>
          </label>

          <div className={`restock-modal__target-card${hasPendingChanges || result !== null ? " restock-modal__target-card--active" : ""}`}>
            <span className="restock-modal__field-label">{mode === "sumar" ? "Stock despues del ingreso" : "Stock que se guardara"}</span>
            <strong>{result !== null ? result : "--"}</strong>
            <span>
              {mode === "sumar"
                ? "Se suma arriba del stock actual."
                : "Representa el stock fisico final del producto."}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-ghost restock-modal__lot-button"
            onClick={() => void loadLots(product.id, variantId)}
            disabled={!canEdit}
          >
            {lotLoading[lotKey]
              ? "Cargando..."
              : openLotPanels[lotKey]
                ? "Ocultar lotes"
                : manualLotRows.length > 0
                  ? `Lotes (${manualLotRows.length})`
                  : "Cargar lotes"}
          </button>
        </div>

        {isReceiveFlow && (
          <div className="restock-modal__money-grid">
            <label className="restock-modal__field-card">
              <span className="restock-modal__field-label">Costo unitario</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="Opcional"
                value={costInputs[pricingKey] ?? ""}
                onChange={(e) => setQty(pricingKey, e.target.value, setCostInputs)}
                disabled={!canEdit}
              />
            </label>

            <label className="restock-modal__field-card">
              <span className="restock-modal__field-label">Precio de venta</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="Opcional"
                value={priceInputs[pricingKey] ?? ""}
                onChange={(e) => setQty(pricingKey, e.target.value, setPriceInputs)}
                disabled={!canEdit}
              />
            </label>
          </div>
        )}

        {canEdit && openLotPanels[lotKey] && renderLotsPanel(product, currentStock, variant)}
      </div>
    );
  };

  const renderLocalProductCard = (product: Product) => {
    const stockBadge = getProductStockBadge(product);
    const expiryBadge = formatExpiryBadge(product);
    const headlineMeta = [product.brand, product.supplierName, product.presentation].filter(Boolean);

    return (
      <section
        key={product.id}
        className="restock-modal__product"
        style={{
          border: product.id === activeSpotlightId
            ? "1px solid rgba(34,197,94,0.34)"
            : productHasChanges(product)
              ? "1px solid rgba(251,191,36,0.28)"
              : undefined,
          boxShadow: product.id === activeSpotlightId
            ? "0 0 0 1px rgba(34,197,94,0.14) inset, 0 20px 44px rgba(2,6,23,0.22)"
            : productHasChanges(product)
              ? "0 0 0 1px rgba(251,191,36,0.1) inset, 0 20px 44px rgba(2,6,23,0.18)"
              : undefined,
        }}
      >
        <div className="restock-modal__product-head">
          <ProductThumb image={product.image} emoji={product.emoji} name={product.name} size={56} radius={18} previewable />
          <div className="restock-modal__product-copy">
            <div className="restock-modal__product-title-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="restock-modal__product-title">{product.name}</div>
                {headlineMeta.length > 0 && (
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{headlineMeta.join(" · ")}</div>
                )}
              </div>
              <div className="restock-modal__product-tags">
                {product.id === activeSpotlightId && (
                  <span className="restock-modal__tag restock-modal__tag--spotlight">Nuevo</span>
                )}
                {productHasChanges(product) && (
                  <span className="restock-modal__tag restock-modal__tag--changed">Pendiente</span>
                )}
              </div>
            </div>

            {[product.internalCode, product.barcode].filter(Boolean).length > 0 && (
              <div className="restock-modal__product-meta">
                {[product.internalCode, product.barcode].filter(Boolean).map((code) => (
                  <span key={code} className="restock-modal__product-chip">
                    {code}
                  </span>
                ))}
              </div>
            )}

            <div className="restock-modal__product-meta">
              <span className="restock-modal__product-chip">Stock {formatStockQuantity(getProductTotalStock(product), product.soldByWeight) || "0"}</span>
              {product.variants && product.variants.length > 0 && (
                <span className="restock-modal__product-chip">{product.variants.length} variantes</span>
              )}
              {!product.variants && typeof product.availableStock === "number" && product.availableStock !== product.stock && (
                <span className="restock-modal__product-chip">Vendible {formatStockQuantity(product.availableStock, product.soldByWeight) || "0"}</span>
              )}
              {stockBadge && (
                <span className="restock-modal__product-chip" style={getStatusChipStyle(stockBadge.tone)}>
                  {stockBadge.label}
                </span>
              )}
              {expiryBadge && (
                <span className="restock-modal__product-chip">{expiryBadge}</span>
              )}
            </div>
          </div>
        </div>

        {!product.variants || product.variants.length === 0 ? (
          <div style={{ marginTop: "10px" }}>
            {renderQuantityEditor(product, product.stock)}
          </div>
        ) : (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {product.variants.map((variant, index) => (
              <div
                key={variant.id ?? `${product.id}-variant-${index}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "16px",
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(15,23,42,0.22)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>{variant.name}</div>
                    {[variant.internalCode, variant.barcode].filter(Boolean).length > 0 && (
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {[variant.internalCode, variant.barcode].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span className="restock-modal__product-chip">Stock {variant.stock ?? 0}</span>
                    {typeof variant.availableStock === "number" && variant.availableStock !== variant.stock && (
                      <span className="restock-modal__product-chip">Vendible {variant.availableStock}</span>
                    )}
                  </div>
                </div>
                {renderQuantityEditor(product, variant.stock, variant)}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderCollaborativeSuggestionCard = (suggestion: BarcodeSuggestion) => {
    const suggestionKey = buildCollaborativeSuggestionKey(suggestion);
    const variantCount = suggestion.variants?.length ?? 0;
    const visibleCodes = [normalizeLookupCandidate(suggestion.code), ...(suggestion.variants ?? []).map((variant) => normalizeLookupCandidate(variant.barcode))]
      .filter((code, index, array): code is string => Boolean(code) && array.indexOf(code) === index)
      .slice(0, 3);

    return (
      <section
        key={suggestionKey}
        className="restock-modal__product"
        style={{
          border: "1px dashed rgba(59,130,246,0.28)",
          background: "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(9,17,31,0.96) 100%)",
        }}
      >
        <div className="restock-modal__product-head">
          <ProductThumb image={suggestion.image} emoji={null} name={suggestion.name} size={56} radius={18} previewable />
          <div className="restock-modal__product-copy">
            <div className="restock-modal__product-title-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="restock-modal__product-title">{suggestion.name}</div>
                {[suggestion.brand, suggestion.presentation].filter(Boolean).length > 0 && (
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                    {[suggestion.brand, suggestion.presentation].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div className="restock-modal__product-tags">
                <span className="restock-modal__tag" style={{ color: "var(--primary)", borderColor: "rgba(59,130,246,0.28)" }}>
                  Base colaborativa
                </span>
              </div>
            </div>

            <div className="restock-modal__product-meta">
              {visibleCodes.map((code) => (
                <span key={code} className="restock-modal__product-chip">
                  {code}
                </span>
              ))}
              {suggestion.categoryName && (
                <span className="restock-modal__product-chip">{suggestion.categoryName}</span>
              )}
              {variantCount > 0 && (
                <span className="restock-modal__product-chip">{variantCount} variantes</span>
              )}
            </div>

            {variantCount > 0 && (
              <div className="restock-modal__product-meta">
                {suggestion.variants?.slice(0, 3).map((variant) => (
                  <span key={`${suggestionKey}-${variant.name}`} className="restock-modal__product-chip">
                    {variant.name}
                  </span>
                ))}
              </div>
            )}

            {suggestion.description && (
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-2)", lineHeight: 1.45 }}>
                {suggestion.description}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-2)", maxWidth: "540px" }}>
            {variantCount > 0
              ? "Se va a crear localmente con sus variantes para que puedas cargar cantidades, costos y precios desde este mismo ingreso."
              : "Se va a crear localmente y quedará listo para cargar cantidad, costo y precio sin salir del modal."}
          </div>
          <button
            type="button"
            className="btn btn-green"
            onClick={() => void handleCreateFromCollaborativeSuggestion(suggestion)}
            disabled={Boolean(creatingCollaborativeKey)}
          >
            {creatingCollaborativeKey === suggestionKey ? "Creando..." : "Crear y usar"}
          </button>
        </div>
      </section>
    );
  };

  const showCollaborativeLoadingState =
    isReceiveFlow &&
    shouldLookupCollaborative &&
    collaborativeLookupState === "loading" &&
    eligible.length === 0 &&
    collaborativeVisibleSuggestions.length === 0;
  const showEmptyResults =
    !showCollaborativeLoadingState &&
    eligible.length === 0 &&
    collaborativeVisibleSuggestions.length === 0;

  return (
    <>
      <div
      className="modal-overlay animate-fade-in"
      onClick={onClose}
      style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div
        className="modal animate-slide-up restock-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", display: "flex", flexDirection: "column" }}
      >
        <div className="restock-modal__header" style={{ padding: "12px", paddingBottom: "8px" }}>
          <div className="restock-modal__title-wrap">
            <h2 className="restock-modal__title" style={{ fontSize: "16px", margin: 0 }}>{modalTitle}</h2>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        {/* Filter + metadata */}
        <div className="restock-modal__toolbar">
          <div className="restock-modal__field-label" style={{ display: "none" }}>Buscar producto</div>
          <input
            className="input restock-modal__search-input"
            placeholder="🔍 Filtrar por nombre, marca, código, proveedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="restock-modal__field-hint" style={{ display: "none" }}>{helperCopy}</div>
          {isReceiveFlow && shouldLookupCollaborative && collaborativeLookupState === "loading" && (
            <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
              Buscando también en la base colaborativa...
            </div>
          )}
          {isReceiveFlow && collaborativeError && (
            <div style={{ fontSize: "11px", color: "var(--amber)", fontWeight: 700 }}>
              {collaborativeError}
            </div>
          )}
          {false && (
          <div className="restock-modal__quick-actions">
            <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
              Escaneá o filtra y, si falta el producto, podés darlo de alta acá mismo.
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0 14px", fontSize: "20px" }}
                onClick={() => setScannerOpen(true)}
                title="Escanear para buscar"
              >
                ðŸ“·
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ border: "1px solid var(--border)", fontWeight: 700 }}
                onClick={openInlineCreate}
              >
                + Nuevo
              </button>
            </div>
          </div>
          )}
          <div className="restock-modal__search-row">
            <div style={{ display: "none" }}>
              {helperCopy}
            </div>
            <div className="restock-modal__quick-actions" style={{ display: "flex", flexWrap: "nowrap", gap: "6px", width: "100%", overflowX: "auto", paddingBottom: "2px" }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: "1 0 auto", padding: "0 12px", fontWeight: 700 }}
                onClick={() => setScannerOpen(true)}
                title="Escanear para buscar"
              >
                Escanear
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: "1 0 auto", border: "1px solid var(--border)", fontWeight: 700 }}
                onClick={openInlineCreate}
              >
                Crear producto
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: "1 0 auto", border: "1px solid var(--border)", fontWeight: 700 }}
                onClick={() => setDetailsOpen((prev) => !prev)}
              >
                {detailsOpen ? "Ocultar detalles" : isReceiveFlow ? "Detalles" : "Motivos"}
              </button>
            </div>
          </div>
          {inlineNotice && (
            <div style={{ fontSize: "11px", color: "var(--green)", fontWeight: 700 }}>
              {inlineNotice}
            </div>
          )}
          {entryNote && (
            <div style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>
              {entryNote}
            </div>
          )}
          {detailsOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {isReceiveFlow ? (
            <>
              <input
                className="input"
                placeholder="Proveedor (opcional)"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
              <textarea
                className="input"
                placeholder="Nota del ingreso o detalle del comprobante (opcional)"
                value={restockNote}
                onChange={(e) => setRestockNote(e.target.value)}
                rows={2}
                style={{ resize: "vertical", minHeight: "78px" }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "rgba(15,23,42,.42)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700 }}>Comprobante</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 700 }}
                    onClick={handlePickAttachments}
                    disabled={uploadingAttachments}
                  >
                    {uploadingAttachments ? "Subiendo..." : "📷 Adjuntar foto"}
                  </button>
                </div>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  style={{ display: "none" }}
                  onChange={(event) => void handleAttachmentFiles(event.target.files)}
                />
                {attachments.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.url}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 8px",
                          borderRadius: "999px",
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          maxWidth: "100%",
                        }}
                      >
                        <span style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }}>
                          {attachment.name}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ padding: "0 4px", minHeight: "auto" }}
                          onClick={() => removeAttachment(attachment.url)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={trackCosts}
                  onChange={(e) => setTrackCosts(e.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700 }}>Seguir costos de la mercadería</div>
                </div>
              </label>
            </>
          ) : (
            <textarea
              className="input"
              placeholder="Motivo de la corrección (opcional)"
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
              rows={2}
              style={{ resize: "vertical", minHeight: "78px" }}
            />
          )}
            </div>
          )}
        </div>

        {/* Product list */}
        <div className="restock-modal__list">
          {showCollaborativeLoadingState ? (
            <div className="restock-modal__empty">
              <div>Buscando coincidencias en la base colaborativa...</div>
            </div>
          ) : showEmptyResults ? (
            <div className="restock-modal__empty">
              <div>Sin resultados para &quot;{search}&quot;</div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ border: "1px solid var(--border)", fontWeight: 700 }}
                onClick={openInlineCreate}
              >
                + Crear producto nuevo
              </button>
            </div>
          ) : (
            <>
              {eligible.map((product) => renderLocalProductCard(product))}
              {isReceiveFlow && collaborativeVisibleSuggestions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    paddingTop: eligible.length > 0 ? "4px" : 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--primary)" }}>
                      Base colaborativa
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      Crea el producto local y seguí cargando sin salir del ingreso.
                    </div>
                  </div>
                  {collaborativeVisibleSuggestions.map((suggestion) =>
                    renderCollaborativeSuggestionCard(suggestion),
                  )}
                </div>
              )}
              {false && eligible.map((p) => (
              <section
                key={p.id}
                className="restock-modal__product"
                style={{
                  border: p.id === activeSpotlightId
                    ? "1px solid rgba(34,197,94,0.34)"
                    : productHasChanges(p)
                      ? "1px solid rgba(251,191,36,0.28)"
                      : undefined,
                  boxShadow: p.id === activeSpotlightId
                    ? "0 0 0 1px rgba(34,197,94,0.14) inset, 0 20px 44px rgba(2,6,23,0.22)"
                    : productHasChanges(p)
                      ? "0 0 0 1px rgba(251,191,36,0.1) inset, 0 20px 44px rgba(2,6,23,0.18)"
                      : undefined,
                }}
              >
                <div className="restock-modal__product-head" style={{ alignItems: "center" }}>
                  <ProductThumb image={p.image} emoji={p.emoji} name={p.name} size={42} radius={12} previewable />
                  <div className="restock-modal__product-copy">
                    <div className="restock-modal__product-title-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="restock-modal__product-title" style={{ fontSize: "14px" }}>{p.name}</div>
                        {[p.brand, p.supplierName, p.presentation].filter(Boolean).length > 0 && (
                          <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "1px" }}>{[p.brand, p.supplierName, p.presentation].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                      <div className="restock-modal__product-tags">
                        {p.id === activeSpotlightId && (
                          <span className="restock-modal__tag restock-modal__tag--spotlight">Nuevo</span>
                        )}
                        {productHasChanges(p) && (
                          <span className="restock-modal__tag restock-modal__tag--changed">Pendiente</span>
                        )}
                      </div>
                    </div>

                    {[p.internalCode, p.barcode].filter(Boolean).length > 0 && (
                      <div className="restock-modal__product-meta">
                        {[p.internalCode, p.barcode].filter(Boolean).map((code) => (
                          <span key={code} className="restock-modal__product-chip">
                            {code}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="restock-modal__product-meta">
                      <span className="restock-modal__product-chip">Stock {formatStockQuantity(getProductTotalStock(p), p.soldByWeight) || "0"}</span>
                      {p.variants && p.variants.length > 0 && (
                        <span className="restock-modal__product-chip">{p.variants.length} variantes</span>
                      )}
                      {!p.variants && typeof p.availableStock === "number" && p.availableStock !== p.stock && (
                        <span className="restock-modal__product-chip">Vendible {formatStockQuantity(p.availableStock, p.soldByWeight) || "0"}</span>
                      )}
                      {getProductStockBadge(p) && (
                        <span className="restock-modal__product-chip" style={getStatusChipStyle(getProductStockBadge(p)!.tone)}>
                          {getProductStockBadge(p)!.label}
                        </span>
                      )}
                      {formatExpiryBadge(p) && (
                        <span className="restock-modal__product-chip">{formatExpiryBadge(p)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Simple product */}
                {(!p.variants || p.variants.length === 0) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-3)", flex: 1, minWidth: 0 }}>
                        Stock físico: {p.stock ?? 0}
                        {typeof p.availableStock === "number" && p.availableStock !== p.stock ? ` · Vendible: ${p.availableStock}` : ""}
                      </span>
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        placeholder={mode === "sumar" ? "+Cantidad" : "Cantidad"}
                        value={inputs[p.id] ?? ""}
                        onChange={(e) => setQty(p.id, e.target.value, setInputs)}
                        style={{ width: "100px", textAlign: "center", minWidth: 0 }}
                      />
                      {(() => {
                        const result = computeTargetStock(p.stock, p.id);
                        return result !== null ? (
                          <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--green)", minWidth: "48px" }}>= {result}</span>
                        ) : null;
                      })()}
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ border: "1px solid var(--border)" }}
                        onClick={() => void loadLots(p.id)}
                      >
                        {lotLoading[lotOwnerKey(p.id)] ? "..." : "📅"}
                      </button>
                    </div>
                    {isReceiveFlow && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>💰 Costo</span>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={costInputs[getPricingKey(p.id)] ?? ""}
                            onChange={(e) => setQty(getPricingKey(p.id), e.target.value, setCostInputs)}
                            style={{ textAlign: "right" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>💵 Precio</span>
                          <input
                            className="input"
                            type="number"
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={priceInputs[getPricingKey(p.id)] ?? ""}
                            onChange={(e) => setQty(getPricingKey(p.id), e.target.value, setPriceInputs)}
                            style={{ textAlign: "right" }}
                          />
                        </label>
                      </div>
                    )}
                    {openLotPanels[lotOwnerKey(p.id)] && renderLotsPanel(p, p.stock)}
                  </div>
                )}

                {/* Variants */}
                {p.variants && p.variants.length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {p.variants.map((v) => {
                      const val = v.id ? (variantInputs[v.id] ?? "") : "";
                      const result = v.id ? computeTargetStock(v.stock, p.id, v.id) : null;
                      return (
                        <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)" }}>
                              {v.name} <span style={{ color: "var(--text-3)", fontSize: "11px" }}>({v.stock ?? 0})</span>
                              {typeof v.availableStock === "number" && v.availableStock !== v.stock && (
                                <span style={{ color: "var(--text-3)", fontSize: "11px" }}> · Vendible {formatStockQuantity(v.availableStock, p.soldByWeight) || "0"}</span>
                              )}
                            </span>
                            <input
                              className="input"
                              type="number"
                              inputMode="numeric"
                              placeholder={mode === "sumar" ? "+Cant" : "Cant"}
                              value={val}
                              onChange={(e) => setQty(v.id ?? "", e.target.value, setVariantInputs)}
                              style={{ width: "90px", textAlign: "center" }}
                            />
                            {result !== null && (
                              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", minWidth: "40px" }}>= {result}</span>
                            )}
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ border: "1px solid var(--border)" }}
                              onClick={() => void loadLots(p.id, v.id)}
                            >
                              {lotLoading[lotOwnerKey(p.id, v.id)] ? "..." : "📅"}
                            </button>
                          </div>
                          {isReceiveFlow && v.id && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%" }}>
                              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>💰 Costo</span>
                                <input
                                  className="input"
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="$0.00"
                                  value={costInputs[getPricingKey(p.id, v.id)] ?? ""}
                                  onChange={(e) => setQty(getPricingKey(p.id, v.id), e.target.value, setCostInputs)}
                                  style={{ textAlign: "right" }}
                                />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>💵 Precio</span>
                                <input
                                  className="input"
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="$0.00"
                                  value={priceInputs[getPricingKey(p.id, v.id)] ?? ""}
                                  onChange={(e) => setQty(getPricingKey(p.id, v.id), e.target.value, setPriceInputs)}
                                  style={{ textAlign: "right" }}
                                />
                              </label>
                            </div>
                          )}
                          {openLotPanels[lotOwnerKey(p.id, v.id)] && renderLotsPanel(p, v.stock, v)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="restock-modal__footer">
          <div className="restock-modal__footer-copy">
            <div className="restock-modal__footer-title">
              {changesCount > 0
                ? `${changesCount} cambio${changesCount !== 1 ? "s" : ""} en ${visibleChangedCount} producto${visibleChangedCount !== 1 ? "s" : ""}`
                : "Todavia no cargaste cambios"}
            </div>
          {saveError && (
            <span style={{ fontSize: "12px", color: "var(--red)" }}>
              {saveError}
            </span>
          )}
            {!saveError && hasInvalidRows && (
              <div className="restock-modal__footer-text" style={{ color: "var(--red)" }}>
                Revisa los lotes.
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-green"
            onClick={handleSaveAll}
            disabled={saving || uploadingAttachments || changesCount === 0 || hasInvalidRows}
          >
            {saving
              ? "Guardando..."
              : uploadingAttachments
                ? "Subiendo..."
                : `${saveLabel}${changesCount > 0 ? ` (${changesCount})` : ""}`}
          </button>
        </div>
      </div>
    </div>
    {scannerOpen && (
      <BarcodeScanner
        onScan={(result) => {
          setSearch(result);
          setScannerOpen(false);
        }}
        onClose={() => setScannerOpen(false)}
      />
    )}
      {inlineCreateDraft && (
        <ModalPortal>
          <ProductModal
            key={`inline-${inlineCreateDraft.barcode || inlineCreateDraft.name || "draft"}`}
            product={null}
            draft={inlineCreateDraft}
            branchId={branchId}
            pricingMode={pricingMode}
          categories={categories}
          onClose={() => setInlineCreateDraft(null)}
          onSave={(payload) => {
            void handleInlineProductSave(payload);
          }}
          onCategoriesChange={onCategoriesChange}
          isOwner={isOwner}
          allowOpenStockAfter={false}
        />
      </ModalPortal>
    )}
    </>
  );
}

// ─── ReplicarModal ────────────────────────────────────────────────────────────
type Collision = { productId: string; branchId: string; productName: string; branchName: string; emoji: string | null };

function ReplicarModal({
  products,
  branches,
  pricingMode,
  sourceBranchId,
  onClose,
  onDone,
}: {
  products: Product[];
  branches: { id: string; name: string }[];
  pricingMode: PricingMode;
  sourceBranchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [copyPrice, setCopyPrice] = useState(pricingMode === "SHARED");
  const [copyStock, setCopyStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [overwriteConfig, setOverwriteConfig] = useState<Record<string, "overwrite" | "skip">>({});

  useEffect(() => {
    if (pricingMode === "SHARED") {
      setCopyPrice(true);
    }
  }, [pricingMode]);

  const toggleBranch = (id: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReplicar = async () => {
    if (selectedBranches.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inventario/replicar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": sourceBranchId },
        body: JSON.stringify({
          productIds: products.map((p) => p.id),
          targetBranchIds: Array.from(selectedBranches),
          copyPrice: pricingMode === "SHARED" ? true : copyPrice,
          copyStock,
          overwriteConfig: Object.keys(overwriteConfig).length > 0 ? overwriteConfig : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Error al replicar");
        return;
      }
      
      const data = await res.json();
      if (data.requiresConfirmation && data.collisions) {
        setCollisions(data.collisions);
        // Pre-fill everything with 'skip' by default to prevent accidental overrides
        const initialConfig: Record<string, "overwrite" | "skip"> = {};
        for (const c of data.collisions as Collision[]) {
          initialConfig[`${c.productId}:${c.branchId}`] = "skip";
        }
        setOverwriteConfig((prev) => ({ ...initialConfig, ...prev }));
      } else {
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (collisions.length > 0 && !done) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--red)" }}>⚠️ Algunos ya existen</h2>
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px", lineHeight: 1.4 }}>
              Intentás enviar productos que ya existen en la base de datos de destino. ¿Qué hacemos con ellos?
            </p>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "40dvh", paddingRight: "4px" }}>
            {collisions.map((c) => {
              const key = `${c.productId}:${c.branchId}`;
              const action = overwriteConfig[key] || "skip";
              return (
                <div key={key} style={{ border: `2px solid ${action === "overwrite" ? "var(--red)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "12px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: "8px", transition: "all 0.2s" }}>
                  <div style={{ fontSize: "14px", lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{c.emoji ? `${c.emoji} ` : ""}{c.productName}</span> 
                    <span style={{ color: "var(--text-3)" }}> en </span> 
                    <span style={{ fontWeight: 600 }}>{c.branchName}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button 
                      className={`btn btn-sm ${action === "skip" ? "btn-outline" : "btn-ghost"}`} 
                      style={{ flex: 1, borderColor: action === "skip" ? "var(--text-2)" : undefined, color: action === "skip" ? "var(--text-1)" : "var(--text-3)" }}
                      onClick={() => setOverwriteConfig(prev => ({ ...prev, [key]: "skip" }))}
                    >
                      Saltar (Conservar)
                    </button>
                    <button 
                      className={`btn btn-sm ${action === "overwrite" ? "btn-outline" : "btn-ghost"}`} 
                      style={{ flex: 1, borderColor: action === "overwrite" ? "var(--red)" : undefined, color: action === "overwrite" ? "var(--red)" : "var(--text-3)" }}
                      onClick={() => setOverwriteConfig(prev => ({ ...prev, [key]: "overwrite" }))}
                    >
                      Sobrescribir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCollisions([])}>Volver</button>
            <button className="btn btn-green" style={{ flex: 2 }} onClick={handleReplicar} disabled={loading}>
              {loading ? "Replicando..." : "Confirmar y Replicar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>↗ Replicar catálogo</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "24px" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
            <div style={{ fontWeight: 700 }}>{products.length} productos procesados</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "8px" }}>Las sucursales seleccionadas han sido actualizadas.</div>
            <button className="btn btn-green" style={{ marginTop: "16px", width: "100%" }} onClick={onDone}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "14px", color: "var(--text-2)" }}>
              Replicar <strong>{products.length}</strong> producto{products.length !== 1 ? "s" : ""} a:
            </div>

            {branches.map((b) => (
              <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", border: `2px solid ${selectedBranches.has(b.id) ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", cursor: "pointer", background: selectedBranches.has(b.id) ? "rgba(var(--primary-rgb,34,197,94),.08)" : "var(--surface)" }}>
                <input type="checkbox" checked={selectedBranches.has(b.id)} onChange={() => toggleBranch(b.id)} />
                <span style={{ fontWeight: 600 }}>{b.name}</span>
              </label>
            ))}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pricingMode === "SHARED" ? true : copyPrice}
                  onChange={(e) => setCopyPrice(e.target.checked)}
                  disabled={pricingMode === "SHARED"}
                />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>
                  {pricingMode === "SHARED"
                    ? "✅ Precio y costo actuales obligatorios porque el kiosco usa precios compartidos"
                    : copyPrice
                      ? "✅ Sincronizar precio y costo actuales"
                      : "❌ No sincronizar precio y costo actuales"}
                </span>
              </label>
              
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input type="checkbox" checked={copyStock} onChange={(e) => setCopyStock(e.target.checked)} />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>{copyStock ? "✅ Usar" : "❌ Empezará en 0"} stock actual como valor inicial</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleReplicar} disabled={loading || selectedBranches.size === 0}>
                {loading ? "Replicando..." : `Replicar a ${selectedBranches.size} sucursal${selectedBranches.size !== 1 ? "es" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TransferirStockModal ─────────────────────────────────────────────────────
function TransferirStockModal({
  products,
  branches,
  sourceBranchId,
  onClose,
  onDone,
}: {
  products: Product[];
  branches: { id: string; name: string }[];
  sourceBranchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [targetBranchId, setTargetBranchId] = useState(branches[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState<StockTransferStrategy>("nearest_first");
  const [transferLots, setTransferLots] = useState<Record<string, TransferLotRecord[]>>({});
  const [loadingLots, setLoadingLots] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTransferableStock = useCallback((availableStock?: number | null, stock?: number | null) => {
    const base =
      typeof availableStock === "number"
        ? availableStock
        : typeof stock === "number"
          ? stock
          : 0;
    return Math.max(base, 0);
  }, []);

  const hasLoadedTransferLots = useCallback(
    (key: string) => Object.prototype.hasOwnProperty.call(transferLots, key),
    [transferLots],
  );

  const loadTransferLots = useCallback(
    async (productId: string, variantId?: string) => {
      const key = lotOwnerKey(productId, variantId);
      if (loadingLots[key] || hasLoadedTransferLots(key)) {
        return;
      }

      setLoadingLots((prev) => ({ ...prev, [key]: true }));
      try {
        const params = new URLSearchParams({ productId });
        if (variantId) {
          params.set("variantId", variantId);
        }

        const res = await fetch(`/api/inventario/lotes?${params.toString()}`, {
          headers: { "x-branch-id": sourceBranchId },
        });
        if (!res.ok) {
          throw new Error("No se pudo cargar el desglose por vencimiento.");
        }

        const data = await res.json();
        const nextLots = Array.isArray(data?.lots)
          ? data.lots
              .filter(
                (lot: { id?: string; quantity?: number; expiresOn?: string }) =>
                  Boolean(lot?.id) &&
                  Number.isInteger(lot?.quantity) &&
                  (lot?.quantity ?? 0) > 0 &&
                  Boolean(lot?.expiresOn),
              )
              .map((lot: { id: string; quantity: number; expiresOn: string }) => ({
                id: lot.id,
                quantity: lot.quantity,
                expiresOn: lot.expiresOn,
              }))
          : [];

        setTransferLots((prev) => ({ ...prev, [key]: nextLots }));
      } catch (lotError) {
        console.error("Error cargando lotes para transferencia:", lotError);
        setTransferLots((prev) => ({ ...prev, [key]: [] }));
      } finally {
        setLoadingLots((prev) => ({ ...prev, [key]: false }));
      }
    },
    [hasLoadedTransferLots, loadingLots, sourceBranchId],
  );

  const setQty = (productId: string, value: string, variantId?: string) => {
    const key = lotOwnerKey(productId, variantId);
    setQuantities((prev) => ({ ...prev, [key]: value }));
    setError(null);

    if (!parseStockQuantity(value)) {
      return;
    }

    const product = products.find((item) => item.id === productId);
    const hasTrackedLots = variantId
      ? Boolean(product?.variants?.find((variant) => variant.id === variantId)?.hasTrackedLots)
      : Boolean(product?.hasTrackedLots);

    if (hasTrackedLots) {
      void loadTransferLots(productId, variantId);
    }
  };

  const getRequestedQuantity = useCallback(
    (productId: string, variantId?: string) =>
      parseStockQuantity(quantities[lotOwnerKey(productId, variantId)] ?? "") ?? 0,
    [quantities],
  );

  const getTransferPlanForRow = useCallback(
    (
      productId: string,
      totalStock: number | null | undefined,
      availableStock: number | null | undefined,
      hasTrackedLots: boolean | undefined,
      variantId?: string,
    ) => {
      const key = lotOwnerKey(productId, variantId);
      const requestedQuantity = getRequestedQuantity(productId, variantId);
      const fallbackTransferable = getTransferableStock(availableStock, totalStock);
      const loadedLots = transferLots[key] ?? [];
      const canUseLoadedLots = hasTrackedLots && hasLoadedTransferLots(key);
      const plan = canUseLoadedLots
        ? planStockTransfer({
            totalStock: typeof totalStock === "number" ? totalStock : 0,
            requestedQuantity,
            lots: loadedLots,
            strategy,
          })
        : null;

      return {
        requestedQuantity,
        transferableQuantity: plan?.transferableQuantity ?? fallbackTransferable,
        plan,
        isLoadingLots: Boolean(loadingLots[key]),
      };
    },
    [getRequestedQuantity, getTransferableStock, hasLoadedTransferLots, loadingLots, strategy, transferLots],
  );

  const productsWithTransferableStock = useMemo(
    () =>
      products.filter((product) => {
        if (product.variants && product.variants.length > 0) {
          return product.variants.some(
            (variant) => getTransferableStock(variant.availableStock, variant.stock) > 0,
          );
        }

        return getTransferableStock(product.availableStock, product.stock) > 0;
      }),
    [getTransferableStock, products],
  );

  const hasTrackedLotsInScope = useMemo(
    () =>
      productsWithTransferableStock.some(
        (product) =>
          product.hasTrackedLots ||
          Boolean(
            product.variants?.some(
              (variant) =>
                variant.hasTrackedLots && getTransferableStock(variant.availableStock, variant.stock) > 0,
            ),
          ),
      ),
    [getTransferableStock, productsWithTransferableStock],
  );

  const buildItems = () => {
    const items: { productId: string; variantId?: string; quantity: number }[] = [];
    for (const product of productsWithTransferableStock) {
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          if (!variant.id || getTransferableStock(variant.availableStock, variant.stock) <= 0) {
            continue;
          }

          const qty = getRequestedQuantity(product.id, variant.id);
          if (qty > 0) {
            items.push({ productId: product.id, variantId: variant.id, quantity: qty });
          }
        }
      } else {
        if (getTransferableStock(product.availableStock, product.stock) <= 0) {
          continue;
        }

        const qty = getRequestedQuantity(product.id);
        if (qty > 0) {
          items.push({ productId: product.id, quantity: qty });
        }
      }
    }
    return items;
  };

  const totalItems = buildItems().length;

  const hasInvalidQuantities = productsWithTransferableStock.some((product) => {
    if (product.variants && product.variants.length > 0) {
      return product.variants.some((variant) => {
        if (!variant.id || getTransferableStock(variant.availableStock, variant.stock) <= 0) {
          return false;
        }

        const rowState = getTransferPlanForRow(
          product.id,
          variant.stock,
          variant.availableStock,
          variant.hasTrackedLots,
          variant.id,
        );
        return rowState.requestedQuantity > rowState.transferableQuantity;
      });
    }

    const rowState = getTransferPlanForRow(
      product.id,
      product.stock,
      product.availableStock,
      product.hasTrackedLots,
    );
    return rowState.requestedQuantity > rowState.transferableQuantity;
  });

  const formatPlanDate = (value: string) =>
    new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-AR", { timeZone: "UTC" });

  const renderTransferPlan = ({
    productId,
    totalStock,
    availableStock,
    hasTrackedLots,
    variantId,
  }: {
    productId: string;
    totalStock: number | null | undefined;
    availableStock: number | null | undefined;
    hasTrackedLots?: boolean;
    variantId?: string;
  }) => {
    const rowState = getTransferPlanForRow(productId, totalStock, availableStock, hasTrackedLots, variantId);

    if (rowState.requestedQuantity <= 0 || !hasTrackedLots) {
      return null;
    }

    if (rowState.isLoadingLots && !rowState.plan) {
      return (
        <div
          style={{
            marginTop: "8px",
            padding: "8px 10px",
            borderRadius: "10px",
            background: "rgba(148,163,184,0.08)",
            color: "var(--text-3)",
            fontSize: "12px",
          }}
        >
          Cargando desglose de vencimientos...
        </div>
      );
    }

    if (!rowState.plan) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "8px",
          padding: "10px 12px",
          borderRadius: "12px",
          background: "rgba(15,23,42,0.35)",
          border: "1px solid rgba(148,163,184,0.16)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
          Vista previa
        </div>

        {rowState.plan.lotsToTransfer.map((lot) => (
          <div key={`${lot.id ?? lot.expiresOn}-${lot.quantity}`} style={{ fontSize: "12px", color: "var(--text-2)" }}>
            {lot.quantity} u. {"->"} {formatPlanDate(lot.expiresOn)}
          </div>
        ))}

        {rowState.plan.untrackedQuantity > 0 && (
          <div style={{ fontSize: "12px", color: "var(--text-2)" }}>
            {rowState.plan.untrackedQuantity} u. sin fecha
          </div>
        )}

        {rowState.plan.expiredQuantity > 0 && (
          <div style={{ fontSize: "12px", color: "var(--amber)" }}>
            {rowState.plan.expiredQuantity} u. vencidas quedan fuera de esta transferencia
          </div>
        )}

        {rowState.requestedQuantity > rowState.transferableQuantity && (
          <div style={{ fontSize: "12px", color: "var(--red)" }}>
            Maximo transferible: {rowState.transferableQuantity} u.
          </div>
        )}
      </div>
    );
  };

  const handleTransferir = async () => {
    const items = buildItems();
    if (items.length === 0 || !targetBranchId || hasInvalidQuantities) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventario/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-branch-id": sourceBranchId },
        body: JSON.stringify({ items, targetBranchId, strategy }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Error al transferir");
      } else {
        onDone();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, alignItems: "flex-end", padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90dvh", overflowY: "auto", padding: "20px", width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800 }}>⇄ Transferir Stock</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Sucursal destino</label>
          <select className="input" value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} style={{ width: "100%", background: "var(--surface)", cursor: "pointer" }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {hasTrackedLotsInScope && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "12px",
              borderRadius: "14px",
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.18)",
            }}
          >
            <label style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>
              Enviar primero
            </label>
            <select
              className="input"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as StockTransferStrategy)}
              style={{ width: "100%", background: "var(--surface)", cursor: "pointer" }}
            >
              <option value="nearest_first">Mas proximas primero</option>
              <option value="farthest_first">Mas lejanas primero</option>
            </select>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
              Los lotes vencidos no se transfieren desde este flujo.
            </div>
          </div>
        )}

        <div style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>Cantidad a transferir</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "320px" }}>
          {productsWithTransferableStock.map((product) => (
            <div key={product.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", background: "var(--surface)" }}>
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>{product.emoji ? `${product.emoji} ` : ""}{product.name}</div>
              {product.variants && product.variants.length > 0 ? (
                product.variants
                  .filter((variant) => variant.id && getTransferableStock(variant.availableStock, variant.stock) > 0)
                  .map((variant) => {
                    const rowState = getTransferPlanForRow(
                      product.id,
                      variant.stock,
                      variant.availableStock,
                      variant.hasTrackedLots,
                      variant.id,
                    );
                    const maxStock = rowState.transferableQuantity;
                    const isOver = rowState.requestedQuantity > maxStock;
                    return (
                      <div key={variant.id} style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ flex: 1, fontSize: "13px", color: "var(--text-2)" }}>
                            {variant.name} <span style={{ color: "var(--text-3)" }}>(transferible: {maxStock})</span>
                          </span>
                          <input
                            className="input"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={maxStock}
                            placeholder="0"
                            value={quantities[lotOwnerKey(product.id, variant.id)] ?? ""}
                            onChange={(e) => setQty(product.id, e.target.value, variant.id)}
                            style={{ width: "72px", textAlign: "right", borderColor: isOver ? "var(--red)" : undefined }}
                          />
                        </div>
                        {renderTransferPlan({
                          productId: product.id,
                          totalStock: variant.stock,
                          availableStock: variant.availableStock,
                          hasTrackedLots: variant.hasTrackedLots,
                          variantId: variant.id,
                        })}
                      </div>
                    );
                  })
              ) : (
                (() => {
                  const rowState = getTransferPlanForRow(
                    product.id,
                    product.stock,
                    product.availableStock,
                    product.hasTrackedLots,
                  );
                  const maxStock = rowState.transferableQuantity;
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: 1, fontSize: "13px", color: "var(--text-3)" }}>
                          Stock transferible: {maxStock}
                        </span>
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={maxStock}
                          placeholder="0"
                          value={quantities[lotOwnerKey(product.id)] ?? ""}
                          onChange={(e) => setQty(product.id, e.target.value)}
                          style={{ width: "72px", textAlign: "right", borderColor: rowState.requestedQuantity > maxStock ? "var(--red)" : undefined }}
                        />
                      </div>
                      {renderTransferPlan({
                        productId: product.id,
                        totalStock: product.stock,
                        availableStock: product.availableStock,
                        hasTrackedLots: product.hasTrackedLots,
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          ))}
          {productsWithTransferableStock.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-3)" }}>No hay productos con stock para transferir</div>
          )}
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: "13px", padding: "8px 12px", background: "rgba(239,68,68,.1)", borderRadius: "var(--radius-sm)" }}>{error}</div>}
        {hasInvalidQuantities && !error && (
          <div style={{ color: "var(--red)", fontSize: "13px", padding: "8px 12px", background: "rgba(239,68,68,.1)", borderRadius: "var(--radius-sm)" }}>
            Revisa las cantidades: alguna supera el maximo transferible.
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-green" style={{ flex: 2 }} onClick={handleTransferir} disabled={loading || totalItems === 0 || !targetBranchId || hasInvalidQuantities}>
            {loading ? "Transfiriendo..." : `Transferir ${totalItems > 0 ? `(${totalItems} ítem${totalItems !== 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Products Page ────────────────────────────────────────────────────────
function PlatformBulkSyncModal({
  linkedCount,
  onClose,
  onConfirm,
  loading,
}: {
  linkedCount: number;
  onClose: () => void;
  onConfirm: (mode: PlatformSyncActionMode) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<PlatformSyncActionMode>("image");

  const options: Array<{
    value: PlatformSyncActionMode;
    title: string;
    description: string;
  }> = [
    {
      value: "image",
      title: "Solo fotos",
      description: "Actualiza las imagenes desde la base colaborativa sin tocar nombres ni datos operativos.",
    },
    {
      value: "text",
      title: "Titulos y textos",
      description: "Sincroniza nombre, marca, descripcion y presentacion. No toca foto, stock ni precios.",
    },
    {
      value: "all",
      title: "Todo",
      description: "Aplica fotos y textos descriptivos. Si el producto es simple, tambien actualiza el barcode base.",
    },
  ];

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: "560px", width: "100%" }} onClick={(event) => event.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Sincronizar base general</h2>
              <p style={{ marginTop: "6px", color: "var(--text-2)", fontSize: "14px", lineHeight: 1.5 }}>
                Esto se aplica sobre {linkedCount} producto{linkedCount === 1 ? "" : "s"} ya vinculados en tu cuenta.
                Stock, precio, costo, minimos y vencimientos quedan intactos.
              </p>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={loading}>
              Cerrar
            </button>
          </div>

          <div style={{ display: "grid", gap: "10px", marginTop: "18px" }}>
            {options.map((option) => {
              const active = mode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setMode(option.value)}
                  style={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    border: `1px solid ${active ? "rgba(34,197,94,.32)" : "var(--border)"}`,
                    background: active ? "rgba(34,197,94,.1)" : "var(--surface-2)",
                    padding: "14px 16px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <span style={{ fontSize: "15px", fontWeight: 800 }}>{option.title}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>{option.description}</span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button className="btn btn-green" onClick={() => onConfirm(mode)} disabled={loading || linkedCount === 0}>
              {loading ? "Sincronizando..." : "Aplicar sincronizacion"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function ProductosPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = params.branchId as string;
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const wantsWelcomeSubscription = searchParams.get("welcome-subscription") === "1";

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [percentStr, setPercentStr] = useState("15");
  const [modal, setModal] = useState<"new" | Product | null>(null);
  // ─── Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [showBulkVariantGroupModal, setShowBulkVariantGroupModal] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulking, setBulking] = useState(false);
  const [groupingVariants, setGroupingVariants] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── Multi-branch state
  interface Branch { id: string; name: string; }
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [pricingMode, setPricingMode] = useState<PricingMode>("BRANCH");
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockModalPreset, setStockModalPreset] = useState<StockModalPreset | null>(null);
  const [showReplicarModal, setShowReplicarModal] = useState(false);
  const [showTransferirModal, setShowTransferirModal] = useState(false);
  const [showCatalogImportModal, setShowCatalogImportModal] = useState(false);
  const [showPlatformSyncModal, setShowPlatformSyncModal] = useState(false);
  const [showRestockHistoryModal, setShowRestockHistoryModal] = useState(false);
  const [showInventoryValuationModal, setShowInventoryValuationModal] = useState(false);
  const [syncingPlatformCatalog, setSyncingPlatformCatalog] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [exportingCatalog, setExportingCatalog] = useState(false);
  const [showWelcomeOfferModal, setShowWelcomeOfferModal] = useState(false);
  const [welcomeOfferLoading, setWelcomeOfferLoading] = useState(false);
  const [welcomeOfferError, setWelcomeOfferError] = useState("");
  const [welcomeOffer, setWelcomeOffer] = useState<{
    priceArs: number;
    freezeEndsAt: string | null;
  } | null>(null);

  const clearWelcomeSubscriptionFlag = useCallback(() => {
    if (!wantsWelcomeSubscription) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("welcome-subscription");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/${branchId}/productos?${nextQuery}` : `/${branchId}/productos`);
  }, [branchId, router, searchParams, wantsWelcomeSubscription]);

  const fetchBranches = useCallback(async () => {
    if (branchesLoaded) return;
    try {
      const res = await fetch("/api/branches", { headers: { "x-branch-id": branchId } });
      if (res.ok) {
        const data = await res.json();
        setBranches(Array.isArray(data?.branches) ? data.branches : []);
      }
    } finally {
      setBranchesLoaded(true);
    }
  }, [branchId, branchesLoaded]);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);

  const pctMatch = parseInt(percentStr, 10);
  const percent = isNaN(pctMatch) ? 0 : pctMatch;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    // We use showInGrid=false to get ALL products (including hidden)
    const res = await fetch("/api/productos?all=1", {
      headers: { "x-branch-id": branchId },
    });
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    
    // Fetch categories para pasarlas al modal y mostrarlas
    const catRes = await fetch("/api/categorias", {
      headers: { "x-branch-id": branchId },
    });
    const catData = await catRes.json();
    setCategories(Array.isArray(catData) ? catData : []);

    const settingsRes = await fetch("/api/kiosco/settings", {
      headers: { "x-branch-id": branchId },
    });
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json();
      setPricingMode(settingsData?.pricingMode === "SHARED" ? "SHARED" : "BRANCH");
    }

    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchProducts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchProducts]);

  useEffect(() => {
    if (!catalogNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCatalogNotice(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [catalogNotice]);

  useEffect(() => {
    if (!wantsWelcomeSubscription || !isOwner) {
      return;
    }

    let cancelled = false;

    const loadWelcomeOffer = async () => {
      try {
        const response = await fetch("/api/subscription/status", {
          headers: { "x-branch-id": branchId },
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || cancelled) {
          clearWelcomeSubscriptionFlag();
          return;
        }

        if (data?.welcomeOffer?.canShow && typeof data?.welcomeOffer?.priceArs === "number") {
          setWelcomeOffer({
            priceArs: data.welcomeOffer.priceArs,
            freezeEndsAt:
              typeof data.welcomeOffer.freezeEndsAt === "string"
                ? data.welcomeOffer.freezeEndsAt
                : null,
          });
          setShowWelcomeOfferModal(true);
          return;
        }

        clearWelcomeSubscriptionFlag();
      } catch {
        if (!cancelled) {
          clearWelcomeSubscriptionFlag();
        }
      }
    };

    void loadWelcomeOffer();

    return () => {
      cancelled = true;
    };
  }, [branchId, clearWelcomeSubscriptionFlag, isOwner, wantsWelcomeSubscription]);

  const dismissWelcomeOffer = useCallback(async () => {
    try {
      await fetch("/api/subscription/welcome-offer", {
        method: "POST",
        headers: { "x-branch-id": branchId },
      });
    } finally {
      setShowWelcomeOfferModal(false);
      setWelcomeOfferError("");
      clearWelcomeSubscriptionFlag();
    }
  }, [branchId, clearWelcomeSubscriptionFlag]);

  const handleActivateWelcomeOffer = useCallback(async () => {
    setWelcomeOfferLoading(true);
    setWelcomeOfferError("");

    try {
      const response = await fetch("/api/subscription/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ origin: "WELCOME_MODAL" }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.init_point) {
        setWelcomeOfferError(data?.error || "No se pudo generar el link de pago.");
        setWelcomeOfferLoading(false);
        return;
      }

      clearWelcomeSubscriptionFlag();
      window.location.href = data.init_point;
    } catch {
      setWelcomeOfferError("No se pudo conectar con Mercado Pago ahora.");
      setWelcomeOfferLoading(false);
    }
  }, [branchId, clearWelcomeSubscriptionFlag]);

  const filtered = products.filter((p) => {
    const normalizedSearch = search.toLowerCase();
    const searchHaystack = [
      p.name,
      p.barcode,
      p.internalCode,
      p.brand,
      p.presentation,
      p.supplierName,
      p.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchSearch = searchHaystack.includes(normalizedSearch);
    const matchVisibility = showHidden ? true : p.showInGrid;
    return matchSearch && matchVisibility;
  });

  const selectedProducts = useMemo(
    () => products.filter((product) => selected.has(product.id)),
    [products, selected],
  );
  const canGroupSelected =
    selectedProducts.length >= 2 &&
    selectedProducts.every((product) => (product.variants?.length ?? 0) === 0);
  const linkedPlatformProductsCount = products.filter((product) => Boolean(product.platformProductId)).length;

  const handleApplyUpdate = async () => {
    if (percent === 0) return;
    setLoading(true);
    await fetch("/api/productos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({
        productIds: filtered.map((p) => p.id),
        percentage: percent,
      }),
    });
    setShowUpdateModal(false);
    fetchProducts();
  };

  const handleBulkPlatformSync = async (mode: PlatformSyncActionMode) => {
    setSyncingPlatformCatalog(true);
    setCatalogNotice(null);

    try {
      const response = await fetch("/api/productos/sync-platform", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setCatalogNotice(data?.error || "No pudimos sincronizar desde la base general.");
        return;
      }

      const updated = Number(data?.updatedProducts ?? 0);
      const modeLabel =
        mode === "image" ? "fotos" : mode === "text" ? "titulos y textos" : "todo";
      setCatalogNotice(
        updated > 0
          ? `Base general sincronizada: ${updated} producto${updated === 1 ? "" : "s"} actualizado${updated === 1 ? "" : "s"} en ${modeLabel}.`
          : "No habia cambios pendientes para aplicar.",
      );
      setShowPlatformSyncModal(false);
      await fetchProducts();
    } catch (syncError) {
      console.error(syncError);
      setCatalogNotice("No pudimos sincronizar desde la base general.");
    } finally {
      setSyncingPlatformCatalog(false);
    }
  };

  const hiddenCount = products.filter((p) => !p.showInGrid).length;

  const shortcuts = useMemo(
    () => [
      {
        key: "/",
        combo: "/",
        label: "Buscar producto",
        description: "Lleva el foco al buscador del catalogo.",
        group: "Productos",
        action: () => searchInputRef.current?.focus(),
      },
      {
        key: "n",
        combo: "Alt+N",
        label: "Nuevo producto",
        description: "Abre el formulario para crear un producto.",
        group: "Productos",
        alt: true,
        action: () => setModal("new"),
      },
      {
        key: "h",
        combo: "Alt+H",
        label: "Mostrar ocultos",
        description: "Alterna la vista de productos ocultos.",
        group: "Productos",
        alt: true,
        action: () => setShowHidden((prev) => !prev),
      },
    ],
    []
  );

  useRegisterShortcuts(shortcuts);

  // ─── Bulk selection helpers
  const toggleSelectionMode = () => {
    setSelectionMode((v) => !v);
    setSelected(new Set());
    setConfirmingDelete(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    // Delete products one by one (could be batched later)
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/productos/${id}`, {
          method: "DELETE",
          headers: { "x-branch-id": branchId },
        })
      )
    );
    setDeleting(false);
    setSelectionMode(false);
    setSelected(new Set());
    setConfirmingDelete(false);
    fetchProducts();
  };

  const handleBulkCategorize = async () => {
    if (selected.size === 0) return;
    setBulking(true);

    await fetch("/api/productos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-branch-id": branchId },
      body: JSON.stringify({
        productIds: Array.from(selected),
        categoryId: bulkCategoryId || null, // null clears category
      }),
    });

    setBulking(false);
    setShowBulkCategoryModal(false);
    setSelectionMode(false);
    setSelected(new Set());
    fetchProducts();
  };

  const handleBulkGroupVariants = async (payload: BulkVariantGroupPayload) => {
    if (selectedProducts.length < 2) {
      return;
    }

    setGroupingVariants(true);
    try {
      const response = await fetch("/api/productos/group-variants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({
          productIds: selectedProducts.map((product) => product.id),
          baseProductId: payload.baseProductId,
          parentName: payload.parentName,
          variants: payload.variants,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        alert(data?.error || "No se pudieron agrupar los productos.");
        return;
      }

      setShowBulkVariantGroupModal(false);
      setSelectionMode(false);
      setSelected(new Set());
      await fetchProducts();
      alert(`Listo. Se creó "${data?.product?.name ?? payload.parentName}" con variantes.`);
    } catch (error) {
      console.error(error);
      alert("No se pudieron agrupar los productos.");
    } finally {
      setGroupingVariants(false);
    }
  };

  const handleProductModalSave = async (payload?: ProductModalSavePayload) => {
    setModal(null);
    await fetchProducts();

    if (payload?.openStockAfter && payload.productId) {
      setStockModalPreset({
        initialSearch: payload.productName ?? "",
        initialOperation: "correct",
        spotlightProductId: payload.productId,
        entryNote: payload.hasVariants
          ? "Producto creado. Definí el stock final y, si querés, cargá vencimientos por variante."
          : "Producto creado. Definí el stock final y, si querés, cargá vencimientos ahora.",
      });
      setShowStockModal(true);
      return;
    }

    setStockModalPreset(null);
  };

  const handleExportCatalog = useCallback(async () => {
    try {
      setExportingCatalog(true);
      setCatalogNotice(null);

      const productIds =
        selectionMode && selected.size > 0 ? Array.from(selected) : products.map((product) => product.id);

      const response = await fetch("/api/productos/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-branch-id": branchId,
        },
        body: JSON.stringify({ productIds }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : "No pudimos exportar el archivo.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setCatalogNotice("Plantilla descargada.");
    } catch (exportError) {
      setCatalogNotice(exportError instanceof Error ? exportError.message : "No pudimos exportar el archivo.");
    } finally {
      setExportingCatalog(false);
    }
  }, [branchId, products, selected, selectionMode]);

  return (
    <>
    <div className="screen-only" style={{ padding: "24px 16px", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
          {selectionMode ? (
            <button className="btn btn-sm btn-ghost" onClick={toggleSelectionMode} style={{ fontWeight: 600, alignSelf: "flex-start" }}>Cancelar</button>
          ) : (
            <BackButton />
          )}
          <h1 style={{ fontSize: "28px", lineHeight: 1.05, fontWeight: 900 }}>Productos</h1>
        </div>
        <div className="products-header-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!selectionMode && (
            <>
              <button
                className="btn btn-sm btn-ghost"
                style={{ border: "1px solid var(--border)", fontWeight: 700 }}
                onClick={() => {
                  setStockModalPreset({ initialOperation: "receive" });
                  setShowStockModal(true);
                }}
                title="Recibir mercadería"
              >📥 Recibir</button>
              {isOwner && (
                <>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600, display: "none" }}
                    onClick={() => void handleExportCatalog()}
                    disabled={exportingCatalog || products.length === 0}
                    title="Descargar plantilla XLSX"
                  >{exportingCatalog ? "..." : "Exportar"}</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600, display: "none" }}
                    onClick={() => setShowCatalogImportModal(true)}
                    title="Importar plantilla XLSX"
                  >Importar</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600, display: "none" }}
                    onClick={() => setShowReplicarModal(true)}
                    disabled={branches.length <= 1}
                    title="Replicar productos a otra sucursal"
                  >↗ Replicar</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ border: "1px solid var(--border)", fontWeight: 600, display: "none" }}
                    onClick={() => setShowTransferirModal(true)}
                    disabled={branches.length <= 1}
                    title="Transferir stock entre sucursales"
                  >⇄ Transferir</button>
                </>
              )}
              <button className="btn btn-sm btn-ghost" style={{ display: "none" }} onClick={() => setShowUpdateModal(true)}>+%</button>
              <button className="btn btn-sm btn-ghost" style={{ border: "1px solid var(--border)" }} onClick={toggleSelectionMode}>☑</button>
              <ProductsActionsMenu
                isOwner={Boolean(isOwner)}
                exporting={exportingCatalog}
                hasMultipleBranches={branches.length > 1}
                canExport={products.length > 0}
                canPlatformSync={linkedPlatformProductsCount > 0}
                onExport={() => void handleExportCatalog()}
                onImport={() => setShowCatalogImportModal(true)}
                onPlatformSync={() => setShowPlatformSyncModal(true)}
                onReplicate={() => setShowReplicarModal(true)}
                onTransfer={() => setShowTransferirModal(true)}
                onManualValuation={() => setShowInventoryValuationModal(true)}
                onRestockHistory={() => setShowRestockHistoryModal(true)}
                onCorrectInventory={() => {
                  setStockModalPreset({ initialOperation: "correct" });
                  setShowStockModal(true);
                }}
                onUpdatePrices={() => setShowUpdateModal(true)}
                onSelectionMode={toggleSelectionMode}
              />
              <button className="btn btn-sm btn-green" onClick={() => setModal("new")} style={{ fontWeight: 800 }}>+ Nuevo</button>
            </>
          )}
        </div>
      </div>

      {/* Search & filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
          <input
            ref={searchInputRef}
            className="input"
            placeholder="🔍 Buscar por nombre, codigo o proveedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
        />
        {hiddenCount > 0 && (
          <button
            className={`btn btn-sm ${showHidden ? "btn-green" : "btn-ghost"}`}
            onClick={() => setShowHidden((v) => !v)}
            title="Mostrar ocultos"
            style={{ flexShrink: 0 }}
          >
            👁 {hiddenCount}
          </button>
        )}
      </div>

      {catalogNotice && (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 14px",
            borderRadius: "14px",
            border: `1px solid ${catalogNotice.includes("No pudimos") ? "rgba(239,68,68,0.24)" : "rgba(34,197,94,0.24)"}`,
            background: catalogNotice.includes("No pudimos")
              ? "rgba(239,68,68,0.12)"
              : "rgba(34,197,94,0.12)",
            color: catalogNotice.includes("No pudimos") ? "var(--red)" : "var(--green)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {catalogNotice}
        </div>
      )}

      {/* Product List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>Cargando...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
          {filtered.map((p) => {
            const isSelected = selected.has(p.id);
            const expiryBadge = renderExpiryBadge(p);
            const stockBadge = renderStockBadge(p);
            const stockSummary = renderProductStockSummary(p);
            const platformSyncBadge = renderPlatformSyncBadge(p, Boolean(isOwner));
            const cardChrome = getProductCardBorder(p);
            return selectionMode ? (
              // ─── Selection Mode Card
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  border: isSelected ? `2px solid var(--primary)` : cardChrome.border,
                  borderRadius: "var(--radius)",
                  background: isSelected ? "rgba(var(--primary-rgb, 34, 197, 94), 0.08)" : "var(--surface)",
                  boxShadow: isSelected ? "0 0 0 1px rgba(34,197,94,0.16) inset" : cardChrome.boxShadow,
                  opacity: p.showInGrid ? 1 : 0.6,
                  transition: "border 0.15s, background 0.15s, box-shadow 0.15s",
                }}
              >
                {/* Checkbox visual */}
                <div style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                  background: isSelected ? "var(--primary)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                  fontSize: "13px",
                  color: "white",
                  fontWeight: 800,
                }}>
                  {isSelected ? "✓" : ""}
                </div>
                <ProductThumb image={p.image} emoji={p.emoji} name={p.name} size={56} radius={16} previewable />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "calc(15px * var(--device-font-scale, 1))", color: "var(--text)" }}>{p.name}</div>
                  {p.soldByWeight && (
                    <span
                      style={{
                        display: "inline-flex",
                        marginTop: "6px",
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
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    {[p.internalCode, p.barcode, p.supplierName].filter(Boolean).join(" · ") || "Sin codigo extra"}
                  </div>
                  {stockSummary}
                  {stockBadge}
                  {platformSyncBadge}
                  {expiryBadge}
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "4px",
                    justifyItems: "end",
                    alignSelf: "center",
                    flexShrink: 0,
                    minWidth: "84px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "calc(11px * var(--device-font-scale, 1))",
                      fontWeight: 800,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                    }}
                  >
                    Precio
                  </div>
                  <div
                    style={{
                      fontSize: "calc(18px * var(--device-font-scale, 1))",
                      fontWeight: 900,
                      color: "#f8fafc",
                      background: "linear-gradient(180deg, rgba(15,23,42,.96), rgba(30,41,59,.96))",
                      border: "1px solid rgba(148,163,184,.2)",
                      borderRadius: "14px",
                      padding: "8px 10px",
                      boxShadow: "0 10px 22px rgba(2,6,23,.18)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.hasVariablePrices && typeof p.priceMax === "number" && p.priceMax > p.price
                      ? `${formatARS(p.price)} - ${formatARS(p.priceMax)}`
                      : formatARS(p.price)}
                  </div>
                </div>
              </button>
            ) : (
              // ─── Normal Card
              <button
                key={p.id}
                className="card"
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  border: cardChrome.border,
                  boxShadow: cardChrome.boxShadow,
                  background: "var(--surface)",
                  opacity: p.showInGrid ? 1 : 0.5,
                }}
                onClick={() => setModal(p)}
              >
                <ProductThumb image={p.image} emoji={p.emoji} name={p.name} size={60} radius={16} previewable />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "calc(15px * var(--device-font-scale, 1))", color: "var(--text)" }}>
                    {p.name}
                    {!p.showInGrid && <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>oculto</span>}
                  </div>
                  {p.soldByWeight && (
                    <span
                      style={{
                        display: "inline-flex",
                        marginTop: "6px",
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
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                    {[p.internalCode, p.barcode, p.supplierName].filter(Boolean).join(" · ") || "Sin codigo extra"}
                  </div>
                  {stockSummary}
                  {stockBadge}
                  {platformSyncBadge}
                  {expiryBadge}
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "4px",
                    justifyItems: "end",
                    alignSelf: "center",
                    flexShrink: 0,
                    minWidth: "96px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "calc(11px * var(--device-font-scale, 1))",
                      fontWeight: 800,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                    }}
                  >
                    Precio
                  </div>
                  <div
                    style={{
                      fontSize: "calc(20px * var(--device-font-scale, 1))",
                      fontWeight: 900,
                      color: "#f8fafc",
                      background: "linear-gradient(180deg, rgba(15,23,42,.96), rgba(30,41,59,.96))",
                      border: "1px solid rgba(148,163,184,.2)",
                      borderRadius: "14px",
                      padding: "9px 12px",
                      boxShadow: "0 10px 22px rgba(2,6,23,.18)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatARS(p.price)}
                  </div>
                </div>
                <span style={{ color: "var(--text-3)" }}>›</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-3)" }}>
              {search ? "Sin resultados" : "Sin productos. ¡Creá el primero!"}
            </div>
          )}
        </div>
      )}


      {/* ─── Floating Bulk Action Bar ────────────────────────────────────── */}
      {selectionMode && (
        <div
          style={{
            position: "fixed",
            bottom: "72px", // above BottomNav
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
            maxWidth: "480px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 500,
          }}
          className="animate-slide-up"
        >
          {/* Counter + Select All */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "15px" }}>
              {selected.size === 0
                ? "Seleccioná productos"
                : `${selected.size} seleccionado${selected.size > 1 ? "s" : ""}`}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={selectAll}
              style={{ fontSize: "13px" }}
            >
              {selected.size === filtered.length ? "Ninguno" : "Todos"}
            </button>
          </div>

          {/* Bulk Actions — shown only when at least 1 is selected */}
          {selected.size > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="btn btn-ghost"
                style={{
                  border: "1px solid var(--border)",
                  fontWeight: 600,
                  flex: 1,
                  fontSize: "14px"
                }}
                onClick={() => setShowBulkCategoryModal(true)}
              >
                🏷️ Asignar Categoría
              </button>

              <button
                className="btn btn-ghost"
                style={{
                  border: "1px solid var(--border)",
                  fontWeight: 700,
                  flex: 1,
                  fontSize: "14px",
                  opacity: canGroupSelected ? 1 : 0.6,
                }}
                onClick={() => setShowBulkVariantGroupModal(true)}
                disabled={!canGroupSelected}
                title={canGroupSelected ? undefined : "Selecciona al menos 2 productos simples para agruparlos como variantes."}
              >
                Agrupar variantes
              </button>

              <button
                className="btn"
                style={{
                  background: confirmingDelete ? "var(--red)" : "rgba(239,68,68,0.12)",
                  color: "var(--red)",
                  border: `1px solid var(--red)`,
                  fontWeight: 700,
                  flex: 1,
                  fontSize: "14px",
                  transition: "background 0.2s",
                }}
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting
                  ? "..."
                  : confirmingDelete
                  ? `⚠️ ¿Confirmar (${selected.size})?`
                  : `🗑 Eliminar (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Category Modal */}
      {showBulkCategoryModal && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => setShowBulkCategoryModal(false)}>
            <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh", padding: "20px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Asignar Categoría</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "20px" }}>
              Seleccioná la categoría para los {selected.size} productos marcados.
            </p>

            <select
              className="input"
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              style={{ width: "100%", marginBottom: "20px", background: "var(--surface)", cursor: "pointer" }}
            >
              <option value="">Sin categoría (Quitar)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowBulkCategoryModal(false)}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleBulkCategorize} disabled={bulking}>
                {bulking ? "Asignando..." : "Confirmar"}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showBulkVariantGroupModal && (
        <BulkVariantGroupModal
          key={selectedProducts.map((product) => product.id).join(":")}
          products={selectedProducts}
          loading={groupingVariants}
          onClose={() => {
            if (!groupingVariants) {
              setShowBulkVariantGroupModal(false);
            }
          }}
          onConfirm={(payload) => void handleBulkGroupVariants(payload)}
        />
      )}

      {showPlatformSyncModal && (
        <PlatformBulkSyncModal
          linkedCount={linkedPlatformProductsCount}
          loading={syncingPlatformCatalog}
          onClose={() => setShowPlatformSyncModal(false)}
          onConfirm={(mode) => void handleBulkPlatformSync(mode)}
        />
      )}

      {showRestockHistoryModal && (
        <ModalPortal>
          <RestockHistoryModal
            branchId={branchId}
            onClose={() => setShowRestockHistoryModal(false)}
          />
        </ModalPortal>
      )}

      {showInventoryValuationModal && (
        <ModalPortal>
          <InventoryValuationModal
            branchId={branchId}
            products={products}
            onClose={() => setShowInventoryValuationModal(false)}
            onSaved={() => {
              setCatalogNotice("Valorizacion manual guardada.");
              void fetchProducts();
            }}
          />
        </ModalPortal>
      )}

      {/* Update Prices Modal */}
      {showUpdateModal && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => setShowUpdateModal(false)}>
            <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85dvh" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Actualizar precios</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px" }}>
              Aplica un % a los {filtered.length} productos filtrados. Los nuevos precios se redondean a los $10.
            </p>
            {pricingMode === "SHARED" && (
              <p style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "-4px" }}>
                Como este kiosco usa precios compartidos, el cambio se replica a todas las sucursales. El stock no se toca.
              </p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="number"
                className="input"
                value={percentStr}
                onChange={(e) => setPercentStr(e.target.value)}
                style={{ flex: 1, fontSize: "24px", fontWeight: 800, textAlign: "center" }}
              />
              <span style={{ fontSize: "24px", fontWeight: 800 }}>%</span>
            </div>

            <div className="separator" style={{ margin: "4px 0" }} />

            <div style={{ overflowY: "auto", maxHeight: "250px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.1em" }}>Vista previa</h3>
              {filtered.slice(0, 10).map((p) => {
                const newPrice = applyPercentage(p.price, percent);
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontWeight: 600 }}>
                      <span style={{ color: "var(--text-3)", textDecoration: "line-through", marginRight: "6px" }}>{formatARS(p.price)}</span>
                      <span style={{ color: "var(--green)" }}>{formatARS(newPrice)}</span>
                    </span>
                  </div>
                );
              })}
              {filtered.length > 10 && (
                <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "12px", paddingTop: "8px" }}>
                  y {filtered.length - 10} más...
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowUpdateModal(false)}>Cancelar</button>
              <button className="btn btn-green" style={{ flex: 2 }} onClick={handleApplyUpdate} disabled={percent === 0 || loading}>
                {loading ? "..." : "Confirmar todos"}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showWelcomeOfferModal && welcomeOffer && (
        <WelcomeSubscriptionOfferModal
          priceArs={welcomeOffer.priceArs}
          freezeEndsAt={welcomeOffer.freezeEndsAt}
          loading={welcomeOfferLoading}
          error={welcomeOfferError}
          onActivate={() => void handleActivateWelcomeOffer()}
          onSkip={() => void dismissWelcomeOffer()}
        />
      )}

      {/* Product Create/Edit Modal */}
      {modal && (
        <ModalPortal>
          <ProductModal
            key={modal === "new" ? "new-product" : `edit-${modal.id}`}
            product={modal === "new" ? null : modal}
            branchId={branchId}
            pricingMode={pricingMode}
            categories={categories}
            onClose={() => setModal(null)}
            onSave={handleProductModalSave}
            onCategoriesChange={setCategories}
            isOwner={Boolean(isOwner)}
            onOpenCorrection={() => {
              const editingId = modal !== "new" && modal?.id ? modal.id : null;
              setModal(null);
              setStockModalPreset({
                initialOperation: "correct",
                spotlightProductId: editingId,
              });
              setShowStockModal(true);
            }}
          />
        </ModalPortal>
      )}

      {/* ─── StockLoadingModal ──────────────────────────────────────────────── */}
      {showStockModal && (() => {
        // Products eligible: all visible (+ those with stock even if hidden)
        const stockProducts = products;
        return (
          <ModalPortal>
            <StockLoadingModal
              products={stockProducts}
              branchId={branchId}
              categories={categories}
              pricingMode={pricingMode}
              isOwner={Boolean(isOwner)}
              onClose={() => {
                setShowStockModal(false);
                setStockModalPreset(null);
              }}
              onSaved={fetchProducts}
              onCategoriesChange={setCategories}
              initialSearch={stockModalPreset?.initialSearch}
              initialOperation={stockModalPreset?.initialOperation}
              spotlightProductId={stockModalPreset?.spotlightProductId}
              entryNote={stockModalPreset?.entryNote}
            />
          </ModalPortal>
        );
      })()}

      {/* ─── ReplicarModal ──────────────────────────────────────────────────── */}
      {showReplicarModal && (
        <ModalPortal>
          <ReplicarModal
            products={selectionMode && selected.size > 0 ? products.filter(p => selected.has(p.id)) : filtered}
            branches={branches.filter(b => b.id !== branchId)}
            pricingMode={pricingMode}
            sourceBranchId={branchId}
            onClose={() => setShowReplicarModal(false)}
            onDone={() => { setShowReplicarModal(false); fetchProducts(); }}
          />
        </ModalPortal>
      )}

      {/* ─── TransferirStockModal ───────────────────────────────────────────── */}
      {showCatalogImportModal && (
        <ModalPortal>
          <CatalogSpreadsheetModal
            branchId={branchId}
            branches={branches}
            pricingMode={pricingMode}
            onClose={() => setShowCatalogImportModal(false)}
            onApplied={(message) => {
              setShowCatalogImportModal(false);
              setCatalogNotice(message);
              void fetchProducts();
            }}
          />
        </ModalPortal>
      )}

      {showTransferirModal && (
        <ModalPortal>
          <TransferirStockModal
            products={selectionMode && selected.size > 0 ? products.filter(p => selected.has(p.id)) : filtered}
            branches={branches.filter(b => b.id !== branchId)}
            sourceBranchId={branchId}
            onClose={() => setShowTransferirModal(false)}
            onDone={() => { setShowTransferirModal(false); fetchProducts(); }}
          />
        </ModalPortal>
      )}
    </div>
    <PrintablePage
      title="Catalogo de productos"
      subtitle={new Date().toLocaleDateString("es-AR")}
      meta={[
        { label: "Items", value: String(filtered.length) },
        { label: "Ocultos", value: String(products.filter((p) => !p.showInGrid).length) },
      ]}
    >
      <section className="print-section">
        <div className="print-section__title">Resumen</div>
        <div className="print-kpis">
          <div className="print-kpi">
            <div className="print-kpi__label">Productos visibles</div>
            <div className="print-kpi__value">
              {products.filter((product) => product.showInGrid).length}
            </div>
            <div className="print-kpi__sub">Disponibles para vender</div>
          </div>
          <div className="print-kpi">
            <div className="print-kpi__label">Filtro actual</div>
            <div className="print-kpi__value">{filtered.length}</div>
            <div className="print-kpi__sub">
              {search ? `Busqueda: "${search}"` : showHidden ? "Incluye ocultos" : "Solo visibles"}
            </div>
          </div>
        </div>
      </section>

      <section className="print-section">
        <div className="print-section__title">Detalle de inventario</div>
        {filtered.length === 0 ? (
          <div className="print-note">No hay productos para imprimir con los filtros actuales.</div>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Codigo / Referencia</th>
                <th>Precio</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const totalStock =
                  product.variants && product.variants.length > 0
                    ? product.variants.reduce((acc, variant) => acc + (variant.stock || 0), 0)
                    : product.stock ?? 0;

                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{product.name}</div>
                      <div style={{ fontSize: "8.5pt", color: "#6b7280" }}>
                        {[product.brand, product.supplierName, product.description].filter(Boolean).join(" · ") ||
                          (product.showInGrid ? "Visible" : "Oculto")}
                      </div>
                    </td>
                    <td>
                      {[product.internalCode, product.barcode, product.presentation].filter(Boolean).join(" · ") || "Sin dato"}
                    </td>
                    <td>{formatARS(product.price)}</td>
                    <td>{formatStockQuantity(totalStock, product.soldByWeight) || "0"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </PrintablePage>
    </>
  );
}
