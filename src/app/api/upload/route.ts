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

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Falta configurar BLOB_READ_WRITE_TOKEN en el entorno." },
        { status: 500 },
      );
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
    });
  } catch (error) {
    console.error("Vercel Blob upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
