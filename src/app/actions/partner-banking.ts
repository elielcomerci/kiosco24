"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function saveBankingInfo(data: {
  bankAlias: string;
  bankCbu: string;
  bankAccountHolder: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("No autorizado");

  const { bankAlias, bankCbu, bankAccountHolder } = data;

  // Validations
  const cleanAlias = bankAlias.trim();
  const cleanCbu = bankCbu.trim().replace(/\s/g, "");
  const cleanHolder = bankAccountHolder.trim();

  if (!cleanHolder) throw new Error("El titular es obligatorio");
  if (!cleanAlias && !cleanCbu) throw new Error("Ingresá al menos un alias o CBU");
  if (cleanCbu && !/^\d{22}$/.test(cleanCbu)) throw new Error("El CBU debe tener exactamente 22 dígitos");

  await prisma.partnerProfile.update({
    where: { userId: session.user.id },
    data: {
      bankAlias: cleanAlias || null,
      bankCbu: cleanCbu || null,
      bankAccountHolder: cleanHolder,
    }
  });

  console.log("[BANKING_INFO_SAVED]", { userId: session.user.id });

  revalidatePath("/partner");
}
