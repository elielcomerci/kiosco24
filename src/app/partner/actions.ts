"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updatePartnerImage(url: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  
  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: url }
  });

  revalidatePath("/partner");
  revalidatePath("/partner-view/[slug]", "page"); 
}
