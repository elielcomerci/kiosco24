import { auth, signOut } from "@/lib/auth";
import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import BranchSelector from "@/components/ui/BranchSelector";
import { BranchWorkspaceProvider } from "@/components/ui/BranchWorkspace";
import { hexToRgb } from "@/lib/utils";

export default async function BranchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
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

  const { branchId } = await params;
  const isEmployee = session.user.role === "EMPLOYEE";
  let effectiveBranchId = isEmployee ? (session.user.branchId ?? null) : branchId;

  if (isEmployee && !effectiveBranchId && session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { branches: { take: 1, select: { id: true } } },
    });
    effectiveBranchId = employee?.branches[0]?.id ?? null;
  }

  if (!effectiveBranchId) {
    redirect("/");
  }

  if (isEmployee && branchId !== effectiveBranchId) {
    redirect(`/${effectiveBranchId}/caja`);
  }

  const currentBranch = await prisma.branch.findUnique({
    where: { id: effectiveBranchId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      bgColor: true,
      kioscoId: true,
    },
  });

  if (!currentBranch) {
    notFound();
  }

  const branches = await prisma.branch.findMany({
    where: isEmployee ? { id: effectiveBranchId } : { kioscoId: currentBranch.kioscoId },
    select: { id: true, name: true, logoUrl: true, primaryColor: true, bgColor: true },
    orderBy: { createdAt: "asc" },
  });

  const primaryColor = currentBranch.primaryColor || "#22c55e";
  const bgColor = currentBranch.bgColor || "#0f172a";
  const primaryRgb = hexToRgb(primaryColor);

  return (
    <div
      className="app-layout branch-context"
      style={{
        "--primary": primaryColor,
        "--primary-rgb": primaryRgb,
        "--primary-dim": `${primaryColor}CC`,
        "--bg": bgColor,
      } as React.CSSProperties}
    >
      <header
        className="no-print"
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "62px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
          <BranchSelector branches={branches} currentBranchId={effectiveBranchId} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <a
            href={`/${effectiveBranchId}/tickets`}
            style={{ fontSize: "20px", textDecoration: "none", color: "var(--text)" }}
            title="Tickets"
          >
            {"\uD83E\uDDFE"}
          </a>
          {(session.user.role === "OWNER" || session.user.employeeRole === "MANAGER") ? (
            <a
              href={`/${effectiveBranchId}/facturas`}
              style={{ fontSize: "20px", textDecoration: "none", color: "var(--text)" }}
              title="Facturas"
            >
              {"\uD83D\uDCC4"}
            </a>
          ) : null}
          {!isEmployee && (
            <a
              href={`/${effectiveBranchId}/configuracion`}
              style={{ fontSize: "20px", textDecoration: "none", color: "var(--text)" }}
              title="Configuracion"
            >
              {"\u2699\uFE0F"}
            </a>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="btn btn-sm btn-ghost"
              style={{ border: "1px solid var(--border)", padding: "6px 10px" }}
              title="Salir"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <BranchWorkspaceProvider
        branch={{
          id: currentBranch.id,
          name: currentBranch.name,
          logoUrl: currentBranch.logoUrl,
          primaryColor: currentBranch.primaryColor,
          bgColor: currentBranch.bgColor,
        }}
        isEmployee={isEmployee}
      >
        <main className="app-content">{children}</main>
        <BottomNav />
      </BranchWorkspaceProvider>
    </div>
  );
}
