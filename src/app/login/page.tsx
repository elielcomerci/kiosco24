import LoginExperience from "@/components/auth/LoginExperience";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ register?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const initialRegister = params.register === "1" || params.register === "true";

  return <LoginExperience initialRegister={initialRegister} />;
}
