const LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "los", "y", "en", "con", "sin", "para", "por"]);
const LOWERCASE_UNITS = new Set(["ml", "l", "cc", "g", "gr", "kg", "u", "un"]);

export function normalizeTextSpacing(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatCatalogWord(word: string, index: number): string {
  const clean = word.trim();
  if (!clean) {
    return clean;
  }

  if (/\d/.test(clean)) {
    return clean;
  }

  if (clean.includes("/")) {
    return clean
      .split("/")
      .map((chunk, chunkIndex) => formatCatalogWord(chunk, index === 0 && chunkIndex === 0 ? 0 : 1))
      .join("/");
  }

  if (clean.includes("-")) {
    return clean
      .split("-")
      .map((chunk, chunkIndex) => formatCatalogWord(chunk, index === 0 && chunkIndex === 0 ? 0 : 1))
      .join("-");
  }

  const lower = clean.toLocaleLowerCase("es-AR");
  if (LOWERCASE_UNITS.has(lower)) {
    return lower;
  }

  if (clean === clean.toUpperCase() && clean.length <= 4) {
    return clean.toUpperCase();
  }

  if (index > 0 && LOWERCASE_WORDS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function smartTitleCase(value: string) {
  return normalizeTextSpacing(value)
    .split(" ")
    .map((word, index) => formatCatalogWord(word, index))
    .join(" ");
}

export function normalizeCatalogTitle(value: unknown) {
  return typeof value === "string" ? smartTitleCase(value) : "";
}

export function normalizeCatalogOptionalTitle(value: unknown) {
  const normalized = typeof value === "string" ? smartTitleCase(value) : "";
  return normalized || null;
}

export function normalizeCatalogDescription(value: unknown) {
  const normalized = typeof value === "string" ? normalizeTextSpacing(value) : "";
  return normalized || null;
}

export function normalizeCatalogBarcode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
