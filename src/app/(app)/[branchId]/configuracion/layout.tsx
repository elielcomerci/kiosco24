import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ConfigurationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "OWNER") {
    const { branchId } = await params;
    redirect(`/${branchId}/caja`);
  }

  return children;
}
