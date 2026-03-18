import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

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
      ...(activeOnly ? { active: true } : {})
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(employees);
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

  const { name, pin } = await req.json();

  if (!name?.trim())
    return NextResponse.json({ error: "Name required" }, { status: 400 });

  const employee = await prisma.employee.create({
    data: {
      name: name.trim(),
      pin: pin?.trim() || null,
      branchId,
    },
  });

  return NextResponse.json(employee);
}
