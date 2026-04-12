"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function updateOnboardingFlags(flags: Record<string, boolean>) {
  const session = await auth();
  if (!session?.user?.email) {
    return { success: false, error: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, onboardingFlags: true }
  });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  const currentFlags = (user.onboardingFlags as Record<string, boolean>) || {};
  const newFlags = { ...currentFlags, ...flags };

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingFlags: newFlags }
  });

  return { success: true, flags: newFlags };
}
// cache invalidation trigger
