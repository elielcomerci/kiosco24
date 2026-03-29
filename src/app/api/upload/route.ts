import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function sanitizeSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function getSafeFolder(rawFolder: string | null) {
  const allowedFolders = new Set(["products", "branding", "uploads"]);
  return rawFolder && allowedFolders.has(rawFolder) ? rawFolder : "uploads";
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

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessResponse = await guardOperationalAccess(session.user);
    if (accessResponse) {
      return accessResponse;
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = getSafeFolder(formData.get("folder")?.toString() ?? null);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Solo se permiten imagenes." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "La imagen supera el maximo de 8 MB." }, { status: 400 });
    }

    const extensionFromType = file.type.split("/")[1] || "png";
    const originalName = file.name || `image.${extensionFromType}`;
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(originalName);
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const safeBaseName = sanitizeSegment(baseName, "image");
    const safeExtension = sanitizeSegment(hasExtension ? originalName.split(".").pop() || extensionFromType : extensionFromType, extensionFromType);
    const pathname = `${folder}/${safeBaseName}.${safeExtension}`;
    const r2Config = getR2Config();

    if (r2Config) {
      const key = `${folder}/${crypto.randomUUID()}-${safeBaseName}.${safeExtension}`;
      const client = getR2Client(r2Config);

      await client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucket,
          Key: key,
          Body: Buffer.from(await file.arrayBuffer()),
          ContentType: file.type,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      const url = buildR2Url(r2Config.publicBaseUrl, key);

      return NextResponse.json({
        url,
        secure_url: url,
        pathname: key,
        contentType: file.type,
        storage: "r2",
      });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Falta configurar R2 o BLOB_READ_WRITE_TOKEN en el entorno." },
        { status: 500 },
      );
    }

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({
      url: blob.url,
      secure_url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      storage: "blob",
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
