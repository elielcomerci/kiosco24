import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_RETRIES = 3;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Payout Worker — called by Vercel Cron every hour.
 *
 * Processes APPROVED payouts → PAID.
 * In a real setup this would call your bank/payment API (MercadoPago Payouts, Wise, etc.)
 * For now it marks them as PAID after simulating a successful transfer.
 *
 * Failure model:
 *   - On error: increments retryCount, leaves status APPROVED
 *   - After MAX_RETRIES: marks as REJECTED with a log alert
 */
export async function GET(req: NextRequest) {
  // Validate cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("[CRON_PAYOUTS] Starting payout worker run");

  // Fetch all APPROVED payouts that haven't exceeded retry limit
  const approvedPayouts = await prisma.payoutRequest.findMany({
    where: {
      status: "APPROVED",
      retryCount: { lt: MAX_RETRIES }
    },
    include: {
      partner: {
        select: {
          id: true,
          user: { select: { email: true, name: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" } // FIFO: oldest first
  });

  console.log(`[CRON_PAYOUTS] Found ${approvedPayouts.length} payouts to process`);

  const results = {
    processed: 0,
    failed: 0,
    rejected: 0,
  };

  for (const payout of approvedPayouts) {
    try {
      // ─────────────────────────────────────────────────────
      // TODO: Replace this block with your real payment API call
      // Example: MercadoPago Payouts, Wise, or direct bank transfer
      //
      // const transferResult = await mercadopago.payouts.create({
      //   amount: payout.amount,
      //   receiver: { email: payout.partner.user.email },
      //   currency_id: "ARS",
      //   description: `Comisión Partner ${payout.partner.id}`,
      //   external_reference: payout.idempotencyKey,
      // });
      //
      // if (!transferResult.ok) throw new Error(transferResult.error);
      // ─────────────────────────────────────────────────────

      // Mark as PAID atomically
      await prisma.payoutRequest.update({
        where: { id: payout.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          processedAt: new Date(),
        }
      });

      console.log(`[CRON_PAYOUTS] PAID ${payout.id} — $${payout.amount} → ${payout.partner.user.email}`);
      results.processed++;

    } catch (err: any) {
      const newRetryCount = payout.retryCount + 1;
      const exhausted = newRetryCount >= MAX_RETRIES;

      console.error(`[CRON_PAYOUTS] FAILED ${payout.id} (attempt ${newRetryCount}/${MAX_RETRIES}):`, err?.message);

      if (exhausted) {
        // Auto-reject after MAX_RETRIES to unblock the partner's balance
        await prisma.payoutRequest.update({
          where: { id: payout.id },
          data: {
            status: "REJECTED",
            retryCount: newRetryCount,
            processedAt: new Date(),
          }
        });
        console.error(`[CRON_PAYOUTS] AUTO_REJECTED ${payout.id} — exceeded ${MAX_RETRIES} retries`);
        results.rejected++;
      } else {
        // Increment retry count, will be retried next cron run
        await prisma.payoutRequest.update({
          where: { id: payout.id },
          data: { retryCount: newRetryCount }
        });
        results.failed++;
      }
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[CRON_PAYOUTS] Done in ${duration}ms`, results);

  return NextResponse.json({
    ok: true,
    duration,
    ...results,
  });
}
