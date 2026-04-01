import { requireOperativeBranchPage } from "@/lib/route-access";

export default async function StatsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  await requireOperativeBranchPage(params);
  return children;
}
