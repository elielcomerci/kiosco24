import { PlatformProductStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

type BackupVariant = {
  id?: string | null;
  name: string;
  barcode: string | null;
};

function cleanText(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function parseStatus(value: unknown) {
  return value === PlatformProductStatus.HIDDEN
    ? PlatformProductStatus.HIDDEN
    : PlatformProductStatus.APPROVED;
}

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isPlatformAdmin(session.user)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}

export async function GET() {
  const { error } = await ensureAdmin();
  if (error) {
    return error;
  }

  const products = await prisma.platformProduct.findMany({
    include: {
      variants: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
  });

  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    products: products.map((product) => ({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      categoryName: product.categoryName,
      presentation: product.presentation,
      description: product.description,
      image: product.image,
      status: product.status,
      variants: product.variants.map((variant: { name: string; barcode: string | null }) => ({
        id: (variant as { id?: string }).id ?? null,
        name: variant.name,
        barcode: variant.barcode,
      })),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kiosco24-platform-catalog-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}

export async function POST(req: Request) {
  const { error } = await ensureAdmin();
  if (error) {
    return error;
  }

  const body = await req.json().catch(() => ({}));
  const rawProducts = Array.isArray(body.products) ? body.products : [];

  if (rawProducts.length === 0) {
    return NextResponse.json({ error: "No hay productos para importar." }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, rawProduct] of rawProducts.entries()) {
    const productId = cleanText(rawProduct?.id);
    const name = cleanText(rawProduct?.name);
    const barcode = cleanText(rawProduct?.barcode);
    const brand = cleanText(rawProduct?.brand);
    const categoryName = cleanText(rawProduct?.categoryName);
    const presentation = cleanText(rawProduct?.presentation);
    const description = cleanText(rawProduct?.description);
    const image = cleanText(rawProduct?.image);
    const status = parseStatus(rawProduct?.status);
    const variants = Array.isArray(rawProduct?.variants)
      ? rawProduct.variants
          .map((variant: unknown) => ({
            id: cleanText((variant as { id?: unknown })?.id),
            name: cleanText((variant as { name?: unknown })?.name) ?? "",
            barcode: cleanText((variant as { barcode?: unknown })?.barcode),
          }))
          .filter((variant: BackupVariant) => variant.name)
      : [];

    if (!name) {
      skipped += 1;
      errors.push(`Producto ${index + 1}: falta el nombre.`);
      continue;
    }

    const variantBarcodes = variants
      .map((variant: BackupVariant) => variant.barcode)
      .filter((item: string | null): item is string => Boolean(item));
    const uniqueVariantBarcodes = new Set(variantBarcodes);
    const effectiveBarcode = variants.length > 0 ? null : barcode;

    if (variantBarcodes.length !== uniqueVariantBarcodes.size) {
      skipped += 1;
      errors.push(`Producto ${index + 1}: codigos de variante repetidos.`);
      continue;
    }

    if (!effectiveBarcode && variantBarcodes.length === 0) {
      skipped += 1;
      errors.push(`Producto ${index + 1}: falta al menos un codigo.`);
      continue;
    }

    const existing = effectiveBarcode
      ? await prisma.platformProduct.findUnique({
          where: { barcode: effectiveBarcode },
          select: { id: true },
        })
      : productId
        ? await prisma.platformProduct.findUnique({
            where: { id: productId },
            select: { id: true },
          })
      : null;

    await prisma.platformProduct.upsert({
      where: effectiveBarcode ? { barcode: effectiveBarcode } : productId ? { id: productId } : { id: "__no-match__" },
      update: {
        name,
        brand,
        categoryName,
        presentation,
        description,
        image,
        status,
        variants: {
          deleteMany: {
            id: {
              notIn: variants
                .map((variant: BackupVariant) => variant.id)
                .filter((item: string | null | undefined): item is string => Boolean(item)),
            },
          },
          create: variants
            .filter((variant: BackupVariant) => !variant.id)
            .map((variant: BackupVariant) => ({
              name: variant.name,
              barcode: variant.barcode,
            })),
          update: variants
            .filter((variant: BackupVariant) => variant.id)
            .map((variant: BackupVariant) => ({
              where: { id: variant.id! },
              data: {
                name: variant.name,
                barcode: variant.barcode,
              },
            })),
        },
      },
      create: {
        ...(productId ? { id: productId } : {}),
        barcode: effectiveBarcode,
        name,
        brand,
        categoryName,
        presentation,
        description,
        image,
        status,
        variants: {
          create: variants.map((variant: BackupVariant) => ({
            ...(variant.id ? { id: variant.id } : {}),
            name: variant.name,
            barcode: variant.barcode,
          })),
        },
      },
    }).catch(async () => {
      const createdProduct = await prisma.platformProduct.create({
        data: {
          ...(productId ? { id: productId } : {}),
          barcode: effectiveBarcode,
          name,
          brand,
          categoryName,
          presentation,
          description,
          image,
          status,
          variants: {
            create: variants.map((variant: BackupVariant) => ({
              ...(variant.id ? { id: variant.id } : {}),
              name: variant.name,
              barcode: variant.barcode,
            })),
          },
        },
      });

      return createdProduct;
    });

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
    errors: errors.slice(0, 20),
  });
}
