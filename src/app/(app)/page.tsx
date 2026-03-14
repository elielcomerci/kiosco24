import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
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

  const branchId = user?.kiosco?.branches[0]?.id;

  if (branchId) {
    redirect(`/${branchId}/caja`);
  }

  // Si no tiene sucursal (onboarding incompleto?), ir a login o dashboard
  redirect("/login");
}
