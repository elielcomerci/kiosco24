import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { getBranchId } from "@/lib/branch";

// POST /api/retiros
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { amount, note } = await req.json();

  const activeShift = await prisma.shift.findFirst({
    where: { branchId, closedAt: null },
    orderBy: { openedAt: "desc" },
  });

  const retiro = await prisma.withdrawal.create({
    data: {
      branchId,
      amount: Number(amount),
      note,
      shiftId: activeShift?.id ?? null,
      createdByEmployeeId: (session?.user as any)?.employeeId || null,
    },
  });

  return NextResponse.json(retiro);
}
