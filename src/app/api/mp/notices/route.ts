import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { type MpIncomingPaymentNotice, prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ items: [] });
  }

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  const hasValidAfter = after && !Number.isNaN(after.getTime());

  const items = await prisma.mpIncomingPaymentNotice.findMany({
    where: {
      branchId,
      approvedObservedAt: hasValidAfter ? { gt: after! } : { not: null },
    },
    orderBy: {
      approvedObservedAt: "asc",
    },
    take: 30,
    select: {
      id: true,
      mpPaymentId: true,
      channel: true,
      amount: true,
      currency: true,
      payerName: true,
      payerEmail: true,
      referenceLabel: true,
      occurredAt: true,
      approvedObservedAt: true,
    },
  });

  return NextResponse.json({
    items: items.map((item: Pick<MpIncomingPaymentNotice, "id" | "mpPaymentId" | "channel" | "amount" | "currency" | "payerName" | "payerEmail" | "referenceLabel" | "occurredAt" | "approvedObservedAt">) => ({
      id: item.id,
      mpPaymentId: item.mpPaymentId,
      channel: item.channel,
      amount: item.amount,
      currency: item.currency,
      payerLabel: item.payerName || item.payerEmail || "Sin identificar",
      referenceLabel: item.referenceLabel,
      occurredAt: item.occurredAt?.toISOString() ?? null,
      approvedObservedAt: item.approvedObservedAt?.toISOString() ?? null,
    })),
  });
}
