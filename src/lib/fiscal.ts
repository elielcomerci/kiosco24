export type FiscalEnvironmentValue = "TEST" | "PROD";
export type FiscalVatConditionValue = "MONOTRIBUTO" | "RESP_INSCRIPTO";
type PaymentMethodValue = "CASH" | "MERCADOPAGO" | "TRANSFER" | "DEBIT" | "CREDIT_CARD" | "CREDIT";

export const AFIP_INVOICE_TYPES = {
  FACTURA_C: 11,
} as const;

export const AFIP_DOCUMENT_TYPES = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

export const AFIP_RECEIVER_IVA_CONDITIONS = {
  RESPONSABLE_INSCRIPTO: { id: 1, label: "Responsable Inscripto" },
  MONOTRIBUTO: { id: 6, label: "Monotributista" },
  EXENTO: { id: 4, label: "IVA Exento" },
  CONSUMIDOR_FINAL: { id: 5, label: "Consumidor Final" },
} as const;

export type ReceiverDocumentType = (typeof AFIP_DOCUMENT_TYPES)[keyof typeof AFIP_DOCUMENT_TYPES];

export type ReceiverIvaCondition = {
  id: number;
  label: string;
};

export type FiscalEmitterSnapshot = {
  cuit: string;
  razonSocial: string;
  domicilioFiscal: string;
  condicionIva: FiscalVatConditionValue;
  inicioActividad: string;
  ingresosBrutos: string | null;
  environment: FiscalEnvironmentValue;
};

type FiscalProfileLike = {
  cuit: string;
  razonSocial: string;
  domicilioFiscal: string;
  condicionIva: FiscalVatConditionValue;
  inicioActividad: string;
  ingresosBrutos: string | null;
  environment: FiscalEnvironmentValue;
};

export function normalizeDocNumber(input: string | number) {
  return String(input ?? "").replace(/\D+/g, "");
}

export function isValidDni(value: string | number) {
  const normalized = normalizeDocNumber(value);
  return normalized.length >= 7 && normalized.length <= 8;
}

export function isValidCuit(value: string | number) {
  const normalized = normalizeDocNumber(value);
  if (normalized.length !== 11) return false;

  const digits = normalized.split("").map((digit) => Number(digit));
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const checksum = digits
    .slice(0, 10)
    .reduce((sum, digit, index) => sum + digit * multipliers[index], 0);
  const mod = 11 - (checksum % 11);
  const verifier = mod === 11 ? 0 : mod === 10 ? 9 : mod;

  return verifier === digits[10];
}

export function validateReceiverDocument(docType: number, docNro: string | number) {
  const normalized = normalizeDocNumber(docNro);

  if (docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL) {
    return { valid: normalized === "0" || normalized === "", normalized: "0", error: null as string | null };
  }

  if (docType === AFIP_DOCUMENT_TYPES.DNI) {
    return {
      valid: isValidDni(normalized),
      normalized,
      error: isValidDni(normalized) ? null : "El DNI debe tener 7 u 8 digitos.",
    };
  }

  if (docType === AFIP_DOCUMENT_TYPES.CUIT) {
    return {
      valid: isValidCuit(normalized),
      normalized,
      error: isValidCuit(normalized) ? null : "El CUIT no es valido.",
    };
  }

  return { valid: false, normalized, error: "Tipo de documento invalido." };
}

export function getReceiverIvaConditionOption(key: keyof typeof AFIP_RECEIVER_IVA_CONDITIONS) {
  return AFIP_RECEIVER_IVA_CONDITIONS[key];
}

export function resolveReceiverDefaults(docType: number, requestedConditionId?: number | null) {
  if (docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL || docType === AFIP_DOCUMENT_TYPES.DNI) {
    return AFIP_RECEIVER_IVA_CONDITIONS.CONSUMIDOR_FINAL;
  }

  const match = Object.values(AFIP_RECEIVER_IVA_CONDITIONS).find((condition) => condition.id === requestedConditionId);
  return match ?? AFIP_RECEIVER_IVA_CONDITIONS.MONOTRIBUTO;
}

export function getReceiverName(docType: number, receiverName?: string | null) {
  const trimmed = receiverName?.trim();
  if (trimmed) return trimmed.slice(0, 120);
  if (docType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL || docType === AFIP_DOCUMENT_TYPES.DNI) {
    return "Consumidor Final";
  }
  return "Receptor";
}

export function getAfipDateNumber(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return Number(`${year}${month}${day}`);
}

export function parseAfipDate(value: string | null | undefined) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  if (/^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  return null;
}

export function formatDateForHuman(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function buildEmitterSnapshot(profile: FiscalProfileLike): FiscalEmitterSnapshot {
  return {
    cuit: profile.cuit,
    razonSocial: profile.razonSocial,
    domicilioFiscal: profile.domicilioFiscal,
    condicionIva: profile.condicionIva,
    inicioActividad: profile.inicioActividad,
    ingresosBrutos: profile.ingresosBrutos ?? null,
    environment: profile.environment,
  };
}

export function parseEmitterSnapshot(value: unknown): FiscalEmitterSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  if (
    typeof source.cuit !== "string" ||
    typeof source.razonSocial !== "string" ||
    typeof source.domicilioFiscal !== "string" ||
    typeof source.inicioActividad !== "string"
  ) {
    return null;
  }

  const condition =
    source.condicionIva === "RESP_INSCRIPTO"
      ? "RESP_INSCRIPTO"
      : "MONOTRIBUTO";
  const environment = source.environment === "PROD" ? "PROD" : "TEST";

  return {
    cuit: source.cuit,
    razonSocial: source.razonSocial,
    domicilioFiscal: source.domicilioFiscal,
    condicionIva: condition,
    inicioActividad: source.inicioActividad,
    ingresosBrutos: typeof source.ingresosBrutos === "string" ? source.ingresosBrutos : null,
    environment,
  };
}

export function getInvoiceTypeLabel(comprobanteTipo: number | null | undefined) {
  if (comprobanteTipo === AFIP_INVOICE_TYPES.FACTURA_C) {
    return "Factura C";
  }

  return "Factura";
}

export function formatFiscalVoucherNumber(pointOfSale: number | null | undefined, voucherNumber: number | null | undefined) {
  if (!Number.isInteger(pointOfSale) || !Number.isInteger(voucherNumber)) {
    return null;
  }

  return `${String(pointOfSale).padStart(5, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

export function getSaleConditionLabel(paymentMethod: PaymentMethodValue | string) {
  switch (paymentMethod) {
    case "CASH":
      return "Contado";
    case "CREDIT":
      return "Cuenta corriente";
    default:
      return "Contado";
  }
}

export function getEmitterIvaLabel(condition: FiscalVatConditionValue) {
  return condition === "RESP_INSCRIPTO" ? "Responsable Inscripto" : "Monotributo";
}
