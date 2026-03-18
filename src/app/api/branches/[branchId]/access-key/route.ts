import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId } = await params;

  // Generate a random high-entropy key
  const accessKey = `KIOSCO-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        kiosco: {
          ownerId: session.user.id,
        },
      },
      select: { id: true },
    });

    if (!branch) {
      return NextResponse.json({ error: "Sucursal no encontrada o sin permisos" }, { status: 404 });
    }

    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data: { accessKey },
    });

    return NextResponse.json({ accessKey: updatedBranch.accessKey });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }
}
