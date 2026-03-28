import * as XLSX from "xlsx";

export const CATALOG_PRODUCTS_SHEET = "Productos";
export const CATALOG_LOTS_SHEET = "Lotes";
export const CATALOG_INFO_SHEET = "Info";

export const CATALOG_IMPORT_SCOPES = [
  "everything",
  "catalog",
  "pricing",
  "stock",
  "display",
  "lots",
] as const;

export const CATALOG_IMPORT_MODES = [
  "upsert",
  "only_existing",
  "overwrite_existing",
] as const;

export type CatalogImportScope = (typeof CATALOG_IMPORT_SCOPES)[number];
export type CatalogImportMode = (typeof CATALOG_IMPORT_MODES)[number];

export type SpreadsheetProductRow = {
  rowNumber: number;
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  barcode: string | null;
  internalCode: string | null;
  category: string | null;
  brand: string | null;
  presentation: string | null;
  description: string | null;
  supplierName: string | null;
  notes: string | null;
  emoji: string | null;
  image: string | null;
  showInGrid: boolean | null;
  price: number | null;
  cost: number | null;
  stock: number | null;
  minStock: number | null;
};

export type SpreadsheetLotRow = {
  rowNumber: number;
  productId: string | null;
  variantId: string | null;
  barcode: string | null;
  internalCode: string | null;
  name: string | null;
  variantName: string | null;
  expiresOn: string | null;
  quantity: number | null;
};

type ExportProductRow = Omit<SpreadsheetProductRow, "rowNumber">;
type ExportLotRow = Omit<SpreadsheetLotRow, "rowNumber">;

const PRODUCT_HEADERS = [
  "productId",
  "variantId",
  "nombre",
  "variante",
  "barcode",
  "internalCode",
  "categoria",
  "marca",
  "presentacion",
  "descripcion",
  "proveedor",
  "notas",
  "emoji",
  "imagen",
  "mostrarEnCaja",
  "precio",
  "costo",
  "stock",
  "stockMin",
] as const;

const LOT_HEADERS = [
  "productId",
  "variantId",
  "barcode",
  "internalCode",
  "nombre",
  "variante",
  "expiresOn",
  "cantidad",
] as const;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function getRequiredString(value: unknown) {
  return String(value ?? "").trim();
}

function getNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized =
    typeof value === "string"
      ? Number(value.replace(/\./g, "").replace(",", ".").trim())
      : Number(value);

  return Number.isFinite(normalized) ? normalized : null;
}

function getInteger(value: unknown) {
  const numeric = getNumber(value);
  return numeric !== null && Number.isInteger(numeric) ? numeric : null;
}

function getBoolean(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "si", "sí", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function mapRowByHeader(
  sheetRows: unknown[][],
  expectedHeaders: readonly string[],
) {
  if (sheetRows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = sheetRows;
  const columnIndexByHeader = new Map<string, number>();

  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) {
      columnIndexByHeader.set(normalized, index);
    }
  });

  return dataRows.map((row, rowIndex) => {
    const record = new Map<string, unknown>();
    for (const header of expectedHeaders) {
      const columnIndex = columnIndexByHeader.get(normalizeHeader(header));
      record.set(header, columnIndex === undefined ? null : row[columnIndex]);
    }
    return {
      rowNumber: rowIndex + 2,
      record,
    };
  });
}

export function isCatalogImportScope(value: unknown): value is CatalogImportScope {
  return typeof value === "string" && CATALOG_IMPORT_SCOPES.includes(value as CatalogImportScope);
}

export function isCatalogImportMode(value: unknown): value is CatalogImportMode {
  return typeof value === "string" && CATALOG_IMPORT_MODES.includes(value as CatalogImportMode);
}

