import { auth } from "@/lib/auth";
import { canAccessSetupWithoutSubscription, getKioscoAccessContextForSession } from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AppTopBar from "@/components/ui/AppTopBar";
import BottomNav from "@/components/ui/BottomNav";
import { BranchWorkspaceProvider } from "@/components/ui/BranchWorkspace";
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
      kiosco: {
        select: {
          name: true,
        },
      },
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
      <AppTopBar
        branches={branches}
        currentBranchId={effectiveBranchId}
        kioscoName={currentBranch.kiosco.name}
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          role: session.user.role,
          employeeRole: session.user.employeeRole,
          employeeId: session.user.employeeId,
        }}
        initialTextScale={initialTextScale}
      />

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
        <main className="app-content" data-keynav-scope="main-content">{children}</main>
        <BottomNav />
      </BranchWorkspaceProvider>
    </div>
  );
}
