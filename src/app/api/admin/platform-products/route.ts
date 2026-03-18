import { PlatformProductStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

function cleanText(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
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
  const id = typeof body.id === "string" ? body.id : "";
  const barcode = cleanText(body.barcode);
  const name = cleanText(body.name);
  const brand = cleanText(body.brand);
  const presentation = cleanText(body.presentation);
  const description = cleanText(body.description);
  const image = cleanText(body.image);
  const status =
    body.status === PlatformProductStatus.HIDDEN
      ? PlatformProductStatus.HIDDEN
      : PlatformProductStatus.APPROVED;

  if (!barcode || !name) {
    return NextResponse.json({ error: "Barcode and name are required" }, { status: 400 });
  }

  const saved = id
    ? await prisma.platformProduct.update({
        where: { id },
        data: {
          barcode,
          name,
          brand,
          presentation,
          description,
          image,
          status,
        },
      })
    : await prisma.platformProduct.upsert({
        where: { barcode },
        update: {
          name,
          brand,
          presentation,
          description,
          image,
          status,
        },
        create: {
          barcode,
          name,
          brand,
          presentation,
          description,
          image,
          status,
        },
      });

  revalidatePath("/admin/productos");

  return NextResponse.json({ product: saved });
}
