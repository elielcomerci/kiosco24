import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getActiveShift } from "@/lib/shift-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { id } = await params;
  const activeShift = await getActiveShift(branchId);

  const updated = await prisma.shiftReminder.updateMany({
    where: {
      id,
      branchId,
      shownAt: null,
    },
    data: {
      shownAt: new Date(),
      shownToShiftId: activeShift?.id ?? null,
    },
  });

  if (updated.count !== 1) {
    return NextResponse.json({ error: "Recordatorio no encontrado o ya mostrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
