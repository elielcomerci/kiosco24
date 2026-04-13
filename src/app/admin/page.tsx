import { prisma } from "@/lib/prisma";
import AdminRentabilityCalculator from "@/components/admin/AdminRentabilityCalculator";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboard() {
  const [totalSubscriptions, activeClients, newThisMonth] = await Promise.all([
    prisma.subscription.count({
      where: { status: "ACTIVE" },
    }),
    prisma.kiosco.count({
      where: {
        subscription: { status: "ACTIVE" },
      },
    }),
    prisma.kiosco.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return (
    <AdminDashboardClient
      totalSubscriptions={totalSubscriptions}
      activeClients={activeClients}
      newThisMonth={newThisMonth}
    />
  );
}
