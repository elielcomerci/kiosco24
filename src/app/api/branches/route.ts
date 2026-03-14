import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/branches — Lista todas las sucursales del usuario logueado
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const kiosco = await prisma.kiosco.findUnique({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        branches: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!kiosco) {
      return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ branches: kiosco.branches });
  } catch (error) {
    console.error("Error fetching branches:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/branches — Crea una nueva sucursal y la provisiona con el catálogo
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { name, logoUrl, primaryColor } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "El nombre de la sucursal es requerido" }, { status: 400 });
    }

    // Buscar el Kiosco del usuario 
    const kiosco = await prisma.kiosco.findUnique({
      where: { ownerId: session.user.id },
      include: {
        products: true // Traemos los productos globales para provisionar
      }
    });

    if (!kiosco) {
      return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
    }

    // 1. Crear la sucursal
    const newBranch = await prisma.branch.create({
      data: {
        name,
        logoUrl,
        primaryColor,
        kioscoId: kiosco.id
      }
    });

    // 2. Provisionar el catálogo global en la nueva sucursal (stock 0)
    // El precio sugerido se extrae desde sugeridos hardcodeados al inicio de Onboarding pero 
    // en sucursales subsecuentes el dueño debería setear los precios propios o copiar el costo
    if (kiosco.products.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: kiosco.products.map(product => ({
          productId: product.id,
          branchId: newBranch.id,
          price: 0, // Precio y costo en 0 por defecto hasta que lo configure en la nueva sucursal
          cost: 0,
          stock: 0,
          showInGrid: true, // Visible por defecto
        }))
      });
    }

    return NextResponse.json({ branch: newBranch }, { status: 201 });
  } catch (error) {
    console.error("Error creating branch:", error);
    return NextResponse.json({ error: "Error interno al crear sucursal" }, { status: 500 });
  }
}
