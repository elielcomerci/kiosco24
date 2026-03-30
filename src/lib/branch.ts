import { UserRole } from "@prisma/client";

import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "./access-control";
import { prisma } from "./prisma";

export async function getBranchContext(req: Request, userId: string): Promise<{ branchId: string | null; kioscoId: string | null }> {
  // 1. Try header (passed by frontend)
  const headerId = req.headers.get("x-branch-id");
  const preferredBranchId = (headerId && headerId !== "undefined") ? headerId : null;

  const access = await getKioscoAccessContextForSession(
    userId.startsWith("emp_")
      ? {
          id: userId,
          role: UserRole.EMPLOYEE,
          employeeId: userId.replace("emp_", ""),
          branchId: preferredBranchId ?? undefined,
        }
      : {
          id: userId,
          role: UserRole.OWNER,
        },
  );

  const sessionLike =
    userId.startsWith("emp_")
      ? {
          id: userId,
          role: UserRole.EMPLOYEE,
        }
      : {
          id: userId,
          role: UserRole.OWNER,
        };

  if (!access.allowed && !canAccessSetupWithoutSubscription(sessionLike, access)) {
    return { branchId: null, kioscoId: access.kioscoId };
  }

  if (userId.startsWith("emp_")) {
    const realId = userId.replace("emp_", "");
    const employee = await prisma.employee.findUnique({
      where: { id: realId },
      include: {
        branches: { 
          where: preferredBranchId ? { id: preferredBranchId } : undefined,
          take: 1,
          select: { id: true, kioscoId: true } 
        },
      },
    });

    if (!employee || employee.branches.length === 0) {
      return { branchId: null, kioscoId: null };
    }

    return {
      branchId: employee.branches[0].id,
      kioscoId: employee.branches[0].kioscoId,
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
