import { auth } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";
import { redirect } from "next/navigation";
import { SessionWatcher } from "@/components/session-watcher";
import { prisma } from "@/lib/prisma";
import { TourProvider } from "@/components/onboarding/TourProvider";

// Server Component — protege todas las rutas del grupo (app)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingFlags: true }
  });

  const onboardingFlags = (user?.onboardingFlags as Record<string, boolean>) || {};

  return (
    <SessionProvider session={session} refetchInterval={5 * 60}>
      <SessionWatcher />
      <TourProvider initialFlags={onboardingFlags}>
        <div className="app-layout">
          <div className="app-content">{children}</div>
        </div>
      </TourProvider>
    </SessionProvider>
  );
}
