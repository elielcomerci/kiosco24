import { requireOwnerBranchPage } from "@/lib/route-access";

export default async function CreditLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  await requireOwnerBranchPage(params);
  return children;
}
