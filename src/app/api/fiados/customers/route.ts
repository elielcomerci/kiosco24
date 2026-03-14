import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";

// GET /api/fiados/customers — list customers sorted by recently used
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json([]);

  const customers = await prisma.creditCustomer.findMany({
    where: { branchId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, balance: true, updatedAt: true },
  });

  return NextResponse.json(customers);
}

// POST /api/fiados/customers — create new customer
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { name, phone } = await req.json();

  const customer = await prisma.creditCustomer.create({
    data: { branchId, name, phone: phone ?? null },
  });

  return NextResponse.json(customer);
}
