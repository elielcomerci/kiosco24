import { prisma } from "./prisma";

export async function getBranchContext(req: Request, userId: string): Promise<{ branchId: string | null; kioscoId: string | null }> {
  // 1. Try header (passed by frontend)
  const headerId = req.headers.get("x-branch-id");
  
  // 2. Fetch from DB to get default branch AND kioscoId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      kiosco: {
        include: { branches: true }
      }
    }
  });

  const kioscoId = user?.kiosco?.id || null;
  const branchId = (headerId && headerId !== "undefined") 
    ? headerId 
    : (user?.kiosco?.branches[0]?.id || null);

  return { branchId, kioscoId };
}

// Keep getBranchId for compatibility or backward refactoring
export async function getBranchId(req: Request, userId: string): Promise<string | null> {
  const { branchId } = await getBranchContext(req, userId);
  return branchId;
}
