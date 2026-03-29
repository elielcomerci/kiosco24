import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  syncLinkedProductsFromPlatform,
  type PlatformSyncApplyMode,
} from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";

function normalizeMode(value: unknown): PlatformSyncApplyMode {
  return value === "image" || value === "text" ? value : "all";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Solo el owner puede sincronizar datos desde la base general." },
      { status: 403 },
    );
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = normalizeMode(body?.mode);
  const result = await syncLinkedProductsFromPlatform(prisma, kioscoId, mode);

  return NextResponse.json({
    success: true,
    mode,
    processedProducts: result.processedProducts,
    updatedProducts: result.updatedProducts,
  });
}
