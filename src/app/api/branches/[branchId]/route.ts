import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH /api/branches/[branchId] - Actualizar datos visuales de la sucursal
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { branchId } = await params;
    const { logoUrl, primaryColor, bgColor, name } = await req.json();

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        kiosco: {
          ownerId: session.user.id,
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: "Sucursal no encontrada o sin permisos" }, { status: 404 });
    }

    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(bgColor !== undefined && { bgColor }),
      },
    });

    return NextResponse.json(updatedBranch);
  } catch (error) {
    console.error("Error updating branch:", error);
    return NextResponse.json({ error: "Error interno al actualizar sucursal" }, { status: 500 });
  }
}
