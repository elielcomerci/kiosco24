import { prisma } from "./prisma";

export async function getBranchContext(req: Request, userId: string): Promise<{ branchId: string | null; kioscoId: string | null }> {
  // 1. Try header (passed by frontend)
  const headerId = req.headers.get("x-branch-id");
  const preferredBranchId = (headerId && headerId !== "undefined") ? headerId : null;

  if (userId.startsWith("emp_")) {
    const realId = userId.replace("emp_", "");
    const employee = await prisma.employee.findUnique({
      where: { id: realId },
      include: {
        branch: { select: { id: true, kioscoId: true } },
      },
    });

    if (!employee) {
      return { branchId: null, kioscoId: null };
    }

    return {
      branchId: employee.branchId,
      kioscoId: employee.branch.kioscoId,
    };
  }

  // 2. Fetch from DB to get default branch AND kioscoId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      kiosco: {
        include: {
          branches: {
            select: { id: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  const kioscoId = user?.kiosco?.id || null;
  const allowedBranchIds = user?.kiosco?.branches.map((branch) => branch.id) ?? [];
  const branchId = preferredBranchId && allowedBranchIds.includes(preferredBranchId)
    ? preferredBranchId
    : (allowedBranchIds[0] ?? null);

  return { branchId, kioscoId };
}

// Keep getBranchId for compatibility or backward refactoring
export async function getBranchId(req: Request, userId: string): Promise<string | null> {
  const { branchId } = await getBranchContext(req, userId);
  return branchId;
}
