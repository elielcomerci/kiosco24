import RegisterExperience from "@/components/auth/RegisterExperience";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";

export default async function RegisterPage() {
  const businessActivities = await listBusinessActivityOptions();
  return <RegisterExperience businessActivities={businessActivities} />;
}
