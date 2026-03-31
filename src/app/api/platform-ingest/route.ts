import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PlatformProductStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  normalizeCatalogBarcode,
  normalizeCatalogDescription,
  normalizeCatalogOptionalTitle,
  normalizeCatalogTitle,
} from "@/lib/catalog-text";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function sanitizeSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function getIngestToken() {
  return process.env.PLATFORM_INGEST_TOKEN?.trim() || "";
}

function isAuthorized(request: Request) {
  const token = getIngestToken();
  if (!token) {
    return false;
  }

  return request.headers.get("x-platform-ingest-token") === token;
}

function getR2Config() {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() || null;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

function getR2Client(config: NonNullable<ReturnType<typeof getR2Config>>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function buildR2Url(baseUrl: string | null, key: string) {
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, "")}/${key}`;
  }

  return key;
}

function isLocalMediaUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }

  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (publicBaseUrl && trimmed.startsWith(publicBaseUrl)) {
    return true;
  }

  return trimmed.includes("media.zap.com.ar/");
}

async function localizeRemoteImage(imageUrl: string, barcode: string | null, name: string) {
  if (!imageUrl) {
    return null;
  }

  const config = getR2Config();
  if (!config) {
    return null;
  }

  const response = await fetch(imageUrl, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("No se pudo descargar la imagen remota.");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const baseName = sanitizeSegment(barcode || name, "platform-product");
  const key = `products/${baseName}-${crypto.randomUUID()}.${extension}`;
  const client = getR2Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: Buffer.from(await response.arrayBuffer()),
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return buildR2Url(config.publicBaseUrl, key);
}

async function findPlatformProductByBarcode(barcode: string) {
  const direct = await prisma.platformProduct.findUnique({
    where: { barcode },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (direct) {
    return {
      ownerType: "product" as const,
      product: direct,
      matchedVariant: null,
    };
  }

  const viaVariant = await prisma.platformProduct.findFirst({
    where: {
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

  if (!viaVariant) {
    return null;
  }

  return {
    ownerType: "variant" as const,
    product: viaVariant,
    matchedVariant: viaVariant.variants.find((variant) => variant.barcode === barcode) ?? null,
  };
}

function toRemoteProductPayload(
  match: NonNullable<Awaited<ReturnType<typeof findPlatformProductByBarcode>>>,
) {
  return {
    id: match.product.id,
    barcode: match.product.barcode,
    name: match.product.name,
    brand: match.product.brand,
    categoryName: match.product.categoryName,
    presentation: match.product.presentation,
    description: match.product.description,
    image: match.product.image,
    status: match.product.status,
    updatedAt: match.product.updatedAt.toISOString(),
    matchedVariant: match.matchedVariant
      ? {
          id: match.matchedVariant.id,
          name: match.matchedVariant.name,
          barcode: match.matchedVariant.barcode,
        }
      : null,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = getIngestToken();
  if (!token) {
    return NextResponse.json({ error: "PLATFORM_INGEST_TOKEN no configurado." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const barcode = normalizeCatalogBarcode(searchParams.get("barcode"));
  if (!barcode) {
    return NextResponse.json({ error: "Barcode requerido." }, { status: 400 });
  }

  const match = await findPlatformProductByBarcode(barcode);
  if (!match) {
    return NextResponse.json({
      found: false,
      ownerType: null,
      product: null,
    });
  }

  return NextResponse.json({
    found: true,
    ownerType: match.ownerType,
    product: toRemoteProductPayload(match),
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = getIngestToken();
  if (!token) {
    return NextResponse.json({ error: "PLATFORM_INGEST_TOKEN no configurado." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const barcode = normalizeCatalogBarcode(body.barcode);
  const name = normalizeCatalogTitle(body.name);
  const brand = normalizeCatalogOptionalTitle(body.brand);
  const categoryName = normalizeCatalogOptionalTitle(body.categoryName);
  const presentation = normalizeCatalogOptionalTitle(body.presentation);
  const description = normalizeCatalogDescription(body.description);
  const image = typeof body.image === "string" ? body.image.trim() || null : null;
  const imageSourceUrl =
    typeof body.imageSourceUrl === "string" ? body.imageSourceUrl.trim() || null : null;
  const status =
    body.status === PlatformProductStatus.HIDDEN
      ? PlatformProductStatus.HIDDEN
      : PlatformProductStatus.APPROVED;

  if (!barcode || !name) {
    return NextResponse.json(
      { error: "barcode y name son obligatorios." },
      { status: 400 },
    );
  }

  const existing = await findPlatformProductByBarcode(barcode);
  if (existing?.ownerType === "variant") {
    return NextResponse.json(
      {
        error:
          "Ese barcode ya existe como variante en la base colaborativa. Revisalo manualmente en el editor admin.",
        remote: {
          found: true,
          ownerType: existing.ownerType,
          product: toRemoteProductPayload(existing),
        },
      },
      { status: 409 },
    );
  }

  let localizedImage = image;
  if (!localizedImage && imageSourceUrl) {
    localizedImage = await localizeRemoteImage(imageSourceUrl, barcode, name);
  } else if (localizedImage && !isLocalMediaUrl(localizedImage) && imageSourceUrl) {
    localizedImage = await localizeRemoteImage(imageSourceUrl, barcode, name);
  }

  const saved = await prisma.platformProduct.upsert({
    where: { barcode },
    update: {
      name,
      brand,
      categoryName,
      presentation,
      description,
      image: localizedImage,
      status,
    },
    create: {
      barcode,
      name,
      brand,
      categoryName,
      presentation,
      description,
      image: localizedImage,
      status,
    },
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
  });

  await syncAutoProductsFromPlatformProduct(prisma, saved.id);
  revalidatePath("/admin/productos");

  return NextResponse.json({
    product: {
      id: saved.id,
      barcode: saved.barcode,
      name: saved.name,
      brand: saved.brand,
      categoryName: saved.categoryName,
      presentation: saved.presentation,
      description: saved.description,
      image: saved.image,
      status: saved.status,
      updatedAt: saved.updatedAt.toISOString(),
    },
    localizedImage: saved.image,
  });
}
