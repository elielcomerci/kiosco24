import { auth } from "@/lib/auth";
import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (isPlatformAdmin(session.user)) {
    redirect("/admin");
  }

  const access = await getKioscoAccessContextForSession(session.user);

  if (access.reason === "NO_KIOSCO") {
    redirect("/onboarding");
  }

  if (!access.allowed && !canAccessSetupWithoutSubscription(session.user, access)) {
    redirect("/suscripcion");
  }

  if (access.firstBranchId) {
    redirect(`/${access.firstBranchId}/${access.allowed ? "caja" : "productos"}`);
  }

  redirect("/onboarding");
}
