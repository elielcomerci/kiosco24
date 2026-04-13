import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardClientContent from "./DashboardClientContent";
import { calculatePartnerStats } from "@/lib/partner-stats";
import PartnerBankingForm from "@/components/partner/PartnerBankingForm";

export default async function PartnerDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const partner = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { 
      id: true, 
      bankAlias: true,
      bankCbu: true,
      bankAccountHolder: true,
      user: { select: { image: true } } 
    },
  });

  if (!partner) return <div className="p-10 text-center">Cargando perfil...</div>;

  const stats = await calculatePartnerStats(partner.id);

  const [activeClients, recent] = await Promise.all([
    prisma.referral.count({
      where: { partnerId: partner.id, status: "ACTIVE" },
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
    })
  ]);

  return (
    <div>
      <DashboardClientContent
        stats={stats}
        activeClients={activeClients}
        recent={recent!}
        userImage={partner.user.image}
      />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "0 24px 40px" }}>
        <PartnerBankingForm current={{
          bankAlias: partner.bankAlias,
          bankCbu: partner.bankCbu,
          bankAccountHolder: partner.bankAccountHolder,
        }} />
      </div>
    </div>
  );
}