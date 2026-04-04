import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";

import {
  canLookupBarcode,
  normalizeBarcodeCode,
  type BarcodeSuggestion,
} from "@/lib/barcode-suggestions";
import {
  DEFAULT_BUSINESS_ACTIVITY_CODE,
  normalizeBusinessActivityCode,
} from "@/lib/business-activities";
import { ensureBusinessActivitiesSeeded } from "@/lib/business-activities-store";
import {
  DEFAULT_KIOSCO_CATEGORIES,
  DEFAULT_KIOSCO_PRODUCTS,
} from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";

type PlatformProductDraft = {
  barcode?: string | null;
  businessActivity?: string | null;
  name: string;
  brand?: string | null;
  categoryName?: string | null;
  description?: string | null;
  presentation?: string | null;
  image?: string | null;
  variants?: Array<{
    name: string;
    barcode?: string | null;
  }>;
};

export type PlatformDraftChangeField =
  | "barcode"
  | "businessActivity"
  | "name"
  | "brand"
  | "categoryName"
  | "description"
  | "presentation"
  | "image"
  | "variants";

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBusinessActivity(
  value: string | null | undefined,
  fallback = DEFAULT_BUSINESS_ACTIVITY_CODE,
) {
  return normalizeBusinessActivityCode(value, fallback);
}

function buildBusinessActivityWhere(businessActivity?: string | null) {
  const normalized = cleanText(businessActivity)
    ? normalizeBusinessActivity(businessActivity, "")
    : "";

  return normalized ? { businessActivity: normalized } : {};
}

function normalizeVariants(
  variants?: Array<{
    name: string;
    barcode?: string | null;
  }> | null,
) {
  return (variants ?? [])
    .map((variant) => ({
      name: variant.name.trim(),
      barcode: cleanText(variant.barcode),
    }))
    .filter((variant) => variant.name)
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es");
      if (byName !== 0) {
        return byName;
      }

      return (a.barcode ?? "").localeCompare(b.barcode ?? "", "es");
    });
}

let seedPromise: Promise<void> | null = null;
const defaultCategoryNameByKey = new Map(
  DEFAULT_KIOSCO_CATEGORIES.map((category) => [category.key, category.name]),
);

export async function ensurePlatformCatalogSeeded() {
  await ensureBusinessActivitiesSeeded();

  const existing = await prisma.platformProduct.findMany({
    where: {
      barcode: {
        in: DEFAULT_KIOSCO_PRODUCTS.map((product) => product.barcode),
      },
    },
    select: { barcode: true },
  });

  const existingBarcodes = new Set(existing.map((product) => product.barcode));
  const missingProducts = DEFAULT_KIOSCO_PRODUCTS.filter(
    (product) => !existingBarcodes.has(product.barcode),
  );

  if (missingProducts.length === 0) {
    return;
  }

  if (!seedPromise) {
    seedPromise = (async () => {
      for (const product of missingProducts) {
        await prisma.platformProduct.upsert({
          where: { barcode: product.barcode },
          update: {
            businessActivity: DEFAULT_BUSINESS_ACTIVITY_CODE,
            name: product.name,
            brand: product.brand ?? null,
            categoryName: defaultCategoryNameByKey.get(product.categoryKey) ?? null,
            description: product.description ?? null,
            presentation: product.presentation ?? null,
            image: null,
            status: PlatformProductStatus.APPROVED,
          },
          create: {
            barcode: product.barcode,
            businessActivity: DEFAULT_BUSINESS_ACTIVITY_CODE,
            name: product.name,
            brand: product.brand ?? null,
            categoryName: defaultCategoryNameByKey.get(product.categoryKey) ?? null,
            description: product.description ?? null,
            presentation: product.presentation ?? null,
            image: null,
            status: PlatformProductStatus.APPROVED,
          },
        });
      }
    })().finally(() => {
      seedPromise = null;
    });
  }

  await seedPromise;
}

