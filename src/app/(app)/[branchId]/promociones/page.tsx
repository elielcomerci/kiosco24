import { auth } from "@/lib/auth";
import { getKioscoAccessContextForSession } from "@/lib/access-control";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import PromocionesClient from "./PromocionesClient";
import "./promociones.css"; // CSS isolation for this module

export const metadata = {
  title: "Promociones - Kiosco24",
};

export default async function PromocionesPage({
  params,
}: {
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
  if (!access.allowed) {
    redirect("/suscripcion");
  }

  if (session.user.role !== "OWNER") {
    redirect("/"); // Or somewhere like the cashier screen
  }

  const { branchId } = await params;

  // Verify branch ownership
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      kiosco: { ownerId: session.user.id },
    },
    select: { id: true },
  });

  if (!branch) {
    notFound();
  }

  // Pre-fetch all products for the combo selector
  const products = await prisma.inventoryRecord.findMany({
    where: { branchId },
    select: {
      productId: true,
      stock: true,
      product: {
        select: {
          id: true,
          name: true,
          emoji: true,
          image: true,
          variants: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  return (
    <div className="promo-page fade-in">
      <PromocionesClient branchId={branchId} products={products} />
    </div>
  );
}
