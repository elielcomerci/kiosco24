import { auth } from "@/lib/auth";
import { formatBranchAccessKey } from "@/lib/branch-access-key";
import { guardSetupAccess } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { branchId } = await params;

  try {
    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        kiosco: {
          ownerId: session.user.id,
        },
      },
      select: {
        id: true,
        kiosco: {
          select: {
            mainBusinessActivity: true,
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: "Sucursal no encontrada o sin permisos" }, { status: 404 });
    }

    const generateAccessKey = () =>
      formatBranchAccessKey(
        branch.kiosco.mainBusinessActivity,
        crypto.randomBytes(4).toString("hex"),
        crypto.randomBytes(4).toString("hex"),
      );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const updatedBranch = await prisma.branch.update({
          where: { id: branchId },
          data: { accessKey: generateAccessKey() },
        });

        return NextResponse.json({ accessKey: updatedBranch.accessKey });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }

        throw error;
      }
    }

    return NextResponse.json({ error: "No se pudo generar un codigo unico." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }
}
