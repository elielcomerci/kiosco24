/**
 * Format a number as Argentine pesos
 */
export function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Argentina timezone offset string (UTC-3, no DST)
 */
const ART_OFFSET = "-03:00";

/**
 * Get an ISO date string (YYYY-MM-DD) for today in Argentina time.
 */
export function todayART(): string {
  // Use Intl to get the local date components in ART
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Build a { start, end } range for a given YYYY-MM-DD date in ART (UTC-3).
 * The resulting Date objects are in UTC (what Prisma/DB expects).
 */
export function artDayRange(isoDate: string): { start: Date; end: Date } {
  const start = new Date(`${isoDate}T00:00:00${ART_OFFSET}`);
  const end = new Date(`${isoDate}T23:59:59.999${ART_OFFSET}`);
  return { start, end };
}

/**
 * Get today's date range (start/end) for DB queries — always in ART (UTC-3).
 */
export function todayRange() {
  return artDayRange(todayART());
}

/**
 * Round to nearest 10 (for price updates)
 */
export function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * Apply percentage increase and round to nearest 10
 */
export function applyPercentage(price: number, pct: number): number {
  return roundToTen(price * (1 + pct / 100));
}

/**
 * Sugerencias de montos en efectivo para cobrar rápido.
 *
 * Regla general:
 * - Si el total es 0 o negativo, no sugerimos nada.
 * - Tomamos el orden de magnitud del total y generamos tres \"escalones\":
 *   - Mínimo: redondeo hacia arriba al múltiplo más cercano de un paso base.
 *   - Medio: siguiente múltiplo de 2 * paso base.
 *   - Alto: siguiente múltiplo de 5 * paso base.
 *
 * Ejemplos aproximados:
 * - total = 6.900  →  [7.000, 10.000, 20.000]
 * - total = 1.250  →  [1.300, 1.500, 2.000]
 * - total = 95     →  [100, 200, 500]
 */
export function getCashSuggestions(total: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];

  const absTotal = Math.abs(total);
  const magnitude = Math.pow(10, Math.max(1, Math.floor(Math.log10(absTotal)))); // 100, 1.000, 10.000, etc.
  const baseStep = magnitude / 10; // un escalón más fino que el billete \"grande\"

  const roundUpTo = (step: number) => Math.ceil(total / step) * step;

  const s1 = roundUpTo(baseStep);        // redondeo mínimo
  const s2 = roundUpTo(2 * baseStep);    // un escalón más arriba
  const s3 = roundUpTo(5 * baseStep);    // escalón \"alto\"

  // Limpiar duplicados y ordenar ascendente
  const unique = Array.from(new Set([s1, s2, s3])).filter((v) => v >= total);
  unique.sort((a, b) => a - b);

  return unique;
}

/**
 * Convert Hex color to RGB string (e.g., "34, 197, 94")
 */
export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
