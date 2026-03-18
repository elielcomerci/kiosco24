import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  try {
    const branch = await prisma.branch.findUnique({
      where: { accessKey: key },
      include: {
        employees: {
          select: {
            id: true,
            name: true,
            active: true,
            suspendedUntil: true,
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: "Código inválido" }, { status: 404 });
    }

    // Filter active and non-suspended employees
    const activeEmployees = branch.employees.filter((e) => {
      if (!e.active) return false;
      if (e.suspendedUntil && e.suspendedUntil > new Date()) return false;
      return true;
    });

    return NextResponse.json({
      branchName: branch.name,
      employees: activeEmployees,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}
