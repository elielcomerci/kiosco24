import { PlatformProductStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  ensureBusinessActivitiesSeeded,
  isValidBusinessActivity,
} from "@/lib/business-activities-store";
import { normalizeBusinessActivityCode } from "@/lib/business-activities";

function cleanCell(value: string | undefined) {
  const trimmed = (value ?? "").trim().replace(/^"|"$/g, "");
  return trimmed || null;
}

function parseStatus(value: string | null) {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === PlatformProductStatus.HIDDEN || normalized === "OCULTO") {
    return PlatformProductStatus.HIDDEN;
  }

  return PlatformProductStatus.APPROVED;
}

function looksLikeHeader(barcode: string | null, name: string | null) {
  const normalizedBarcode = (barcode ?? "").trim().toLowerCase();
  const normalizedName = (name ?? "").trim().toLowerCase();

  return (
    ["barcode", "codigo", "codigo de barras", "ean"].includes(normalizedBarcode) &&
    ["name", "nombre", "producto"].includes(normalizedName)
  );
}

function parseLine(line: string) {
  const separator = line.includes(";")
    ? ";"
    : line.includes("\t")
      ? "\t"
      : line.includes(",")
        ? ","
        : null;

  if (!separator) {
    return null;
  }

  const cells = line.split(separator);
  const [barcode, name, brand, categoryName, presentation, description, image, status] =
    cells.length >= 8
      ? cells
      : [cells[0], cells[1], cells[2], undefined, cells[3], cells[4], cells[5], cells[6]];
  const cleanedBarcode = cleanCell(barcode);
  const cleanedName = cleanCell(name);

  if (looksLikeHeader(cleanedBarcode, cleanedName)) {
    return { skip: true } as const;
  }

  return {
    barcode: cleanedBarcode,
    name: cleanedName,
    brand: cleanCell(brand),
    categoryName: cleanCell(categoryName),
    presentation: cleanCell(presentation),
    description: cleanCell(description),
    image: cleanCell(image),
    status: parseStatus(cleanCell(status)),
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.raw === "string" ? body.raw : "";
  await ensureBusinessActivitiesSeeded();
  const targetBusinessActivity = normalizeBusinessActivityCode(body.businessActivity);
  const lines = raw
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return NextResponse.json({ error: "No hay filas para importar." }, { status: 400 });
  }

  if (!(await isValidBusinessActivity(targetBusinessActivity))) {
    return NextResponse.json({ error: "Elegi un rubro valido." }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, line] of lines.entries()) {
    const parsed = parseLine(line);
    if (!parsed) {
      skipped += 1;
      errors.push(`Fila ${index + 1}: formato invalido.`);
      continue;
    }

    if ("skip" in parsed) {
      skipped += 1;
      continue;
    }

    if (!parsed.barcode || !parsed.name) {
      skipped += 1;
      errors.push(`Fila ${index + 1}: barcode y nombre son obligatorios.`);
      continue;
    }

    const existing = await prisma.platformProduct.findUnique({
      where: { barcode: parsed.barcode },
      select: { id: true },
    });

    const saved = await prisma.platformProduct.upsert({
      where: { barcode: parsed.barcode },
      update: {
        businessActivity: targetBusinessActivity,
        name: parsed.name,
        brand: parsed.brand,
        categoryName: parsed.categoryName,
        presentation: parsed.presentation,
        description: parsed.description,
        image: parsed.image,
        status: parsed.status,
      },
      create: {
        barcode: parsed.barcode,
        businessActivity: targetBusinessActivity,
        name: parsed.name,
        brand: parsed.brand,
        categoryName: parsed.categoryName,
        presentation: parsed.presentation,
        description: parsed.description,
        image: parsed.image,
        status: parsed.status,
      },
      select: { id: true },
    });

    await syncAutoProductsFromPlatformProduct(prisma, saved.id);

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  revalidatePath("/admin/productos");

  return NextResponse.json({
    created,
    updated,
    skipped,
    errors: errors.slice(0, 10),
  });
}
