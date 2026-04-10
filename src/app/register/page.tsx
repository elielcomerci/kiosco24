import RegisterExperience from "@/components/auth/RegisterExperience";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";
import { resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect(resolveSessionAppStartPath(session.user));
  }

  const businessActivities = await listBusinessActivityOptions();
  return <RegisterExperience businessActivities={businessActivities} />;
}
