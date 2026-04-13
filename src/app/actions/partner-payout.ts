"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function requestPayout(partnerId: string, amount: number, idempotencyKey: string) {
  // 0. Auth + Ownership validation — never trust the client's partnerId
  const session = await auth();
  if (!session?.user?.id) throw new Error("No autorizado");

  const partner = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  });

  if (!partner || partner.id !== partnerId) {
    throw new Error("No autorizado");
  }

  // Normalize to integer to prevent floating-point accounting bugs
  amount = Math.floor(amount);

  if (amount <= 0) {
    throw new Error("Monto inválido");
  }

  console.log("[PAYOUT_REQUEST]", { partnerId, amount, idempotencyKey });

  const payout = await prisma.$transaction(async (tx) => {
    // Idempotency check — uses unique index, fast and correct
    const existing = await tx.payoutRequest.findUnique({
      where: { idempotencyKey }
    });

    if (existing) {
      console.log("[IDEMPOTENT_HIT]", idempotencyKey);
      return existing;
    }

    // Row-level lock: prevents concurrent requests from double-spending
    // Forces serialization of payouts for this partner
    await tx.$queryRaw`SELECT id FROM "PartnerProfile" WHERE id = ${partnerId} FOR UPDATE`;

    // 1. Recalcular balance REAL en DB — never trust client state
    const commissions = await tx.commission.aggregate({
      _sum: { amount: true },
      where: {
        partnerId,
        status: { in: ["APPROVED", "PAID"] }
      }
    });

    // PENDING + APPROVED = already reserved, cannot be re-requested
    const totalRequested = await tx.payoutRequest.aggregate({
      _sum: { amount: true },
      where: {
        partnerId,
        status: { in: ["PENDING", "APPROVED"] }
      }
    });

    const paidOut = await tx.payoutRequest.aggregate({
      _sum: { amount: true },
      where: {
        partnerId,
        status: "PAID"
      }
    });

    const totalEarned = commissions._sum?.amount ?? 0;
    const reserved = totalRequested._sum?.amount ?? 0;
    const paid = paidOut._sum?.amount ?? 0;

    const available = totalEarned - paid - reserved;

    // 2. Server-side validation — always, regardless of what the client says
    if (amount > available) {
      throw new Error("Ese monto ya no está disponible.");
    }

    if (amount < 10000) {
      throw new Error("Monto mínimo no alcanzado");
    }

    // 3. Create payout atomically — idempotencyKey ensures no duplicate
    return await tx.payoutRequest.create({
      data: {
        partnerId,
        amount,
        status: "PENDING",
        idempotencyKey
      }
    });
  });

  // revalidate OUTSIDE transaction — side effects never inside atomic blocks
  revalidatePath("/partner");

  return payout;
}