export function buildCatalogWorkbook(input: {
  branchName: string;
  generatedAt: Date;
  pricingMode: "SHARED" | "BRANCH";
  productRows: ExportProductRow[];
  lotRows: ExportLotRow[];
}) {
  const workbook = XLSX.utils.book_new();

  const infoRows = [
    ["Kiosco24", "Plantilla de catalogo"],
    ["Sucursal origen", input.branchName],
    ["Generado", input.generatedAt.toISOString()],
    ["Modo de precios", input.pricingMode],
    ["Importacion", "Edita la hoja Productos y, si hace falta, la hoja Lotes."],
  ];

  const productSheetData = [
    [...PRODUCT_HEADERS],
    ...input.productRows.map((row) => [
      row.productId,
      row.variantId,
      row.name,
      row.variantName,
      row.barcode,
      row.internalCode,
      row.category,
      row.brand,
      row.presentation,
      row.description,
      row.supplierName,
      row.notes,
      row.emoji,
      row.image,
      row.showInGrid,
      row.price,
      row.cost,
      row.stock,
      row.minStock,
    ]),
  ];

  const lotSheetData = [
    [...LOT_HEADERS],
    ...input.lotRows.map((row) => [
      row.productId,
      row.variantId,
      row.barcode,
      row.internalCode,
      row.name,
      row.variantName,
      row.expiresOn,
      row.quantity,
    ]),
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(infoRows), CATALOG_INFO_SHEET);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(productSheetData), CATALOG_PRODUCTS_SHEET);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(lotSheetData), CATALOG_LOTS_SHEET);

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function parseCatalogWorkbook(buffer: Buffer | ArrayBuffer | Uint8Array) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const productsSheet = workbook.Sheets[CATALOG_PRODUCTS_SHEET] ?? workbook.Sheets[workbook.SheetNames[0]];
  const lotsSheet = workbook.Sheets[CATALOG_LOTS_SHEET];

  if (!productsSheet) {
    return {
      productRows: [] as SpreadsheetProductRow[],
      lotRows: [] as SpreadsheetLotRow[],
      errors: ["El archivo no trae una hoja de Productos."],
    };
  }

  const productSheetRows = XLSX.utils.sheet_to_json(productsSheet, {
    header: 1,
    raw: false,
    defval: null,
  }) as unknown[][];
  const mappedProductRows = mapRowByHeader(productSheetRows, PRODUCT_HEADERS);
  const productRows: SpreadsheetProductRow[] = [];
  const errors: string[] = [];

  for (const row of mappedProductRows) {
    const name = getRequiredString(row.record.get("nombre"));
    const variantName = getString(row.record.get("variante"));

    if (!name) {
      continue;
    }

    productRows.push({
      rowNumber: row.rowNumber,
      productId: getString(row.record.get("productId")),
      variantId: getString(row.record.get("variantId")),
      name,
      variantName,
      barcode: getString(row.record.get("barcode")),
      internalCode: getString(row.record.get("internalCode")),
      category: getString(row.record.get("categoria")),
      brand: getString(row.record.get("marca")),
      presentation: getString(row.record.get("presentacion")),
      description: getString(row.record.get("descripcion")),
      supplierName: getString(row.record.get("proveedor")),
      notes: getString(row.record.get("notas")),
      emoji: getString(row.record.get("emoji")),
      image: getString(row.record.get("imagen")),
      showInGrid: getBoolean(row.record.get("mostrarEnCaja")),
      price: getNumber(row.record.get("precio")),
      cost: getNumber(row.record.get("costo")),
      stock: getInteger(row.record.get("stock")),
      minStock: getInteger(row.record.get("stockMin")),
    });
  }

  const lotRows: SpreadsheetLotRow[] = [];
  if (lotsSheet) {
    const lotSheetRows = XLSX.utils.sheet_to_json(lotsSheet, {
      header: 1,
      raw: false,
      defval: null,
    }) as unknown[][];
    const mappedLotRows = mapRowByHeader(lotSheetRows, LOT_HEADERS);

    for (const row of mappedLotRows) {
      const expiresOn = getString(row.record.get("expiresOn"));
      const quantity = getInteger(row.record.get("cantidad"));
      const hasIdentity =
        Boolean(getString(row.record.get("productId"))) ||
        Boolean(getString(row.record.get("variantId"))) ||
        Boolean(getString(row.record.get("barcode"))) ||
        Boolean(getString(row.record.get("internalCode"))) ||
        Boolean(getString(row.record.get("nombre")));

      if (!hasIdentity || !expiresOn || quantity === null) {
        continue;
      }

      lotRows.push({
        rowNumber: row.rowNumber,
        productId: getString(row.record.get("productId")),
        variantId: getString(row.record.get("variantId")),
        barcode: getString(row.record.get("barcode")),
        internalCode: getString(row.record.get("internalCode")),
        name: getString(row.record.get("nombre")),
        variantName: getString(row.record.get("variante")),
        expiresOn,
        quantity,
      });
    }
  }

  if (productRows.length === 0) {
    errors.push("La hoja Productos no tiene filas validas.");
  }

  return { productRows, lotRows, errors };
}
