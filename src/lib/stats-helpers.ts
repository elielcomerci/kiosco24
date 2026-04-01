import { todayART } from "@/lib/utils";

export type Periodo = "dia" | "semana" | "mes";

export const PERIODO_LABEL: Record<Periodo, string> = {
  dia: "Hoy",
  semana: "Esta semana",
  mes: "Este mes",
};

export const METODO_LABEL: Record<string, string> = {
  CASH: "💵 Efectivo",
  MERCADOPAGO: "📱 MercadoPago",
  TRANSFER: "🏦 Transferencia",
  DEBIT: "💳 Débito",
  CREDIT_CARD: "🏧 Tarjeta",
  CREDIT: "📋 Fiado",
};

export const GASTO_LABEL: Record<string, string> = {
  ICE: "🧊 Hielo",
  MERCHANDISE: "📦 Mercadería",
  DELIVERY: "🚚 Delivery",
  OTHER: "💸 Otros",
};

export const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function getNavLabel(periodo: Periodo, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  if (periodo === "mes") {
    const month = dateObj.toLocaleDateString("es-AR", { month: "long" });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`;
  }
  if (periodo === "semana") {
    const dow = dateObj.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const mon = new Date(dateObj);
    mon.setDate(dateObj.getDate() - daysFromMonday);
    return `Semana del ${mon.getDate()} ${mon.toLocaleDateString("es-AR", { month: "short" })}`;
  }
  return dateObj.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

export function offsetDate(iso: string, periodo: Periodo, dir: 1 | -1): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  if (periodo === "dia") {
    dateObj.setDate(dateObj.getDate() + 1 * dir);
  } else if (periodo === "semana") {
    dateObj.setDate(dateObj.getDate() + 7 * dir);
  } else if (periodo === "mes") {
    dateObj.setMonth(dateObj.getMonth() + 1 * dir);
  }

  const yy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function getPeriodRange(periodo: Periodo, today: string): { from: string; to: string } {
  if (periodo === "dia") {
    return { from: `${today}T00:00:00-03:00`, to: `${today}T23:59:59.999-03:00` };
  }
  if (periodo === "semana") {
    const d = new Date(`${today}T12:00:00-03:00`);
    const dow = d.getDay();
    const daysBack = dow === 0 ? 6 : dow - 1;
    const mon = new Date(d);
    mon.setDate(d.getDate() - daysBack);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
    return {
      from: `${fmt(mon)}T00:00:00-03:00`,
      to: `${fmt(sun)}T23:59:59.999-03:00`,
    };
  }
  const [y, mo] = today.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return {
    from: `${y}-${String(mo).padStart(2, "0")}-01T00:00:00-03:00`,
    to: `${y}-${String(mo).padStart(2, "0")}-${lastDay}T23:59:59.999-03:00`,
  };
}

export function buildChartData(
  data: {
    ventasPorDia: { fecha: string; ventas: number; ganancia: number | null }[];
    ventasPorSemana: { semana: number; ventas: number; ganancia: number | null }[] | null;
  } | null,
  periodo: Periodo
): { label: string; ventas: number; ganancia: number }[] {
  if (!data) return [];
  if (periodo === "mes" && data.ventasPorSemana) {
    return data.ventasPorSemana.map((w) => ({
      label: `S${w.semana}`,
      ventas: w.ventas,
      ganancia: w.ganancia ?? 0,
    }));
  }
  return data.ventasPorDia.map((d) => {
    const dt = new Date(`${d.fecha}T12:00:00-03:00`);
    const dow = dt.getDay();
    const labelIdx = dow === 0 ? 6 : dow - 1;
    return {
      label: periodo === "semana" ? DAY_LABELS[labelIdx] : String(dt.getDate()),
      ventas: d.ventas,
      ganancia: d.ganancia ?? 0,
    };
  });
}

export function getTrend(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null) return null;
  if (prev === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export function isCurrentPeriod(periodo: Periodo, currentDate: string, today: string): boolean {
  if (periodo === "dia") return currentDate === today;
  const nextOffset = offsetDate(currentDate, periodo, 1);
  return nextOffset > today;
}
