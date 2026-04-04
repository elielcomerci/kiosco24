import LoginExperience from "@/components/auth/LoginExperience";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ register?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const wantsRegister = params.register === "1" || params.register === "true";
  if (wantsRegister) {
    redirect("/register");
  }

  return <LoginExperience />;
}
