import { auth } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";
import { redirect } from "next/navigation";
import { SessionWatcher } from "@/components/session-watcher";

// Server Component — protege todas las rutas del grupo (app)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <SessionProvider session={session} refetchInterval={5 * 60}>
      <SessionWatcher />
      <div className="app-layout">
        <div className="app-content">{children}</div>
      </div>
    </SessionProvider>
  );
}
