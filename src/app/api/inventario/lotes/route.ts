import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const variantId = searchParams.get("variantId");

  if (!productId) {
    return NextResponse.json({ error: "productId requerido" }, { status: 400 });
  }

  const lots = await prisma.stockLot.findMany({
    where: {
      branchId,
      productId,
      variantId: variantId || null,
      quantity: { gt: 0 },
    },
    orderBy: { expiresOn: "asc" },
    select: {
      id: true,
      quantity: true,
      expiresOn: true,
      variantId: true,
      productId: true,
    },
  });

  return NextResponse.json({ lots });
}
