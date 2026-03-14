import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Server Component — protege todas las rutas del grupo (app)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="app-layout">
      <div className="app-content">{children}</div>
    </div>
  );
}
