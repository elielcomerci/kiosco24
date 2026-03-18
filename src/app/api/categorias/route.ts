import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

// GET /api/categorias
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const categories = await prisma.category.findMany({
    where: { kioscoId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

// POST /api/categorias
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const data = await req.json();

  if (!data.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      name: data.name,
      color: data.color || null,
      showInGrid: data.showInGrid !== undefined ? data.showInGrid : true,
      kioscoId: kiosco.id,
    },
  });

  return NextResponse.json(category);
}
