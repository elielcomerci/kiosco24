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
      select: {
        id: true,
        name: true,
        employees: {
          where: { active: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            pin: true,
            suspendedUntil: true,
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: "Codigo invalido" }, { status: 404 });
    }

    const employees = branch.employees
      .filter((employee) => {
        if (employee.suspendedUntil && employee.suspendedUntil > new Date()) {
          return false;
        }
        return true;
      })
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        hasPin: Boolean(employee.pin),
      }));

    return NextResponse.json({
      branchId: branch.id,
      branchName: branch.name,
      employees,
    });
  } catch (error) {
    console.error("Error fetching employees by access key:", error);
    return NextResponse.json({ error: "No se pudo consultar la sucursal" }, { status: 500 });
  }
}
