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
  const normalizedName = typeof data.name === "string" ? data.name.trim() : "";

  if (!normalizedName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const existingCategories = await prisma.category.findMany({
    where: { kioscoId: kiosco.id },
    orderBy: { name: "asc" },
  });
  const existingCategory =
    existingCategories.find(
      (category) =>
        category.name.trim().toLocaleLowerCase("es-AR") ===
        normalizedName.toLocaleLowerCase("es-AR"),
    ) ?? null;

  if (existingCategory) {
    return NextResponse.json(existingCategory);
  }

  const category = await prisma.category.create({
    data: {
      name: normalizedName,
      color: data.color || null,
      showInGrid: data.showInGrid !== undefined ? data.showInGrid : true,
      businessActivities: data.businessActivities || ["KIOSCO"],
      kioscoId: kiosco.id,
    },
  });

  return NextResponse.json(category);
}
