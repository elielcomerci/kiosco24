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
 * Get today's date range (start/end) for DB queries
 */
export function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
 * Convert Hex color to RGB string (e.g., "34, 197, 94")
 */
export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
