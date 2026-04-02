// Tipos compartidos para la configuración

export interface Employee {
  id: string;
  name: string;
  role: "CASHIER" | "MANAGER";
  branches: { id: string; name: string }[];
  hasPin: boolean;
  active: boolean;
  suspendedUntil: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  showInGrid?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
  allowNegativeStock: boolean;
  mpUserId: string | null;
  mpStoreId: string | null;
  mpPosId: string | null;
  accessKey: string | null;
}

export type PricingMode = "SHARED" | "BRANCH";
export type FiscalEnvironment = "TEST" | "PROD";
export type TicketPrintMode = "STANDARD" | "THERMAL_58" | "THERMAL_80";

export interface Subscription {
  status: string;
  managementUrl: string | null;
}
