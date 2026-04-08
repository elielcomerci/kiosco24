// src/app/employee-access/[accessKey]/page.tsx
import { notFound } from "next/navigation";

import LoginExperience from "@/components/auth/LoginExperience";
import { isBranchAccessKey, normalizeBranchAccessKey } from "@/lib/branch-access-key";

export default async function AccessKeyPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  const normalizedAccessKey = normalizeBranchAccessKey(accessKey);

  if (!isBranchAccessKey(normalizedAccessKey)) {
    notFound();
  }

  return <LoginExperience initialMode="employee" initialAccessKey={normalizedAccessKey} />;
}
