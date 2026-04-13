/**
 * Shared pricing constants for calculators and commission calculations.
 * All values come from the single source of truth: the subscription price.
 */

import { SUBSCRIPTION_PRICE_ARS } from "./subscription-plan";

/** Subscription list price (default $14.900 or env override). */
export const LIST_PRICE = SUBSCRIPTION_PRICE_ARS;

/**
 * MercadoPago net amount credited after all deductions (6.29% fee + retenciones + IVA).
 * Observed from a real $14.900 subscription: MP credits $13.709,98 (keeps $1.190,02).
 */
export const MP_NETO = 13709.98;

/** MercadoPago effective fee (list price minus what MP credits). */
export const MP_FEE = LIST_PRICE - MP_NETO;

/** Comisión del vendedor sobre la primera factura (50% del precio de lista). */
export const COMM_FIRST_PCT = 0.50;

/** Comisión del vendedor sobre facturas recurrentes (30% del precio de lista). */
export const COMM_RECUR_PCT = 0.30;

/** Monto en pesos de la comisión primera factura. */
export const COMM_FIRST_AMT = Math.round(LIST_PRICE * COMM_FIRST_PCT);

/** Monto en pesos de la comisión recurrente. */
export const COMM_RECUR_AMT = Math.round(LIST_PRICE * COMM_RECUR_PCT);

/** Ganancia neta del negocio en el mes 1 (por cliente). */
export const NET_MONTH1 = MP_NETO - COMM_FIRST_AMT;

/** Ganancia neta del negocio en meses 2+ (por cliente recurrente). */
export const NET_RECUR = MP_NETO - COMM_RECUR_AMT;

/** Formatting helper: "$14.900" */
export function formatArs(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("es-AR");
}
