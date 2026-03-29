import { PlatformProductStatus, PlatformSyncMode, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type SyncDbClient = Prisma.TransactionClient | typeof prisma;

type SyncablePlatformProduct = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  status: PlatformProductStatus;
  updatedAt: Date;
};

type SyncableLocalProduct = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  platformProductId: string | null;
  platformSyncMode: PlatformSyncMode;
  platformSourceUpdatedAt: Date | null;
  variants?: Array<{ id: string }>;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeName(value: string | null | undefined) {
  return normalizeText(value) ?? "";
}

function normalizeSyncFields(args: {
  barcode: string | null | undefined;
  name: string | null | undefined;
  brand: string | null | undefined;
  description: string | null | undefined;
  presentation: string | null | undefined;
  image: string | null | undefined;
  compareBarcode: boolean;
}) {
  return {
    barcode: args.compareBarcode ? normalizeText(args.barcode) : null,
    name: normalizeName(args.name),
    brand: normalizeText(args.brand),
    description: normalizeText(args.description),
    presentation: normalizeText(args.presentation),
    image: normalizeText(args.image),
  };
}

function productUsesBaseBarcode(product: Pick<SyncableLocalProduct, "variants">) {
  return !product.variants || product.variants.length === 0;
}

export function buildPlatformSyncUpdateData(
  product: Pick<SyncableLocalProduct, "variants">,
  platformProduct: SyncablePlatformProduct,
): Prisma.ProductUpdateInput {
  return {
    name: normalizeName(platformProduct.name),
    brand: normalizeText(platformProduct.brand),
    description: normalizeText(platformProduct.description),
    presentation: normalizeText(platformProduct.presentation),
    image: normalizeText(platformProduct.image),
    platformSourceUpdatedAt: platformProduct.updatedAt,
    ...(productUsesBaseBarcode(product)
      ? { barcode: normalizeText(platformProduct.barcode) }
      : {}),
  };
}

export function hasPlatformSyncUpdate(args: {
  product: SyncableLocalProduct;
  platformProduct: SyncablePlatformProduct | null | undefined;
}) {
  const { product, platformProduct } = args;
  if (!platformProduct || product.platformProductId !== platformProduct.id) {
    return false;
  }

  if (platformProduct.status !== PlatformProductStatus.APPROVED) {
    return false;
  }

  if (product.platformSourceUpdatedAt) {
    return platformProduct.updatedAt.getTime() > product.platformSourceUpdatedAt.getTime();
  }

  const compareBarcode = productUsesBaseBarcode(product);
  const localFields = normalizeSyncFields({
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    description: product.description,
    presentation: product.presentation,
    image: product.image,
    compareBarcode,
  });
  const remoteFields = normalizeSyncFields({
    barcode: platformProduct.barcode,
    name: platformProduct.name,
    brand: platformProduct.brand,
    description: platformProduct.description,
    presentation: platformProduct.presentation,
    image: platformProduct.image,
    compareBarcode,
  });

  return JSON.stringify(localFields) !== JSON.stringify(remoteFields);
}

async function getPlatformProductForSync(client: SyncDbClient, platformProductId: string) {
  return client.platformProduct.findUnique({
    where: { id: platformProductId },
    select: {
      id: true,
      barcode: true,
      name: true,
      brand: true,
      description: true,
      presentation: true,
      image: true,
      status: true,
      updatedAt: true,
    },
  });
}

export async function syncProductFromPlatform(client: SyncDbClient, productId: string) {
  const product = await client.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      barcode: true,
      name: true,
      brand: true,
      description: true,
      presentation: true,
      image: true,
      platformProductId: true,
      platformSyncMode: true,
      platformSourceUpdatedAt: true,
      variants: { select: { id: true } },
    },
  });

  if (!product?.platformProductId) {
    return { synced: false, reason: "unlinked" as const };
  }

  const platformProduct = await getPlatformProductForSync(client, product.platformProductId);
  if (!platformProduct || platformProduct.status !== PlatformProductStatus.APPROVED) {
    return { synced: false, reason: "missing_source" as const };
  }

  await client.product.update({
    where: { id: product.id },
    data: buildPlatformSyncUpdateData(product, platformProduct),
  });

  return { synced: true as const, platformProduct };
}

export async function syncAutoProductsFromPlatformProduct(
  client: SyncDbClient,
  platformProductId: string,
) {
  const platformProduct = await getPlatformProductForSync(client, platformProductId);
  if (!platformProduct || platformProduct.status !== PlatformProductStatus.APPROVED) {
    return 0;
  }

  const linkedProducts = await client.product.findMany({
    where: {
      platformProductId,
      platformSyncMode: PlatformSyncMode.AUTO,
    },
    select: {
      id: true,
      variants: { select: { id: true } },
    },
  });

  if (linkedProducts.length === 0) {
    return 0;
  }

  await Promise.all(
    linkedProducts.map((product) =>
      client.product.update({
        where: { id: product.id },
        data: buildPlatformSyncUpdateData(product, platformProduct),
      }),
    ),
  );

  return linkedProducts.length;
}

