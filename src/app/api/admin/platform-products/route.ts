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
import {
  normalizeCatalogBarcode,
  normalizeCatalogDescription,
  normalizeCatalogOptionalTitle,
  normalizeCatalogTitle,
} from "@/lib/catalog-text";

function cleanText(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function cleanVariants(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : "",
      name: normalizeCatalogTitle(item?.name),
      barcode: normalizeCatalogBarcode(item?.barcode),
    }))
    .filter((variant) => variant.name);
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
  await ensureBusinessActivitiesSeeded();
  const id = typeof body.id === "string" ? body.id : "";
  const barcode = normalizeCatalogBarcode(body.barcode);
  const businessActivity = normalizeBusinessActivityCode(body.businessActivity);
  const name = normalizeCatalogTitle(body.name);
  const brand = normalizeCatalogOptionalTitle(body.brand);
  const categoryName = normalizeCatalogOptionalTitle(body.categoryName);
  const presentation = normalizeCatalogOptionalTitle(body.presentation);
  const description = normalizeCatalogDescription(body.description);
  const image = cleanText(body.image);
  const variants = cleanVariants(body.variants);
  const effectiveBarcode = variants.length > 0 ? null : barcode;
  const status =
    body.status === PlatformProductStatus.HIDDEN
      ? PlatformProductStatus.HIDDEN
      : PlatformProductStatus.APPROVED;

  if (!(await isValidBusinessActivity(businessActivity))) {
    return NextResponse.json({ error: "Elegi un rubro valido." }, { status: 400 });
  }

  if (!name || (!effectiveBarcode && !variants.some((variant) => variant.barcode))) {
    return NextResponse.json(
      { error: "Name and at least one barcode are required" },
      { status: 400 },
    );
  }

  const nonNullVariantBarcodes = variants
    .map((variant) => variant.barcode)
    .filter((item): item is string => Boolean(item));
  const uniqueVariantBarcodes = new Set(nonNullVariantBarcodes);

  if (nonNullVariantBarcodes.length !== uniqueVariantBarcodes.size) {
    return NextResponse.json({ error: "Variant barcodes must be unique" }, { status: 400 });
  }

  const saved = id
    ? await prisma.platformProduct.update({
        where: { id },
        data: {
          barcode: effectiveBarcode,
          businessActivity,
          name,
          brand,
          categoryName,
          presentation,
          description,
          image,
          status,
          variants: {
            deleteMany: { id: { notIn: variants.filter((variant) => variant.id).map((variant) => variant.id) } },
            create: variants
              .filter((variant) => !variant.id)
              .map((variant) => ({
                name: variant.name,
                barcode: variant.barcode,
              })),
            update: variants
              .filter((variant) => variant.id)
              .map((variant) => ({
                where: { id: variant.id },
                data: {
                  name: variant.name,
                  barcode: variant.barcode,
                },
              })),
          },
        },
        include: {
          variants: {
            orderBy: { name: "asc" },
          },
        },
      })
    : effectiveBarcode
      ? await prisma.platformProduct.upsert({
          where: { barcode: effectiveBarcode },
          update: {
            name,
            brand,
            categoryName,
            presentation,
            description,
            image,
            status,
            variants: {
              deleteMany: {},
              create: variants.map((variant) => ({
                name: variant.name,
                barcode: variant.barcode,
              })),
            },
          },
          create: {
            barcode: effectiveBarcode,
            businessActivity,
            name,
            brand,
            categoryName,
            presentation,
            description,
            image,
            status,
            variants: {
              create: variants.map((variant) => ({
                name: variant.name,
                barcode: variant.barcode,
              })),
            },
          },
          include: {
            variants: {
              orderBy: { name: "asc" },
            },
          },
        })
      : await prisma.platformProduct.create({
        data: {
          barcode: effectiveBarcode,
          businessActivity,
          name,
            brand,
            categoryName,
            presentation,
            description,
            image,
            status,
            variants: {
              create: variants.map((variant) => ({
                name: variant.name,
                barcode: variant.barcode,
              })),
            },
          },
          include: {
            variants: {
              orderBy: { name: "asc" },
            },
          },
        });

  await syncAutoProductsFromPlatformProduct(prisma, saved.id);
  revalidatePath("/admin/productos");

  return NextResponse.json({ product: saved });
}
