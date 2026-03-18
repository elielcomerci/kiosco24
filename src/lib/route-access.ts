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
