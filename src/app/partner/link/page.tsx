import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import LinkPageClient from "./LinkPageClient";

export default async function PartnerLinkPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const partner = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { referralCode: true },
  });

  if (!partner) redirect("/partner");

  const referralUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://clikit.com"}/partner-view/${partner.referralCode}`;

  return <LinkPageClient referralCode={partner.referralCode} referralUrl={referralUrl} />;
}
