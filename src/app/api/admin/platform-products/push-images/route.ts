import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { pushPlatformImagesToLinkedProducts } from "@/lib/platform-product-sync";
import { revalidatePath } from "next/cache";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await pushPlatformImagesToLinkedProducts(prisma);
  revalidatePath("/admin/productos");

  return NextResponse.json(result);
}
