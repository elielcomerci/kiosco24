import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardClientContent from "./DashboardClientContent";

export default async function PartnerDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const partner = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { 
      id: true, 
      user: { select: { image: true } } 
    },
  });

  if (!partner) return <div className="p-10 text-center">Cargando perfil...</div>;

  const [mrr, activeClients, pending, recent, commissionSample] = await Promise.all([
    prisma.recurringCommission.aggregate({
      _sum: { recurringAmount: true },
      where: { partnerId: partner.id, active: true, clientActive: true },
    }),
    prisma.recurringCommission.count({
      where: { partnerId: partner.id, active: true, clientActive: true },
    }),
    prisma.commission.aggregate({
      _sum: { amount: true },
      where: { partnerId: partner.id, status: "PENDING" },
    }),
    prisma.referral.findMany({
      where: { partnerId: partner.id },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        referredKiosco: { select: { name: true } },
        recurring: { select: { recurringAmount: true, clientActive: true } },
      },
    }),
    prisma.recurringCommission.findFirst({
      where: { partnerId: partner.id },
    }),
  ]);

  return (
    <DashboardClientContent
      monthlyIncome={mrr._sum.recurringAmount ?? 0}
      activeClients={activeClients}
      pendingAmount={pending._sum.amount ?? 0}
      recent={recent}
      recurringAmount={commissionSample?.recurringAmount ?? 4500}
      userImage={partner.user.image}
    />
  );
}