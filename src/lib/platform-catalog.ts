import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";

import type { BarcodeSuggestion } from "@/lib/barcode-suggestions";
import { DEFAULT_KIOSCO_PRODUCTS } from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";

type PlatformProductDraft = {
  barcode?: string | null;
  name: string;
  brand?: string | null;
  description?: string | null;
  presentation?: string | null;
  image?: string | null;
  variants?: Array<{
    name: string;
    barcode?: string | null;
  }>;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

export async function ensurePlatformCatalogSeeded() {
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
            name: product.name,
            brand: product.brand ?? null,
            description: product.description ?? null,
            presentation: product.presentation ?? null,
            image: null,
            status: PlatformProductStatus.APPROVED,
          },
          create: {
            barcode: product.barcode,
            name: product.name,
            brand: product.brand ?? null,
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

export async function findApprovedPlatformProductByBarcode(barcode: string) {
  await ensurePlatformCatalogSeeded();

  const directMatch = await prisma.platformProduct.findFirst({
    where: {
      barcode,
      status: PlatformProductStatus.APPROVED,
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

export function platformProductToSuggestion(product: PlatformProductDraft): BarcodeSuggestion {
  const normalizedVariants = normalizeVariants(product.variants);

  return {
    code: cleanText(product.barcode) ?? normalizedVariants[0]?.barcode ?? "",
    name: product.name,
    brand: cleanText(product.brand),
    description: cleanText(product.description),
    presentation: cleanText(product.presentation),
    image: cleanText(product.image),
    variants: normalizedVariants,
  };
}

export function normalizePlatformProductDraft(draft: PlatformProductDraft) {
  return {
    barcode: cleanText(draft.barcode),
    name: draft.name.trim(),
    brand: cleanText(draft.brand),
    description: cleanText(draft.description),
    presentation: cleanText(draft.presentation),
    image: cleanText(draft.image),
    variants: normalizeVariants(draft.variants),
  };
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
    normalizedProduct.name !== normalizedDraft.name ||
    normalizedProduct.brand !== normalizedDraft.brand ||
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
  name: string;
  brand?: string | null;
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
        brand: draft.brand,
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
      name: draft.name,
      brand: draft.brand,
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
