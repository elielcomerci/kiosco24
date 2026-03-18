import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role === "EMPLOYEE") {
    const employeeBranchId = session.user.branchId ?? (
      session.user.employeeId
        ? (await prisma.employee.findUnique({
            where: { id: session.user.employeeId },
            select: { branchId: true },
          }))?.branchId ?? null
        : null
    );

    redirect(employeeBranchId ? `/${employeeBranchId}/caja` : "/");
  }

  // Buscar la primera sucursal del Kiosco del usuario
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      kiosco: {
        include: { branches: { take: 1 } }
      }
    }
  });

  const branchId = user?.kiosco?.branches[0]?.id ?? null;

  if (branchId) {
    redirect(`/${branchId}/caja`);
  }

  // Si no tiene sucursal (onboarding incompleto?), ir a onboarding.
  redirect("/onboarding");
}
