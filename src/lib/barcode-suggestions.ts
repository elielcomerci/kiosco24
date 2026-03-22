export interface BarcodeSuggestionVariant {
  name: string;
  barcode: string | null;
}

export interface BarcodeSuggestion {
  code: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  variants?: BarcodeSuggestionVariant[];
}

export interface BarcodeLookupResponse {
  found: boolean;
  suggestion: BarcodeSuggestion | null;
}

export function normalizeBarcodeCode(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function canLookupBarcode(value: string) {
  return /^\d{8,14}$/.test(value);
}
