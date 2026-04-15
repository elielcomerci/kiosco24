import RegisterExperience from "@/components/auth/RegisterExperience";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";
import { normalizePlatformCouponCode } from "@/lib/platform-coupons";
import { resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export default async function RegisterPage(props: {
  searchParams: Promise<{ ref?: string; coupon?: string; code?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect(resolveSessionAppStartPath(session.user));
  }

  const { ref, coupon, code } = await props.searchParams;
  const cookieStore = await cookies();
  const cookieRef = cookieStore.get("clikit_ref")?.value;

  // Priority: URL param > cookie
  const referralCode = ref ?? cookieRef ?? null;
  const initialCouponCode = normalizePlatformCouponCode(coupon ?? code ?? null);

  // Resolve partner name for UI feedback
  let partnerDisplayName: string | null = null;
  if (referralCode) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { referralCode },
      select: {
        user: {
          select: { name: true, firstName: true, lastName: true },
        },
      },
    });
    if (partner) {
      partnerDisplayName =
        partner.user.name ??
        [partner.user.firstName, partner.user.lastName].filter(Boolean).join(" ") ??
        null;
    }
  }

  const businessActivities = await listBusinessActivityOptions();
  return (
    <RegisterExperience
      businessActivities={businessActivities}
      initialCouponCode={initialCouponCode}
      referralCode={referralCode}
      referredBy={partnerDisplayName}
    />
  );
}