export async function findApprovedPlatformProductByBarcode(
  barcode: string,
  businessActivity?: string | null,
) {
  await ensurePlatformCatalogSeeded();

  const directMatch = await prisma.platformProduct.findFirst({
    where: {
      barcode,
      status: PlatformProductStatus.APPROVED,
      ...buildBusinessActivityWhere(businessActivity),
    },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (directMatch) {
    return directMatch;
  }

  return prisma.platformProduct.findFirst({
    where: {
      status: PlatformProductStatus.APPROVED,
      ...buildBusinessActivityWhere(businessActivity),
      variants: {
        some: { barcode },
      },
    },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
  });
}

export async function searchApprovedPlatformProductsByName(
  query: string,
  limit = 6,
  businessActivity?: string | null,
) {
  await ensurePlatformCatalogSeeded();

  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const queryLower = normalizedQuery.toLocaleLowerCase("es-AR");
  const results = await prisma.platformProduct.findMany({
    where: {
      status: PlatformProductStatus.APPROVED,
      ...buildBusinessActivityWhere(businessActivity),
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { brand: { contains: normalizedQuery, mode: "insensitive" } },
        { presentation: { contains: normalizedQuery, mode: "insensitive" } },
        {
          variants: {
            some: {
              name: { contains: normalizedQuery, mode: "insensitive" },
            },
          },
        },
      ],
    },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
    take: Math.max(limit * 3, 12),
  });

  return results
    .map((product) => {
      const name = product.name.toLocaleLowerCase("es-AR");
      const brand = (product.brand ?? "").toLocaleLowerCase("es-AR");
      const presentation = (product.presentation ?? "").toLocaleLowerCase("es-AR");
      const variantNames = product.variants.map((variant) => variant.name.toLocaleLowerCase("es-AR"));

      let score = 50;

      if (name === queryLower) score = 0;
      else if (name.startsWith(queryLower)) score = 1;
      else if (brand === queryLower) score = 2;
      else if (brand.startsWith(queryLower)) score = 3;
      else if (name.includes(queryLower)) score = 4;
      else if (presentation.includes(queryLower)) score = 5;
      else if (variantNames.some((variantName) => variantName.startsWith(queryLower))) score = 6;
      else if (variantNames.some((variantName) => variantName.includes(queryLower))) score = 7;
      else if (brand.includes(queryLower)) score = 8;

      return { product, score };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.product.name.localeCompare(right.product.name, "es");
    })
    .slice(0, limit)
    .map((entry) => entry.product);
}

export async function browseApprovedPlatformProducts(
  query: string,
  limit = 12,
  businessActivity?: string | null,
) {
  await ensurePlatformCatalogSeeded();

  const normalizedQuery = query.trim();
  const safeLimit = Math.min(Math.max(limit, 6), 24);

  if (!normalizedQuery) {
    return prisma.platformProduct.findMany({
      where: {
        status: PlatformProductStatus.APPROVED,
        ...buildBusinessActivityWhere(businessActivity),
      },
      include: {
        variants: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: safeLimit,
    });
  }

  const normalizedCode = normalizeBarcodeCode(normalizedQuery);
  const queryLower = normalizedQuery.toLocaleLowerCase("es-AR");
  const shouldSearchBarcode =
    normalizedCode.length >= 3 || canLookupBarcode(normalizedCode);

  if (normalizedQuery.length < 2 && !shouldSearchBarcode) {
    return [];
  }

  const results = await prisma.platformProduct.findMany({
    where: {
      status: PlatformProductStatus.APPROVED,
      ...buildBusinessActivityWhere(businessActivity),
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { brand: { contains: normalizedQuery, mode: "insensitive" } },
        { presentation: { contains: normalizedQuery, mode: "insensitive" } },
        { description: { contains: normalizedQuery, mode: "insensitive" } },
        ...(shouldSearchBarcode
          ? [
              { barcode: { contains: normalizedCode, mode: "insensitive" as const } },
              {
                variants: {
                  some: {
                    barcode: { contains: normalizedCode, mode: "insensitive" as const },
                  },
                },
              },
            ]
          : []),
        {
          variants: {
            some: {
              name: { contains: normalizedQuery, mode: "insensitive" },
            },
          },
        },
      ],
    },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
    take: Math.max(safeLimit * 3, 18),
  });

  return results
    .map((product) => {
      const name = product.name.toLocaleLowerCase("es-AR");
      const brand = (product.brand ?? "").toLocaleLowerCase("es-AR");
      const presentation = (product.presentation ?? "").toLocaleLowerCase("es-AR");
      const description = (product.description ?? "").toLocaleLowerCase("es-AR");
      const barcode = normalizeBarcodeCode(product.barcode ?? "");
      const variantNames = product.variants.map((variant) => variant.name.toLocaleLowerCase("es-AR"));
      const variantBarcodes = product.variants.map((variant) => normalizeBarcodeCode(variant.barcode ?? ""));

      let score = 60;

      if (shouldSearchBarcode && barcode && barcode === normalizedCode) score = 0;
      else if (shouldSearchBarcode && variantBarcodes.some((value) => value === normalizedCode)) score = 1;
      else if (name === queryLower) score = 2;
      else if (name.startsWith(queryLower)) score = 3;
      else if (brand === queryLower) score = 4;
      else if (brand.startsWith(queryLower)) score = 5;
      else if (presentation === queryLower) score = 6;
      else if (presentation.startsWith(queryLower)) score = 7;
      else if (shouldSearchBarcode && barcode.startsWith(normalizedCode)) score = 8;
      else if (shouldSearchBarcode && variantBarcodes.some((value) => value.startsWith(normalizedCode))) score = 9;
      else if (name.includes(queryLower)) score = 10;
      else if (variantNames.some((value) => value.startsWith(queryLower))) score = 11;
      else if (variantNames.some((value) => value.includes(queryLower))) score = 12;
      else if (brand.includes(queryLower)) score = 13;
      else if (presentation.includes(queryLower)) score = 14;
      else if (description.includes(queryLower)) score = 15;
      else if (shouldSearchBarcode && barcode.includes(normalizedCode)) score = 16;
      else if (shouldSearchBarcode && variantBarcodes.some((value) => value.includes(normalizedCode))) score = 17;

      return { product, score };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.product.name.localeCompare(right.product.name, "es");
    })
    .slice(0, safeLimit)
    .map((entry) => entry.product);
}

export function platformProductToSuggestion(product: PlatformProductDraft): BarcodeSuggestion {
  const normalizedVariants = normalizeVariants(product.variants);

  return {
    code: cleanText(product.barcode) ?? normalizedVariants[0]?.barcode ?? "",
    name: product.name,
    brand: cleanText(product.brand),
    categoryName: cleanText(product.categoryName),
    description: cleanText(product.description),
    presentation: cleanText(product.presentation),
    image: cleanText(product.image),
    variants: normalizedVariants,
  };
}

export function normalizePlatformProductDraft(draft: PlatformProductDraft) {
  return {
    barcode: cleanText(draft.barcode),
    businessActivity: normalizeBusinessActivity(draft.businessActivity),
    name: draft.name.trim(),
    brand: cleanText(draft.brand),
    categoryName: cleanText(draft.categoryName),
    description: cleanText(draft.description),
    presentation: cleanText(draft.presentation),
    image: cleanText(draft.image),
    variants: normalizeVariants(draft.variants),
  };
}

function preferNonEmptyText(currentValue?: string | null, nextValue?: string | null) {
  const normalizedCurrent = cleanText(currentValue);
  const normalizedNext = cleanText(nextValue);

  if (!normalizedNext) {
    return normalizedCurrent;
  }

  if (!normalizedCurrent) {
    return normalizedNext;
  }

  if (normalizedCurrent === normalizedNext) {
    return normalizedCurrent;
  }

  return normalizedNext;
}

export function buildPlatformSubmissionDraft(
  product: PlatformProductDraft | null | undefined,
  draft: PlatformProductDraft,
) {
  if (!product) {
    return normalizePlatformProductDraft(draft);
  }

  const normalizedProduct = normalizePlatformProductDraft(product);
  const normalizedDraft = normalizePlatformProductDraft(draft);

  return {
    barcode: normalizedDraft.barcode ?? normalizedProduct.barcode,
    businessActivity: normalizeBusinessActivity(
      normalizedDraft.businessActivity ?? normalizedProduct.businessActivity,
    ),
    name: preferNonEmptyText(normalizedProduct.name, normalizedDraft.name) ?? normalizedProduct.name,
    brand: preferNonEmptyText(normalizedProduct.brand, normalizedDraft.brand),
    categoryName: preferNonEmptyText(normalizedProduct.categoryName, normalizedDraft.categoryName),
    description: preferNonEmptyText(normalizedProduct.description, normalizedDraft.description),
    presentation: preferNonEmptyText(normalizedProduct.presentation, normalizedDraft.presentation),
    image: preferNonEmptyText(normalizedProduct.image, normalizedDraft.image),
    variants:
      normalizedDraft.variants.length > 0
        ? normalizedDraft.variants
        : normalizedProduct.variants,
  };
}

export function getPlatformDraftChanges(
  product: PlatformProductDraft | null | undefined,
  draft: PlatformProductDraft,
): PlatformDraftChangeField[] {
  const normalizedDraft = normalizePlatformProductDraft(draft);

  if (!product) {
    const changes: PlatformDraftChangeField[] = [];

    if (normalizedDraft.barcode) changes.push("barcode");
    if (normalizedDraft.businessActivity) changes.push("businessActivity");
    if (normalizedDraft.name) changes.push("name");
    if (normalizedDraft.brand) changes.push("brand");
    if (normalizedDraft.categoryName) changes.push("categoryName");
    if (normalizedDraft.description) changes.push("description");
    if (normalizedDraft.presentation) changes.push("presentation");
    if (normalizedDraft.image) changes.push("image");
    if (normalizedDraft.variants.length > 0) changes.push("variants");

    return changes;
  }

  const normalizedProduct = normalizePlatformProductDraft(product);
  const changes: PlatformDraftChangeField[] = [];

  if (normalizedProduct.barcode !== normalizedDraft.barcode) changes.push("barcode");
  if (normalizedProduct.businessActivity !== normalizedDraft.businessActivity) changes.push("businessActivity");
  if (normalizedProduct.name !== normalizedDraft.name) changes.push("name");
  if (normalizedProduct.brand !== normalizedDraft.brand) changes.push("brand");
  if (normalizedProduct.categoryName !== normalizedDraft.categoryName) changes.push("categoryName");
  if (normalizedProduct.description !== normalizedDraft.description) changes.push("description");
  if (normalizedProduct.presentation !== normalizedDraft.presentation) changes.push("presentation");
  if (normalizedProduct.image !== normalizedDraft.image) changes.push("image");
  if (JSON.stringify(normalizedProduct.variants) !== JSON.stringify(normalizedDraft.variants)) changes.push("variants");

  return changes;
}

export function platformDraftDiffers(
  product: PlatformProductDraft | null | undefined,
  draft: PlatformProductDraft,
) {
  if (!product) {
    return true;
  }

  const normalizedProduct = normalizePlatformProductDraft(product);
  const normalizedDraft = normalizePlatformProductDraft(draft);

  return (
    normalizedProduct.barcode !== normalizedDraft.barcode ||
    normalizedProduct.businessActivity !== normalizedDraft.businessActivity ||
    normalizedProduct.name !== normalizedDraft.name ||
    normalizedProduct.brand !== normalizedDraft.brand ||
    normalizedProduct.categoryName !== normalizedDraft.categoryName ||
    normalizedProduct.description !== normalizedDraft.description ||
    normalizedProduct.presentation !== normalizedDraft.presentation ||
    normalizedProduct.image !== normalizedDraft.image ||
    JSON.stringify(normalizedProduct.variants) !== JSON.stringify(normalizedDraft.variants)
  );
}

export async function queuePlatformProductSubmission(args: {
  platformProductId?: string | null;
  submittedByUserId?: string | null;
  submittedFromKioscoId?: string | null;
  barcode?: string | null;
  businessActivity?: string | null;
  name: string;
  brand?: string | null;
  categoryName?: string | null;
  description?: string | null;
  presentation?: string | null;
  image?: string | null;
  variants?: Array<{
    name: string;
    barcode?: string | null;
  }>;
}) {
  const draft = normalizePlatformProductDraft(args);

  const existingPending = await prisma.platformProductSubmission.findFirst({
    where: {
      submittedFromKioscoId: args.submittedFromKioscoId ?? null,
      status: PlatformProductSubmissionStatus.PENDING,
      ...(draft.barcode
        ? { barcode: draft.barcode }
        : args.platformProductId
          ? { platformProductId: args.platformProductId }
          : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existingPending) {
    return prisma.platformProductSubmission.update({
      where: { id: existingPending.id },
      data: {
        name: draft.name,
        businessActivity: draft.businessActivity,
        brand: draft.brand,
        categoryName: draft.categoryName,
        description: draft.description,
        presentation: draft.presentation,
        image: draft.image,
        barcode: draft.barcode,
        platformProductId: args.platformProductId ?? null,
        submittedByUserId: args.submittedByUserId ?? null,
        variants: {
          deleteMany: {},
          create: draft.variants.map((variant) => ({
            name: variant.name,
            barcode: variant.barcode,
          })),
        },
      },
    });
  }

  return prisma.platformProductSubmission.create({
    data: {
      barcode: draft.barcode,
      businessActivity: draft.businessActivity,
      name: draft.name,
      brand: draft.brand,
      categoryName: draft.categoryName,
      description: draft.description,
      presentation: draft.presentation,
      image: draft.image,
      status: PlatformProductSubmissionStatus.PENDING,
      platformProductId: args.platformProductId ?? null,
      submittedByUserId: args.submittedByUserId ?? null,
      submittedFromKioscoId: args.submittedFromKioscoId ?? null,
      variants: {
        create: draft.variants.map((variant) => ({
          name: variant.name,
          barcode: variant.barcode,
        })),
      },
    },
  });
}
