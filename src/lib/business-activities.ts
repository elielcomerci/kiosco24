export type BusinessActivityOption = {
  value: string;
  label: string;
  description: string;
  seedDefaultCatalog: boolean;
  isActive: boolean;
  sortOrder: number;
};

export const DEFAULT_BUSINESS_ACTIVITY_CODE = "KIOSCO";

export const BUSINESS_ACTIVITY_OPTIONS: BusinessActivityOption[] = [
  {
    value: "KIOSCO",
    label: "Kiosco",
    description: "Venta rapida, impulso y operacion de caja continua.",
    seedDefaultCatalog: true,
    isActive: true,
    sortOrder: 10,
  },
  {
    value: "MAXIKIOSCO",
    label: "Maxikiosco",
    description: "Mas surtido, mas categorias y operacion extendida.",
    seedDefaultCatalog: true,
    isActive: true,
    sortOrder: 20,
  },
  {
    value: "ALMACEN",
    label: "Almacen / Despensa",
    description: "Consumo diario, reposicion frecuente y precios por volumen.",
    seedDefaultCatalog: true,
    isActive: true,
    sortOrder: 30,
  },
  {
    value: "CAFETERIA",
    label: "Cafeteria",
    description: "Mostrador, combos y venta de elaborados.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 40,
  },
  {
    value: "PANADERIA",
    label: "Panaderia",
    description: "Productos frescos, produccion diaria y rotacion alta.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 50,
  },
  {
    value: "VERDULERIA",
    label: "Verduleria",
    description: "Pesables, perecederos y stock vivo.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 60,
  },
  {
    value: "ROTISERIA",
    label: "Rotiseria",
    description: "Preparados, take away y venta por mostrador.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 70,
  },
  {
    value: "FARMACIA",
    label: "Farmacia",
    description: "Catalogo amplio, control fino y atencion asistida.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 80,
  },
  {
    value: "PETSHOP",
    label: "Pet shop",
    description: "Alimentos, accesorios y reposicion por marca.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 90,
  },
  {
    value: "LIBRERIA",
    label: "Libreria",
    description: "Papeleria, escolares y productos de temporada.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 100,
  },
  {
    value: "INDUMENTARIA",
    label: "Indumentaria",
    description: "Talles, variantes y catalogo visual.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 110,
  },
  {
    value: "FERRETERIA",
    label: "Ferreteria",
    description: "SKU numeroso, asistencia en mostrador y stock tecnico.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 120,
  },
  {
    value: "OTRO",
    label: "Otro",
    description: "Arranca con estructura limpia y lo adaptamos despues.",
    seedDefaultCatalog: false,
    isActive: true,
    sortOrder: 130,
  },
] as const;

const BUSINESS_ACTIVITY_BY_VALUE = new Map(
  BUSINESS_ACTIVITY_OPTIONS.map((option) => [option.value, option]),
);

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeBusinessActivityCode(
  value: unknown,
  fallback = DEFAULT_BUSINESS_ACTIVITY_CODE,
) {
  const raw = cleanText(typeof value === "string" ? value : null);
  if (!raw) {
    return fallback;
  }

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();

  return normalized || fallback;
}

export function getBusinessActivityOption(value: string | null | undefined) {
  if (!value) return null;
  return BUSINESS_ACTIVITY_BY_VALUE.get(normalizeBusinessActivityCode(value, "")) ?? null;
}

export function getBusinessActivityOptionFromList(
  options: BusinessActivityOption[],
  value: string | null | undefined,
) {
  if (!value) return null;
  const normalizedValue = normalizeBusinessActivityCode(value, "");
  return options.find((option) => option.value === normalizedValue) ?? null;
}

export function getBusinessActivityLabel(
  value: string | null | undefined,
  options?: BusinessActivityOption[],
) {
  const fromList = options ? getBusinessActivityOptionFromList(options, value) : null;
  if (fromList) {
    return fromList.label;
  }

  const fallback = getBusinessActivityOption(value);
  return fallback?.label ?? value ?? DEFAULT_BUSINESS_ACTIVITY_CODE;
}
