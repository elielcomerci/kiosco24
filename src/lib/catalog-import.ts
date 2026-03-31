import "server-only";

import {
  buildCatalogWorkbook,
  parseCatalogWorkbook,
  type CatalogImportMode,
  type CatalogImportScope,
  type SpreadsheetLotRow,
  type SpreadsheetProductRow,
} from "@/lib/catalog-spreadsheet";
import {
  dateToKey,
  normalizeLotInputs,
  replaceTrackedLots,
  type NormalizedLotInput,
} from "@/lib/inventory-expiry";
import { applyInventoryCorrectionToCostLayers } from "@/lib/inventory-cost-consumption";
import { DEFAULT_PRICING_MODE, syncSharedPricingFromBranch } from "@/lib/pricing-mode";
import { Prisma, prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient | typeof prisma;

type ExportableProduct = Prisma.ProductGetPayload<{
  include: {
    category: {
      select: {
        name: true;
      };
    };
    inventory: {
      select: {
        branchId: true;
        price: true;
        cost: true;
        stock: true;
        minStock: true;
        showInGrid: true;
      };
    };
    variants: {
      include: {
        inventory: {
          select: {
            branchId: true;
            stock: true;
            minStock: true;
          };
        };
      };
    };
  };
}>;

type ImportableProduct = Prisma.ProductGetPayload<{
  include: {
    category: {
      select: {
        id: true;
        name: true;
      };
    };
    inventory: {
      select: {
        id: true;
        branchId: true;
        price: true;
        cost: true;
        stock: true;
        minStock: true;
        showInGrid: true;
      };
    };
    variants: {
      include: {
        inventory: {
          select: {
            id: true;
            branchId: true;
            stock: true;
            minStock: true;
            cost: true;
            price: true;
          };
        };
      };
    };
  };
}>;

type ImportableBranch = {
  id: string;
  name: string;
};

type ImportableCategory = {
  id: string;
  name: string;
};

type ExistingVariantRef = ImportableProduct["variants"][number];

type OwnerPlan = {
  key: string;
  type: "base" | "variant";
  label: string;
  row: SpreadsheetProductRow;
  variant: ExistingVariantRef | null;
  currentStock: number;
  currentMinStock: number;
  currentTrackedQuantity: number;
  importedLots: NormalizedLotInput[];
};

type ProductPlan = {
  key: string;
  action: "update" | "skip";
  product: ImportableProduct | null;
  rows: SpreadsheetProductRow[];
  owners: OwnerPlan[];
  displayName: string;
  hasVariants: boolean;
  inventoryExists: boolean;
  inventoryWillBeCreated: boolean;
  variantInventoryCreates: number;
  variantInventoryUpdates: number;
  warnings: string[];
  errors: string[];
  productFields: {
    name: string;
    barcode: string | null;
    internalCode: string | null;
    categoryName: string | null;
    brand: string | null;
    description: string | null;
    presentation: string | null;
    supplierName: string | null;
    notes: string | null;
    emoji: string | null;
    image: string | null;
  };
  price: number | null;
  cost: number | null;
  showInGrid: boolean | null;
};

export type CatalogImportPreviewItem = {
  key: string;
  name: string;
  action: "update" | "skip";
  detail: string;
  lotCount: number;
};

export type CatalogImportPreview = {
  branchId: string;
  branchName: string;
  pricingMode: "SHARED" | "BRANCH";
  scope: CatalogImportScope;
  mode: CatalogImportMode;
  summary: {
    productRows: number;
    lotRows: number;
    matchedProducts: number;
    skippedProducts: number;
    inventoryCreates: number;
    inventoryUpdates: number;
    variantInventoryCreates: number;
    variantInventoryUpdates: number;
    lotOwners: number;
  };
  items: CatalogImportPreviewItem[];
  errors: string[];
  warnings: string[];
};

export type CatalogImportApplyResult = {
  branchId: string;
  branchName: string;
  pricingMode: "SHARED" | "BRANCH";
  scope: CatalogImportScope;
  mode: CatalogImportMode;
  appliedProducts: number;
  inventoryCreates: number;
  inventoryUpdates: number;
  variantInventoryCreates: number;
  variantInventoryUpdates: number;
  lotOwners: number;
  warnings: string[];
};

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function toIntOrDefault(value: number | null, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function productGroupKey(row: SpreadsheetProductRow) {
  if (row.productId) {
    return `product:${row.productId}`;
  }
  if (row.internalCode) {
    return `code:${normalizeKey(row.internalCode)}`;
  }
  return `name:${normalizeKey(row.name)}`;
}

function ownerLotKey(productId: string, variantId?: string | null) {
  return variantId ? `variant:${variantId}` : `product:${productId}`;
}

function rowHasVariant(row: SpreadsheetProductRow) {
  return Boolean(row.variantId) || Boolean(normalizeText(row.variantName));
}

function stringsEqual(left: string | null, right: string | null) {
  return normalizeText(left) === normalizeText(right);
}

function numbersEqual(left: number | null, right: number | null) {
  return left === right;
}

function booleansEqual(left: boolean | null, right: boolean | null) {
  return left === right;
}

function collectConsistentValue<T>(
  rows: SpreadsheetProductRow[],
  picker: (row: SpreadsheetProductRow) => T,
  equals: (left: T, right: T) => boolean,
  label: string,
  errors: string[],
) {
  const first = picker(rows[0]);
  for (const row of rows.slice(1)) {
    if (!equals(first, picker(row))) {
      errors.push(`El producto ${rows[0].name} tiene ${label} distintos entre filas.`);
      break;
    }
  }
  return first;
}

function shouldApplyCatalog(scope: CatalogImportScope) {
  return scope === "everything" || scope === "catalog";
}

function shouldApplyPricing(scope: CatalogImportScope) {
  return scope === "everything" || scope === "pricing";
}

function shouldApplyDisplay(scope: CatalogImportScope) {
  return scope === "everything" || scope === "display";
}

function shouldApplyStock(scope: CatalogImportScope) {
  return scope === "everything" || scope === "stock";
}

function shouldApplyLots(scope: CatalogImportScope) {
  return scope === "everything" || scope === "lots";
}

function lotRowsForOwner(
  ownerRow: SpreadsheetProductRow,
  displayName: string,
  internalCode: string | null,
  lotRows: SpreadsheetLotRow[],
) {
  const fallbackNameKey = `${normalizeKey(displayName)}:${normalizeKey(ownerRow.variantName)}`;
  const fallbackCodeKey = `${normalizeKey(internalCode)}:${normalizeKey(ownerRow.variantName)}`;
  const fallbackBarcodeKey = normalizeKey(ownerRow.barcode);

  return lotRows.filter((lotRow) => {
    if (ownerRow.variantId && lotRow.variantId === ownerRow.variantId) {
      return true;
    }

    if (!ownerRow.variantId && ownerRow.productId && lotRow.productId === ownerRow.productId && !lotRow.variantId) {
      return true;
    }

    const lotCodeKey = `${normalizeKey(lotRow.internalCode)}:${normalizeKey(lotRow.variantName)}`;
    if (internalCode && fallbackCodeKey === lotCodeKey) {
      return true;
    }

    if (fallbackBarcodeKey && normalizeKey(lotRow.barcode) === fallbackBarcodeKey) {
      return true;
    }

    const lotNameKey = `${normalizeKey(lotRow.name)}:${normalizeKey(lotRow.variantName)}`;
    return fallbackNameKey === lotNameKey;
  });
}

function normalizeLots(rows: SpreadsheetLotRow[]) {
  return normalizeLotInputs(
    rows.map((row) => ({
      quantity: row.quantity,
      expiresOn: row.expiresOn,
    })),
  );
}

function buildProductMaps(products: ImportableProduct[]) {
  const productById = new Map<string, ImportableProduct>();
  const productByInternalCode = new Map<string, ImportableProduct>();
  const productBySimpleBarcode = new Map<string, ImportableProduct>();
  const productByName = new Map<string, ImportableProduct[]>();
  const variantById = new Map<string, { product: ImportableProduct; variant: ExistingVariantRef }>();
  const variantByBarcode = new Map<string, { product: ImportableProduct; variant: ExistingVariantRef }>();

  for (const product of products) {
    productById.set(product.id, product);

    const internalCodeKey = normalizeKey(product.internalCode);
    if (internalCodeKey) {
      productByInternalCode.set(internalCodeKey, product);
    }

    const productBarcodeKey = normalizeKey(product.barcode);
    if (productBarcodeKey && product.variants.length === 0) {
      productBySimpleBarcode.set(productBarcodeKey, product);
    }

    const productNameKey = normalizeKey(product.name);
    if (productNameKey) {
      const current = productByName.get(productNameKey) ?? [];
      current.push(product);
      productByName.set(productNameKey, current);
    }

    for (const variant of product.variants) {
      variantById.set(variant.id, { product, variant });
      const barcodeKey = normalizeKey(variant.barcode);
      if (barcodeKey) {
        variantByBarcode.set(barcodeKey, { product, variant });
      }
    }
  }

  return {
    productById,
    productByInternalCode,
    productBySimpleBarcode,
    productByName,
    variantById,
    variantByBarcode,
  };
}

function resolveExistingProduct(
  rows: SpreadsheetProductRow[],
  maps: ReturnType<typeof buildProductMaps>,
) {
  for (const row of rows) {
    if (row.productId && maps.productById.has(row.productId)) {
      return maps.productById.get(row.productId) ?? null;
    }
  }

  for (const row of rows) {
    if (row.variantId && maps.variantById.has(row.variantId)) {
      return maps.variantById.get(row.variantId)?.product ?? null;
    }
  }

  const internalCode = normalizeKey(rows[0]?.internalCode);
  if (internalCode && maps.productByInternalCode.has(internalCode)) {
    return maps.productByInternalCode.get(internalCode) ?? null;
  }

  if (!rowHasVariant(rows[0])) {
    const simpleBarcode = normalizeKey(rows[0]?.barcode);
    if (simpleBarcode && maps.productBySimpleBarcode.has(simpleBarcode)) {
      return maps.productBySimpleBarcode.get(simpleBarcode) ?? null;
    }
  }

  const variantMatches = rows
    .map((row) => {
      const barcodeKey = normalizeKey(row.barcode);
      return barcodeKey ? maps.variantByBarcode.get(barcodeKey) ?? null : null;
    })
    .filter(Boolean);

  if (variantMatches.length > 0) {
    const firstProductId = variantMatches[0]?.product.id ?? null;
    if (firstProductId && variantMatches.every((match) => match?.product.id === firstProductId)) {
      return variantMatches[0]?.product ?? null;
    }
  }

  const nameKey = normalizeKey(rows[0]?.name);
  const nameMatches = nameKey ? maps.productByName.get(nameKey) ?? [] : [];
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

async function loadImportContext(kioscoId: string, branchId: string) {
  const [branch, kiosco, categories, branches, products, stockLots] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: branchId, kioscoId },
      select: { id: true, name: true },
    }),
    prisma.kiosco.findUnique({
      where: { id: kioscoId },
      select: { pricingMode: true },
    }),
    prisma.category.findMany({
      where: { kioscoId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { kioscoId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.product.findMany({
      where: { kioscoId },
      include: {
        category: { select: { id: true, name: true } },
        inventory: {
          where: { branchId },
          select: {
            id: true,
            branchId: true,
            price: true,
            cost: true,
            stock: true,
            minStock: true,
            showInGrid: true,
          },
        },
        variants: {
          include: {
            inventory: {
              where: { branchId },
              select: {
                id: true,
                branchId: true,
                stock: true,
                minStock: true,
                cost: true,
                price: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.stockLot.findMany({
      where: {
        branchId,
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        variantId: true,
        quantity: true,
        expiresOn: true,
      },
    }),
  ]);

  if (!branch) {
    throw new Error("Sucursal destino no encontrada.");
  }

  const stockLotsByOwner = stockLots.reduce<Map<string, { quantity: number; expiresOn: Date }[]>>((map, lot) => {
    const key = ownerLotKey(lot.productId, lot.variantId);
    const current = map.get(key) ?? [];
    current.push({
      quantity: lot.quantity,
      expiresOn: lot.expiresOn,
    });
    map.set(key, current);
    return map;
  }, new Map());

  return {
    branch,
    branches,
    categories,
    products,
    pricingMode: kiosco?.pricingMode ?? DEFAULT_PRICING_MODE,
    stockLotsByOwner,
  };
}

function prepareImportPlan(input: {
  products: ImportableProduct[];
  stockLotsByOwner: Map<string, { quantity: number; expiresOn: Date }[]>;
  productRows: SpreadsheetProductRow[];
  lotRows: SpreadsheetLotRow[];
  scope: CatalogImportScope;
  mode: CatalogImportMode;
}) {
  const maps = buildProductMaps(input.products);
  const groups = new Map<string, SpreadsheetProductRow[]>();
  const warnings: string[] = [];
  const errors: string[] = [];
  const plans: ProductPlan[] = [];

  for (const row of input.productRows) {
    const key = productGroupKey(row);
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  for (const [key, rows] of groups) {
    const groupErrors: string[] = [];
    const groupWarnings: string[] = [];
    const hasVariants = rows.some(rowHasVariant) || rows.length > 1;
    const existingProduct = resolveExistingProduct(rows, maps);
    const firstRow = rows[0];

    if (!existingProduct) {
      groupWarnings.push(`No encontramos ${firstRow.name} dentro de tu kiosco. Esa fila se va a omitir.`);
      plans.push({
        key,
        action: "skip",
        product: null,
        rows,
        owners: [],
        displayName: firstRow.name,
        hasVariants,
        inventoryExists: false,
        inventoryWillBeCreated: false,
        variantInventoryCreates: 0,
        variantInventoryUpdates: 0,
        warnings: groupWarnings,
        errors: groupErrors,
        productFields: {
          name: firstRow.name,
          barcode: normalizeText(firstRow.barcode),
          internalCode: normalizeText(firstRow.internalCode),
          categoryName: normalizeText(firstRow.category),
          brand: normalizeText(firstRow.brand),
          description: normalizeText(firstRow.description),
          presentation: normalizeText(firstRow.presentation),
          supplierName: normalizeText(firstRow.supplierName),
          notes: normalizeText(firstRow.notes),
          emoji: normalizeText(firstRow.emoji),
          image: normalizeText(firstRow.image),
        },
        price: firstRow.price,
        cost: firstRow.cost,
        showInGrid: firstRow.showInGrid,
      });
      continue;
    }

    const inventory = existingProduct.inventory[0] ?? null;
    const existingHasVariants = existingProduct.variants.length > 0;

    if (hasVariants !== existingHasVariants && input.scope !== "pricing") {
      groupErrors.push(
        `El producto ${existingProduct.name} no coincide con la estructura de variantes del archivo. Edita esa estructura desde el sistema.`,
      );
    }

    const productName = collectConsistentValue(
      rows,
      (row) => row.name,
      (left, right) => normalizeKey(left) === normalizeKey(right),
      "nombres",
      groupErrors,
    );
    const internalCode = collectConsistentValue(
      rows,
      (row) => normalizeText(row.internalCode),
      stringsEqual,
      "codigos internos",
      groupErrors,
    );
    const categoryName = collectConsistentValue(
      rows,
      (row) => normalizeText(row.category),
      stringsEqual,
      "categorias",
      groupErrors,
    );
    const brand = collectConsistentValue(
      rows,
      (row) => normalizeText(row.brand),
      stringsEqual,
      "marcas",
      groupErrors,
    );
    const description = collectConsistentValue(
      rows,
      (row) => normalizeText(row.description),
      stringsEqual,
      "descripciones",
      groupErrors,
    );
    const presentation = collectConsistentValue(
      rows,
      (row) => normalizeText(row.presentation),
      stringsEqual,
      "presentaciones",
      groupErrors,
    );
    const supplierName = collectConsistentValue(
      rows,
      (row) => normalizeText(row.supplierName),
      stringsEqual,
      "proveedores",
      groupErrors,
    );
    const notes = collectConsistentValue(
      rows,
      (row) => normalizeText(row.notes),
      stringsEqual,
      "notas",
      groupErrors,
    );
    const emoji = collectConsistentValue(
      rows,
      (row) => normalizeText(row.emoji),
      stringsEqual,
      "emojis",
      groupErrors,
    );
    const image = collectConsistentValue(
      rows,
      (row) => normalizeText(row.image),
      stringsEqual,
      "imagenes",
      groupErrors,
    );
    const showInGrid = collectConsistentValue(
      rows,
      (row) => row.showInGrid,
      booleansEqual,
      "visibilidad",
      groupErrors,
    );
    const price = collectConsistentValue(
      rows,
      (row) => row.price,
      numbersEqual,
      "precios",
      groupErrors,
    );
    const cost = collectConsistentValue(
      rows,
      (row) => row.cost,
      numbersEqual,
      "costos",
      groupErrors,
    );

    const owners: OwnerPlan[] = [];
    let variantInventoryCreates = 0;
    let variantInventoryUpdates = 0;

    if (existingHasVariants) {
      const matchedVariants = new Set<string>();

      for (const row of rows) {
        const matchedVariant =
          (row.variantId
            ? existingProduct.variants.find((variant) => variant.id === row.variantId)
            : null) ??
          existingProduct.variants.find((variant) => normalizeKey(variant.name) === normalizeKey(row.variantName)) ??
          existingProduct.variants.find((variant) => normalizeKey(variant.barcode) === normalizeKey(row.barcode)) ??
          null;

        if (!matchedVariant) {
          if (input.scope !== "pricing") {
            groupErrors.push(`No pudimos asociar la variante ${row.variantName ?? row.name} del archivo.`);
          }
          continue;
        }

        if (matchedVariants.has(matchedVariant.id) && input.scope !== "pricing") {
          groupErrors.push(`La variante ${matchedVariant.name} aparece repetida en el archivo.`);
          continue;
        }

        matchedVariants.add(matchedVariant.id);
        const variantInventory = matchedVariant.inventory[0] ?? null;
        const importedLots = normalizeLots(
          lotRowsForOwner(row, existingProduct.name, internalCode, input.lotRows),
        );
        const currentTrackedQuantity = (
          input.stockLotsByOwner.get(ownerLotKey(existingProduct.id, matchedVariant.id)) ?? []
        ).reduce((sum, lot) => sum + lot.quantity, 0);

        if (!variantInventory) {
          variantInventoryCreates += 1;
        } else {
          variantInventoryUpdates += 1;
        }

        owners.push({
          key: ownerLotKey(existingProduct.id, matchedVariant.id),
          type: "variant",
          label: matchedVariant.name,
          row,
          variant: matchedVariant,
          currentStock: variantInventory?.stock ?? 0,
          currentMinStock: variantInventory?.minStock ?? 0,
          currentTrackedQuantity,
          importedLots,
        });
      }

      if (input.scope !== "pricing" && matchedVariants.size !== existingProduct.variants.length) {
        groupErrors.push(`El archivo no incluye todas las variantes de ${existingProduct.name}.`);
      }
    } else {
      if (rows.length > 1) {
        groupErrors.push(`El producto ${existingProduct.name} aparece duplicado en la hoja Productos.`);
      }

      const simpleRow = rows[0];
      const currentTrackedQuantity = (
        input.stockLotsByOwner.get(ownerLotKey(existingProduct.id)) ?? []
      ).reduce((sum, lot) => sum + lot.quantity, 0);

      owners.push({
        key: ownerLotKey(existingProduct.id),
        type: "base",
        label: existingProduct.name,
        row: simpleRow,
        variant: null,
        currentStock: inventory?.stock ?? 0,
        currentMinStock: inventory?.minStock ?? 0,
        currentTrackedQuantity,
        importedLots: normalizeLots(lotRowsForOwner(simpleRow, existingProduct.name, internalCode, input.lotRows)),
      });
    }

    for (const owner of owners) {
      const nextStock =
        shouldApplyStock(input.scope)
          ? toIntOrDefault(owner.row.stock, input.mode === "overwrite_existing" ? 0 : owner.currentStock)
          : owner.currentStock;
      const trackedQuantityForValidation = shouldApplyLots(input.scope)
        ? owner.importedLots.reduce((sum, lot) => sum + lot.quantity, 0)
        : owner.currentTrackedQuantity;

      if ((shouldApplyStock(input.scope) || shouldApplyLots(input.scope)) && trackedQuantityForValidation > nextStock) {
        groupErrors.push(
          `En ${existingProduct.name}${owner.type === "variant" ? ` / ${owner.label}` : ""}, los vencimientos suman ${trackedQuantityForValidation} y el stock queda en ${nextStock}.`,
        );
      }
    }

    plans.push({
      key,
      action: groupErrors.length > 0 ? "skip" : "update",
      product: existingProduct,
      rows,
      owners,
      displayName: existingProduct.name,
      hasVariants,
      inventoryExists: Boolean(inventory),
      inventoryWillBeCreated: !inventory,
      variantInventoryCreates,
      variantInventoryUpdates,
      warnings: groupWarnings,
      errors: groupErrors,
      productFields: {
        name: productName,
        barcode: existingHasVariants ? null : normalizeText(firstRow.barcode),
        internalCode,
        categoryName,
        brand,
        description,
        presentation,
        supplierName,
        notes,
        emoji,
        image,
      },
      price,
      cost,
      showInGrid,
    });
  }

  for (const plan of plans) {
    warnings.push(...plan.warnings);
    errors.push(...plan.errors);
  }

  return { plans, warnings, errors };
}

async function ensureCategoryId(
  tx: TxClient,
  kioscoId: string,
  categoryName: string | null,
  categoryMap: Map<string, ImportableCategory>,
) {
  const normalized = normalizeKey(categoryName);
  if (!normalized) {
    return null;
  }

  const existing = categoryMap.get(normalized);
  if (existing) {
    return existing.id;
  }

  const created = await tx.category.create({
    data: {
      kioscoId,
      name: categoryName!.trim(),
    },
    select: { id: true, name: true },
  });

  categoryMap.set(normalized, created);
  return created.id;
}

function maybeNumber(
  value: number | null,
  fallback: number | null,
  mode: CatalogImportMode,
  overwriteFallback: number | null,
) {
  if (typeof value === "number") {
    return value;
  }
  return mode === "overwrite_existing" ? overwriteFallback : fallback;
}

function maybeString(
  value: string | null,
  fallback: string | null,
  mode: CatalogImportMode,
) {
  if (value !== null) {
    return value;
  }
  return mode === "overwrite_existing" ? null : fallback;
}

function maybeBoolean(
  value: boolean | null,
  fallback: boolean,
  mode: CatalogImportMode,
) {
  if (typeof value === "boolean") {
    return value;
  }
  return mode === "overwrite_existing" ? true : fallback;
}

async function applyPreparedPlan(input: {
  kioscoId: string;
  branchId: string;
  scope: CatalogImportScope;
  mode: CatalogImportMode;
  pricingMode: "SHARED" | "BRANCH";
  categories: ImportableCategory[];
  plans: ProductPlan[];
}) {
  const categoryMap = new Map(input.categories.map((category) => [normalizeKey(category.name), category]));
  const applicablePlans = input.plans.filter((plan) => plan.action === "update" && plan.product);
  const touchedPricingProducts: string[] = [];
  let appliedProducts = 0;
  let inventoryCreates = 0;
  let inventoryUpdates = 0;
  let variantInventoryCreates = 0;
  let variantInventoryUpdates = 0;
  let lotOwners = 0;

  await prisma.$transaction(async (tx) => {
    for (const plan of applicablePlans) {
      const product = plan.product!;
      const inventory = product.inventory[0] ?? null;
      const priceValue = maybeNumber(plan.price, inventory?.price ?? 0, input.mode, 0) ?? 0;
      const costValue = maybeNumber(plan.cost, inventory?.cost ?? null, input.mode, null);
      const actualCost = shouldApplyPricing(input.scope) ? costValue : (inventory?.cost ?? null);

      if (shouldApplyCatalog(input.scope)) {
        const categoryId = await ensureCategoryId(
          tx,
          input.kioscoId,
          plan.productFields.categoryName,
          categoryMap,
        );

        await tx.product.update({
          where: { id: product.id },
          data: {
            name: plan.productFields.name,
            barcode: product.variants.length > 0
              ? product.barcode
              : maybeString(plan.productFields.barcode, product.barcode, input.mode),
            internalCode: maybeString(plan.productFields.internalCode, product.internalCode, input.mode),
            brand: maybeString(plan.productFields.brand, product.brand, input.mode),
            description: maybeString(plan.productFields.description, product.description, input.mode),
            presentation: maybeString(plan.productFields.presentation, product.presentation, input.mode),
            supplierName: maybeString(plan.productFields.supplierName, product.supplierName, input.mode),
            notes: maybeString(plan.productFields.notes, product.notes, input.mode),
            emoji: maybeString(plan.productFields.emoji, product.emoji, input.mode),
            image: maybeString(plan.productFields.image, product.image, input.mode),
            categoryId:
              plan.productFields.categoryName !== null || input.mode === "overwrite_existing"
                ? categoryId
                : product.categoryId,
          },
        });

        for (const owner of plan.owners) {
          if (owner.type !== "variant" || !owner.variant) {
            continue;
          }

          await tx.variant.update({
            where: { id: owner.variant.id },
            data: {
              name: normalizeText(owner.row.variantName) ?? owner.variant.name,
              barcode: maybeString(normalizeText(owner.row.barcode), owner.variant.barcode, input.mode),
            },
          });
        }
      }

      if (
        shouldApplyPricing(input.scope) ||
        shouldApplyDisplay(input.scope) ||
        shouldApplyStock(input.scope)
      ) {
        const firstOwner = plan.owners[0];
        const baseStockValue =
          plan.hasVariants || !firstOwner
            ? inventory?.stock ?? 0
            : maybeNumber(firstOwner.row.stock, inventory?.stock ?? 0, input.mode, 0) ?? 0;
        const baseMinStockValue =
          plan.hasVariants || !firstOwner
            ? inventory?.minStock ?? 0
            : maybeNumber(firstOwner.row.minStock, inventory?.minStock ?? 0, input.mode, 0) ?? 0;
        const showInGridValue = maybeBoolean(plan.showInGrid, inventory?.showInGrid ?? true, input.mode);

        if (!inventory && input.mode !== "only_existing") {
          await tx.inventoryRecord.create({
            data: {
              productId: product.id,
              branchId: input.branchId,
              price: shouldApplyPricing(input.scope) ? priceValue : 0,
              cost: shouldApplyPricing(input.scope) ? costValue : null,
              stock: shouldApplyStock(input.scope) ? baseStockValue : 0,
              minStock: shouldApplyDisplay(input.scope) ? baseMinStockValue : 0,
              showInGrid: shouldApplyDisplay(input.scope) ? showInGridValue : true,
            },
          });
          if (shouldApplyStock(input.scope) && baseStockValue > 0 && actualCost !== null && actualCost > 0 && !plan.hasVariants) {
            await tx.inventoryCostLayer.create({
              data: {
                branchId: input.branchId,
                productId: product.id,
                variantId: null,
                sourceType: "LEGACY_SNAPSHOT",
                unitCost: actualCost,
                initialQuantity: baseStockValue,
                remainingQuantity: baseStockValue,
                receivedAt: new Date(),
              },
            });
          }
          inventoryCreates += 1;
        } else if (inventory) {
          const previousStock = inventory.stock ?? 0;
          await tx.inventoryRecord.update({
            where: { id: inventory.id },
            data: {
              ...(shouldApplyPricing(input.scope) ? { price: priceValue, cost: costValue } : {}),
              ...(shouldApplyStock(input.scope) && !plan.hasVariants ? { stock: baseStockValue } : {}),
              ...(shouldApplyDisplay(input.scope) && !plan.hasVariants ? { minStock: baseMinStockValue } : {}),
              ...(shouldApplyDisplay(input.scope) ? { showInGrid: showInGridValue } : {}),
            },
          });
          if (shouldApplyStock(input.scope) && !plan.hasVariants) {
            if (baseStockValue < previousStock) {
              await applyInventoryCorrectionToCostLayers(tx, {
                branchId: input.branchId,
                productId: product.id,
                variantId: null,
                delta: baseStockValue - previousStock,
              });
            } else if (baseStockValue > previousStock && actualCost !== null && actualCost > 0) {
              const delta = baseStockValue - previousStock;
              await tx.inventoryCostLayer.create({
                data: {
                  branchId: input.branchId,
                  productId: product.id,
                  variantId: null,
                  sourceType: "LEGACY_SNAPSHOT",
                  unitCost: actualCost,
                  initialQuantity: delta,
                  remainingQuantity: delta,
                  receivedAt: new Date(),
                },
              });
            }
          }
          inventoryUpdates += 1;
        }

        if (shouldApplyPricing(input.scope)) {
          touchedPricingProducts.push(product.id);
        }
      }

      for (const owner of plan.owners) {
        if (owner.type !== "variant" || !owner.variant) {
          continue;
        }

        const variantInventory = owner.variant.inventory[0] ?? null;
        const nextStock = maybeNumber(owner.row.stock, variantInventory?.stock ?? 0, input.mode, 0) ?? 0;
        const nextMinStock = maybeNumber(owner.row.minStock, variantInventory?.minStock ?? 0, input.mode, 0) ?? 0;
        const actualVariantCost = variantInventory?.cost ?? actualCost;

        if (!variantInventory && input.mode !== "only_existing") {
          if (shouldApplyStock(input.scope) || shouldApplyDisplay(input.scope)) {
            await tx.variantInventory.create({
              data: {
                variantId: owner.variant.id,
                branchId: input.branchId,
                stock: shouldApplyStock(input.scope) ? nextStock : 0,
                minStock: shouldApplyDisplay(input.scope) ? nextMinStock : 0,
              },
            });
            if (shouldApplyStock(input.scope) && nextStock > 0 && actualVariantCost !== null && actualVariantCost > 0) {
              await tx.inventoryCostLayer.create({
                data: {
                  branchId: input.branchId,
                  productId: product.id,
                  variantId: owner.variant.id,
                  sourceType: "LEGACY_SNAPSHOT",
                  unitCost: actualVariantCost,
                  initialQuantity: nextStock,
                  remainingQuantity: nextStock,
                  receivedAt: new Date(),
                },
              });
            }
            variantInventoryCreates += 1;
          }
        } else if (variantInventory) {
          if (shouldApplyStock(input.scope) || shouldApplyDisplay(input.scope)) {
            const previousStock = variantInventory.stock ?? 0;
            await tx.variantInventory.update({
              where: { id: variantInventory.id },
              data: {
                ...(shouldApplyStock(input.scope) ? { stock: nextStock } : {}),
                ...(shouldApplyDisplay(input.scope) ? { minStock: nextMinStock } : {}),
              },
            });
            if (shouldApplyStock(input.scope)) {
              if (nextStock < previousStock) {
                await applyInventoryCorrectionToCostLayers(tx, {
                  branchId: input.branchId,
                  productId: product.id,
                  variantId: owner.variant.id,
                  delta: nextStock - previousStock,
                });
              } else if (nextStock > previousStock && actualVariantCost !== null && actualVariantCost > 0) {
                const delta = nextStock - previousStock;
                await tx.inventoryCostLayer.create({
                  data: {
                    branchId: input.branchId,
                    productId: product.id,
                    variantId: owner.variant.id,
                    sourceType: "LEGACY_SNAPSHOT",
                    unitCost: actualVariantCost,
                    initialQuantity: delta,
                    remainingQuantity: delta,
                    receivedAt: new Date(),
                  },
                });
              }
            }
            variantInventoryUpdates += 1;
          }
        }
      }

      if (shouldApplyLots(input.scope)) {
        for (const owner of plan.owners) {
          await replaceTrackedLots(
            tx,
            {
              branchId: input.branchId,
              productId: product.id,
              variantId: owner.variant?.id ?? null,
            },
            owner.importedLots,
          );
          lotOwners += 1;
        }
      }

      appliedProducts += 1;
    }

    if (input.pricingMode === "SHARED" && touchedPricingProducts.length > 0) {
      await syncSharedPricingFromBranch(tx, {
        kioscoId: input.kioscoId,
        sourceBranchId: input.branchId,
        productIds: Array.from(new Set(touchedPricingProducts)),
      });
    }
  });

  return {
    appliedProducts,
    inventoryCreates,
    inventoryUpdates,
    variantInventoryCreates,
    variantInventoryUpdates,
    lotOwners,
  };
}

export async function exportCatalogSpreadsheet(input: {
  kioscoId: string;
  branchId: string;
  productIds?: string[];
}) {
  const [branch, kiosco, products, stockLots] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: input.branchId, kioscoId: input.kioscoId },
      select: { id: true, name: true },
    }),
    prisma.kiosco.findUnique({
      where: { id: input.kioscoId },
      select: { pricingMode: true },
    }),
    prisma.product.findMany({
      where: {
        kioscoId: input.kioscoId,
        ...(input.productIds && input.productIds.length > 0 ? { id: { in: input.productIds } } : {}),
      },
      include: {
        category: { select: { name: true } },
        inventory: {
          where: { branchId: input.branchId },
          select: {
            branchId: true,
            price: true,
            cost: true,
            stock: true,
            minStock: true,
            showInGrid: true,
          },
        },
        variants: {
          include: {
            inventory: {
              where: { branchId: input.branchId },
              select: {
                branchId: true,
                stock: true,
                minStock: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.stockLot.findMany({
      where: {
        branchId: input.branchId,
        quantity: { gt: 0 },
        ...(input.productIds && input.productIds.length > 0 ? { productId: { in: input.productIds } } : {}),
      },
      include: {
        variant: {
          select: {
            name: true,
            barcode: true,
          },
        },
      },
      orderBy: [{ productId: "asc" }, { variantId: "asc" }, { expiresOn: "asc" }],
    }),
  ]);

  if (!branch) {
    throw new Error("Sucursal origen no encontrada.");
  }

  const productRows: Array<Omit<SpreadsheetProductRow, "rowNumber">> = [];
  for (const product of products as ExportableProduct[]) {
    const inventory = product.inventory[0] ?? null;
    if (product.variants.length > 0) {
      for (const variant of product.variants) {
        const variantInventory = variant.inventory[0] ?? null;
        productRows.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          variantName: variant.name,
          barcode: variant.barcode,
          internalCode: product.internalCode,
          category: product.category?.name ?? null,
          brand: product.brand,
          presentation: product.presentation,
          description: product.description,
          supplierName: product.supplierName,
          notes: product.notes,
          emoji: product.emoji,
          image: product.image,
          showInGrid: inventory?.showInGrid ?? true,
          price: inventory?.price ?? 0,
          cost: inventory?.cost ?? null,
          stock: variantInventory?.stock ?? 0,
          minStock: variantInventory?.minStock ?? 0,
        });
      }
      continue;
    }

    productRows.push({
      productId: product.id,
      variantId: null,
      name: product.name,
      variantName: null,
      barcode: product.barcode,
      internalCode: product.internalCode,
      category: product.category?.name ?? null,
      brand: product.brand,
      presentation: product.presentation,
      description: product.description,
      supplierName: product.supplierName,
      notes: product.notes,
      emoji: product.emoji,
      image: product.image,
      showInGrid: inventory?.showInGrid ?? true,
      price: inventory?.price ?? 0,
      cost: inventory?.cost ?? null,
      stock: inventory?.stock ?? 0,
      minStock: inventory?.minStock ?? 0,
    });
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const lotRows: Array<Omit<SpreadsheetLotRow, "rowNumber">> = stockLots.map((lot) => ({
    productId: lot.productId,
    variantId: lot.variantId,
    barcode: lot.variant?.barcode ?? null,
    internalCode: productById.get(lot.productId)?.internalCode ?? null,
    name: productById.get(lot.productId)?.name ?? null,
    variantName: lot.variant?.name ?? null,
    expiresOn: dateToKey(lot.expiresOn),
    quantity: lot.quantity,
  }));

  return buildCatalogWorkbook({
    branchName: branch.name,
    generatedAt: new Date(),
    pricingMode: kiosco?.pricingMode ?? DEFAULT_PRICING_MODE,
    productRows,
    lotRows,
  });
}

export async function previewCatalogImport(input: {
  kioscoId: string;
  branchId: string;
  buffer: Buffer | ArrayBuffer | Uint8Array;
  scope: CatalogImportScope;
  mode: CatalogImportMode;
}) {
  const parsed = parseCatalogWorkbook(input.buffer);
  const context = await loadImportContext(input.kioscoId, input.branchId);
  const prepared = prepareImportPlan({
    products: context.products,
    stockLotsByOwner: context.stockLotsByOwner,
    productRows: parsed.productRows,
    lotRows: parsed.lotRows,
    scope: input.scope,
    mode: input.mode,
  });

  const matchedProducts = prepared.plans.filter((plan) => plan.action === "update").length;
  const skippedProducts = prepared.plans.filter((plan) => plan.action === "skip").length;
  const inventoryCreates = input.mode === "only_existing"
    ? 0
    : prepared.plans.filter((plan) => plan.action === "update" && plan.inventoryWillBeCreated).length;
  const inventoryUpdates = prepared.plans
    .filter((plan) => plan.action === "update" && plan.inventoryExists)
    .length;
  const variantInventoryCreates = input.mode === "only_existing"
    ? 0
    : prepared.plans.reduce(
        (sum, plan) => sum + (plan.action === "update" ? plan.variantInventoryCreates : 0),
        0,
      );
  const variantInventoryUpdates = prepared.plans.reduce(
    (sum, plan) => sum + (plan.action === "update" ? plan.variantInventoryUpdates : 0),
    0,
  );
  const lotOwners = prepared.plans.reduce(
    (sum, plan) =>
      sum + (plan.action === "update" && shouldApplyLots(input.scope) ? plan.owners.length : 0),
    0,
  );

  const items: CatalogImportPreviewItem[] = prepared.plans.slice(0, 25).map((plan) => ({
    key: plan.key,
    name: plan.displayName,
    action: plan.action,
    detail:
      plan.action === "skip"
        ? (plan.errors[0] ?? plan.warnings[0] ?? "Se omite en esta importacion.")
        : plan.hasVariants
          ? `${plan.owners.length} variante${plan.owners.length === 1 ? "" : "s"}`
          : "Producto simple",
    lotCount: plan.owners.reduce((sum, owner) => sum + owner.importedLots.length, 0),
  }));

  const warnings = [...parsed.errors, ...prepared.warnings];
  const errors = prepared.errors;

  if (parsed.lotRows.length > 0 && !shouldApplyLots(input.scope)) {
    warnings.push("La hoja Lotes no se va a usar con la opcion elegida.");
  }

  return {
    branchId: context.branch.id,
    branchName: context.branch.name,
    pricingMode: context.pricingMode,
    scope: input.scope,
    mode: input.mode,
    summary: {
      productRows: parsed.productRows.length,
      lotRows: parsed.lotRows.length,
      matchedProducts,
      skippedProducts,
      inventoryCreates,
      inventoryUpdates,
      variantInventoryCreates,
      variantInventoryUpdates,
      lotOwners,
    },
    items,
    errors,
    warnings,
  } satisfies CatalogImportPreview;
}

export async function applyCatalogImport(input: {
  kioscoId: string;
  branchId: string;
  buffer: Buffer | ArrayBuffer | Uint8Array;
  scope: CatalogImportScope;
  mode: CatalogImportMode;
}) {
  const parsed = parseCatalogWorkbook(input.buffer);
  const context = await loadImportContext(input.kioscoId, input.branchId);
  const prepared = prepareImportPlan({
    products: context.products,
    stockLotsByOwner: context.stockLotsByOwner,
    productRows: parsed.productRows,
    lotRows: parsed.lotRows,
    scope: input.scope,
    mode: input.mode,
  });

  if (parsed.errors.length > 0 || prepared.errors.length > 0) {
    const joined = [...parsed.errors, ...prepared.errors].join(" ");
    throw new Error(joined || "El archivo tiene errores y no se puede importar.");
  }

  const applied = await applyPreparedPlan({
    kioscoId: input.kioscoId,
    branchId: input.branchId,
    scope: input.scope,
    mode: input.mode,
    pricingMode: context.pricingMode,
    categories: context.categories,
    plans: prepared.plans,
  });

  return {
    branchId: context.branch.id,
    branchName: context.branch.name,
    pricingMode: context.pricingMode,
    scope: input.scope,
    mode: input.mode,
    appliedProducts: applied.appliedProducts,
    inventoryCreates: applied.inventoryCreates,
    inventoryUpdates: applied.inventoryUpdates,
    variantInventoryCreates: applied.variantInventoryCreates,
    variantInventoryUpdates: applied.variantInventoryUpdates,
    lotOwners: applied.lotOwners,
    warnings: prepared.warnings,
  } satisfies CatalogImportApplyResult;
}
