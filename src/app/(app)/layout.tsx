import { auth } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";
import { redirect } from "next/navigation";

// Server Component — protege todas las rutas del grupo (app)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <SessionProvider session={session}>
      <div className="app-layout">
        <div className="app-content">{children}</div>
      </div>
    </SessionProvider>
  );
}
