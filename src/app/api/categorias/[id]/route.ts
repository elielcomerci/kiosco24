import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH /api/categorias/[id]
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const { id } = params;
  const data = await req.json();

  // Verify ownership
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.kioscoId !== kiosco.id) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      name: data.name !== undefined ? data.name : undefined,
      color: data.color !== undefined ? data.color : undefined,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/categorias/[id]
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const { id } = params;

  // Verify ownership
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category || category.kioscoId !== kiosco.id) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  await prisma.category.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
