import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";

import type { BarcodeSuggestion } from "@/lib/barcode-suggestions";
import { DEFAULT_KIOSCO_PRODUCTS } from "@/lib/default-kiosco-catalog";
import { prisma } from "@/lib/prisma";

type PlatformProductDraft = {
  barcode: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  presentation?: string | null;
  image?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

  return prisma.platformProduct.findFirst({
    where: {
      barcode,
      status: PlatformProductStatus.APPROVED,
    },
  });
}

export function platformProductToSuggestion(product: PlatformProductDraft): BarcodeSuggestion {
  return {
    code: product.barcode,
    name: product.name,
    brand: cleanText(product.brand),
    description: cleanText(product.description),
    presentation: cleanText(product.presentation),
    image: cleanText(product.image),
  };
}

export function normalizePlatformProductDraft(draft: PlatformProductDraft) {
  return {
    barcode: draft.barcode.trim(),
    name: draft.name.trim(),
    brand: cleanText(draft.brand),
    description: cleanText(draft.description),
    presentation: cleanText(draft.presentation),
    image: cleanText(draft.image),
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
    normalizedProduct.name !== normalizedDraft.name ||
    normalizedProduct.brand !== normalizedDraft.brand ||
    normalizedProduct.description !== normalizedDraft.description ||
    normalizedProduct.presentation !== normalizedDraft.presentation ||
    normalizedProduct.image !== normalizedDraft.image
  );
}

export async function queuePlatformProductSubmission(args: {
  platformProductId?: string | null;
  submittedByUserId?: string | null;
  submittedFromKioscoId?: string | null;
  barcode: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  presentation?: string | null;
  image?: string | null;
}) {
  const draft = normalizePlatformProductDraft(args);

  const existingPending = await prisma.platformProductSubmission.findFirst({
    where: {
      barcode: draft.barcode,
      submittedFromKioscoId: args.submittedFromKioscoId ?? null,
      status: PlatformProductSubmissionStatus.PENDING,
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
        platformProductId: args.platformProductId ?? null,
        submittedByUserId: args.submittedByUserId ?? null,
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
    },
  });
}
