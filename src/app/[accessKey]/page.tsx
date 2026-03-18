import { notFound } from "next/navigation";

import LoginExperience from "@/components/auth/LoginExperience";

const ACCESS_KEY_RE = /^KIOSCO-[A-Z0-9]{8}-[A-Z0-9]{8}$/;

export default async function AccessKeyPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  const normalizedAccessKey = accessKey.trim().toUpperCase();

  if (!ACCESS_KEY_RE.test(normalizedAccessKey)) {
    notFound();
  }

  return <LoginExperience initialMode="employee" initialAccessKey={normalizedAccessKey} />;
}
