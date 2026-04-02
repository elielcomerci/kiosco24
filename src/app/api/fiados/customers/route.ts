import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";

// GET /api/fiados/customers — list customers sorted by recently used
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.role === "EMPLOYEE" && session.user.employeeRole === "CASHIER";

  // CASHIER, OWNER y MANAGER pueden ver la lista de fiados (es operativo)
  if (!isOwner && !isManager && !isCashier) {
    return NextResponse.json({ error: "No tenés permiso para ver la lista de fiados." }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json([]);

  const customers = await prisma.creditCustomer.findMany({
    where: { branchId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, balance: true, updatedAt: true },
  });

  return NextResponse.json(customers);
}

// POST /api/fiados/customers — create new customer
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "El nombre del cliente es obligatorio." }, { status: 400 });
  }

  const customer = await prisma.creditCustomer.create({
    data: { branchId, name, phone: phone || null },
    select: { id: true, name: true, phone: true, balance: true, updatedAt: true },
  });

  return NextResponse.json(customer);
}
