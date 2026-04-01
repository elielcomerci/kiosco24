import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireOwnerBranchPage(
  params: Promise<{ branchId: string }>
): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { branchId } = await params;
  if (session.user.role !== "OWNER") {
    redirect(`/${branchId}/caja`);
  }

  return branchId;
}

// Para páginas operativas que también pueden usar empleados (CASHIER y MANAGER)
export async function requireOperativeBranchPage(
  params: Promise<{ branchId: string }>
): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { branchId } = await params;
  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";
  const isCashier = session.user.role === "EMPLOYEE" && session.user.employeeRole === "CASHIER";

  if (!isOwner && !isManager && !isCashier) {
    redirect(`/${branchId}/caja`);
  }

  return branchId;
}
