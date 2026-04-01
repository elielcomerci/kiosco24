import { auth, signOut } from "@/lib/auth";
import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import BranchSelector from "@/components/ui/BranchSelector";
import { BranchWorkspaceProvider } from "@/components/ui/BranchWorkspace";
import DeviceTextScaleControl from "@/components/ui/DeviceTextScaleControl";
import { DEVICE_TEXT_SCALE_COOKIE, normalizeDeviceTextScale } from "@/lib/device-text-scale";
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
  const cookieStore = await cookies();
  const initialTextScale = normalizeDeviceTextScale(
    cookieStore.get(DEVICE_TEXT_SCALE_COOKIE)?.value,
  );

  return (
    <div
      className="app-layout branch-context"
      data-text-scale={initialTextScale}
      style={{
        "--primary": primaryColor,
        "--primary-rgb": primaryRgb,
        "--primary-dim": `${primaryColor}CC`,
        "--bg": bgColor,
      } as React.CSSProperties}
    >
      <header className="app-header no-print">
        <div className="app-header-branch">
          <BranchSelector branches={branches} currentBranchId={effectiveBranchId} />
        </div>
        <div className="app-header-actions">
          <DeviceTextScaleControl initialScale={initialTextScale} />
          <a
            href={`/${effectiveBranchId}/tickets`}
            className="app-header-icon-link"
            title="Tickets"
            aria-label="Tickets"
          >
            {"\uD83E\uDDFE"}
          </a>
          {(session.user.role === "OWNER" || session.user.employeeRole === "MANAGER") ? (
            <a
              href={`/${effectiveBranchId}/facturas`}
              className="app-header-icon-link"
              title="Facturas"
              aria-label="Facturas"
            >
              {"\uD83D\uDCC4"}
            </a>
          ) : null}
          {(session.user.role === "OWNER" || session.user.employeeRole === "MANAGER") ? (
            <a
              href={`/${effectiveBranchId}/configuracion`}
              className="app-header-icon-link"
              title="Configuracion"
              aria-label="Configuracion"
            >
              {"\u2699\uFE0F"}
            </a>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="btn btn-sm btn-ghost app-header-logout"
              title="Salir"
            >
              <span className="app-header-logout-icon" aria-hidden="true">
                {"\u21AA"}
              </span>
              <span className="app-header-logout-label">Salir</span>
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
