import { prisma } from "./prisma";

export async function getBranchContext(req: Request, userId: string): Promise<{ branchId: string | null; kioscoId: string | null }> {
  // 1. Try header (passed by frontend)
  const headerId = req.headers.get("x-branch-id");
  
  let branchId: string | null = (headerId && headerId !== "undefined") ? headerId : null;
  let kioscoId: string | null = null;

  if (userId.startsWith("emp_")) {
    const realId = userId.replace("emp_", "");
    const employee = await prisma.employee.findUnique({
      where: { id: realId },
      include: {
        branch: {
          include: { kiosco: true }
        }
      }
    });
    if (employee) {
      kioscoId = employee.branch.kiosco.id;
      if (!branchId) branchId = employee.branchId;
    }
  } else {
    // 2. Fetch from DB to get default branch AND kioscoId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        kiosco: {
          include: { branches: true }
        }
      }
    });

    kioscoId = user?.kiosco?.id || null;
    if (!branchId) branchId = user?.kiosco?.branches[0]?.id || null;
  }

  return { branchId, kioscoId };
}

// Keep getBranchId for compatibility or backward refactoring
export async function getBranchId(req: Request, userId: string): Promise<string | null> {
  const { branchId } = await getBranchContext(req, userId);
  return branchId;
}
