import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { syncProductFromPlatform } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, kioscoId },
    select: { id: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  const result = await syncProductFromPlatform(prisma, id);
  if (!result.synced) {
    return NextResponse.json(
      {
        error:
          result.reason === "unlinked"
            ? "Este producto no esta vinculado a la base general."
            : "No encontramos un origen aprobado para sincronizar.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true });
}

