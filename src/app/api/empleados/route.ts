import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";
import { InvalidEmployeePinError, isEmployeePinHash, prepareEmployeePinForStorage } from "@/lib/employee-pin";

// GET /api/empleados — list employees for the current branch
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) return NextResponse.json([], { status: 200 });

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  const employees = await prisma.employee.findMany({
    where: { 
      branchId,
      ...(activeOnly ? {
        active: true,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: new Date() } },
        ],
      } : {})
    },
    select: {
      id: true,
      name: true,
      pin: true,
      active: true,
      suspendedUntil: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const legacyPinEmployees = employees.filter((employee) => employee.pin && !isEmployeePinHash(employee.pin));
  if (legacyPinEmployees.length > 0) {
    await Promise.all(
      legacyPinEmployees.map(async (employee) => {
        try {
          await prisma.employee.update({
            where: { id: employee.id },
            data: { pin: await prepareEmployeePinForStorage(employee.pin) },
          });
        } catch (error) {
          console.error("Error migrating legacy employee PIN:", employee.id, error);
        }
      })
    );
  }

  return NextResponse.json(
    employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      active: employee.active,
      suspendedUntil: employee.suspendedUntil,
      hasPin: Boolean(employee.pin),
    }))
  );
}

// POST /api/empleados — create a new employee
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId)
    return NextResponse.json({ error: "No branch" }, { status: 404 });

  try {
    const { name, pin } = await req.json();

    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 });

    const employee = await prisma.employee.create({
      data: {
        name: name.trim(),
        pin: await prepareEmployeePinForStorage(pin),
        branchId,
      },
      select: {
        id: true,
        name: true,
        active: true,
        suspendedUntil: true,
        pin: true,
      },
    });

    return NextResponse.json({
      id: employee.id,
      name: employee.name,
      active: employee.active,
      suspendedUntil: employee.suspendedUntil,
      hasPin: Boolean(employee.pin),
    });
  } catch (error) {
    if (error instanceof InvalidEmployeePinError) {
      return NextResponse.json({ error: "El PIN debe tener entre 1 y 6 digitos numericos." }, { status: 400 });
    }

    console.error("Error creating employee:", error);
    return NextResponse.json({ error: "No se pudo crear el empleado." }, { status: 500 });
  }
}
