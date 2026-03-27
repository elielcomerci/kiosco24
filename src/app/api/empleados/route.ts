import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmployeeRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";
import { InvalidEmployeePinError, isEmployeePinHash, prepareEmployeePinForStorage } from "@/lib/employee-pin";

// GET /api/empleados — list employees for the current branch
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  const canListEmployees =
    session.user.role === "OWNER" ||
    (session.user.role === "EMPLOYEE" && activeOnly);

  if (!canListEmployees) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) return NextResponse.json([], { status: 200 });

  // If it's the POS calling (activeOnly=true), we usually want to filter by the current branch
  // If it's the Admin panel, we want all employees of the Kiosco.
  const filterByBranch = activeOnly && branchId;

  const employees = await prisma.employee.findMany({
    where: { 
      kioscoId,
      ...(filterByBranch ? {
        branches: { some: { id: branchId } }
      } : {}),
      ...(activeOnly ? {
        active: true,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: new Date() } },
        ],
      } : {})
    },
    include: {
      branches: { select: { id: true, name: true } }
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
      role: employee.role,
      branches: employee.branches,
      ...(session.user.role === "OWNER"
        ? {
            active: employee.active,
            suspendedUntil: employee.suspendedUntil,
          }
        : {}),
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

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId)
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });

  try {
    const { name, pin, role, branchIds } = await req.json();

    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    
    if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
      return NextResponse.json({ error: "At least one branch is required" }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: {
        name: name.trim(),
        pin: await prepareEmployeePinForStorage(pin),
        role: (role as EmployeeRole) || EmployeeRole.CASHIER,
        kiosco: {
          connect: { id: kioscoId },
        },
        branches: {
          connect: branchIds.map((id: string) => ({ id })),
        },
      } as any,
      include: {
        branches: { select: { id: true, name: true } }
      },
    });

    return NextResponse.json({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      branches: employee.branches,
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
