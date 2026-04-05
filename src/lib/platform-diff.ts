import { type PlatformDraftChangeField } from "./platform-catalog";
import { DEFAULT_BUSINESS_ACTIVITY_CODE } from "./business-activities";

export const platformChangeLabels: Record<PlatformDraftChangeField, string> = {
  barcode: "Codigo de barras",
  businessActivity: "Rubro",
  name: "Nombre",
  brand: "Marca",
  categoryName: "Categoria",
  description: "Descripcion",
  presentation: "Presentacion",
  image: "Imagen",
  variants: "Variantes",
};

export interface ComparisonProduct {
  id: string;
  barcode: string | null;
  businessActivity: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  variants: Array<{ id?: string; name: string; barcode: string | null }>;
}

export interface PlatformDraft {
  barcode: string | null;
  businessActivity: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  variants: Array<{ name: string; barcode: string | null }>;
}

export interface DiffRow {
  field: PlatformDraftChangeField;
  label: string;
  current: string;
  next: string;
}

export function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formatDiffValue(value?: string | null, emptyLabel = "Sin dato") {
  const normalized = cleanText(value);
  return normalized ?? emptyLabel;
}

export function formatVariantDiffValue(
  variants?: Array<{
    name: string;
    barcode: string | null;
  }> | null,
) {
  if (!variants || variants.length === 0) {
    return "Sin variantes";
  }

  return variants
    .map((variant) => `${variant.name}${variant.barcode ? ` | ${variant.barcode}` : ""}`)
    .join(" · ");
}
