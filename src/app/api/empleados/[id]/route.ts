import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBranchContext } from "@/lib/branch";

// PATCH /api/empleados/[id] — update employee
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.branchId !== branchId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, pin, active } = await req.json();

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(pin !== undefined && { pin: pin?.trim() || null }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/empleados/[id] — delete employee
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { branchId } = await getBranchContext(req, session.user.id);
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.branchId !== branchId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.employee.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
