import crypto from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { getMpAccessTokenForBranch } from "@/lib/mp-token";
import { MpIncomingPaymentChannel, prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const rawBodyText = await req.text();
    let body: any;

    try {
      body = JSON.parse(rawBodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";

    const sigParts = xSignature.split(",");
    let ts = "";
    let v1 = "";

    sigParts.forEach((part) => {
      const [key, val] = part.split("=");
      if (key === "ts") ts = val;
      if (key === "v1") v1 = val;
    });

    const secretKey = process.env.MP_WEBHOOK_SECRET;
    if (!secretKey) {
      console.warn("MP_WEBHOOK_SECRET no configurado, omitiendo validacion.");
    } else {
      const template = `id:${body.data?.id};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac("sha256", secretKey).update(template).digest("hex");
      if (hmac !== v1) {
        console.error("Firma de MP invalida.");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const action = String(body.action || body.type || "");

    if (action === "subscription_preapproval") {
      await handleSubscriptionPreapproval(body);
    } else if (action === "payment" || action.startsWith("payment")) {
      await handleIncomingPayment(body);
    } else {
      console.log(`[MP Webhook] Evento ignorado: ${action}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[MP Webhook] Error interno:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function handleSubscriptionPreapproval(body: any) {
  const preapprovalId = body.data?.id;
  if (!preapprovalId) return;

  const mpHeaders = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` };
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: mpHeaders,
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(`[Webhook] No se pudo obtener la preapproval ${preapprovalId} de MP`);
    return;
  }

  const preapproval = await res.json();
  const mpStatus = preapproval.status;

  let dbStatus: SubscriptionStatus = "PENDING";
  if (mpStatus === "authorized") dbStatus = "ACTIVE";
  else if (mpStatus === "paused") dbStatus = "PAUSED";
  else if (mpStatus === "cancelled") dbStatus = "CANCELLED";

  await prisma.subscription.updateMany({
    where: { mpPreapprovalId: String(preapprovalId) },
    data: { status: dbStatus },
  });

  console.log(`[Webhook] Suscripcion ${preapprovalId} actualizada a ${dbStatus}`);
}

async function handleIncomingPayment(body: any) {
  const paymentId = optionalString(body.data?.id);
  const collectorId = optionalString(body.user_id);

  if (!paymentId || !collectorId) {
    console.log("[MP Webhook] payment sin paymentId o collectorId.");
    return;
  }

  const candidateBranches = await prisma.branch.findMany({
    where: {
      mpUserId: collectorId,
      mpAccessToken: { not: null },
    },
    select: {
      id: true,
      mpPosId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (candidateBranches.length === 0) {
    console.log(`[MP Webhook] payment ${paymentId} sin sucursal asociada al collector ${collectorId}.`);
    return;
  }

  const accessToken = await getMpAccessTokenForBranch(candidateBranches[0].id);
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!paymentRes.ok) {
    const errorText = await paymentRes.text();
    console.error(`[MP Webhook] No se pudo obtener payment ${paymentId}:`, errorText);
    return;
  }

  const payment = await paymentRes.json();
  const branch = resolveBranchForPayment(candidateBranches, payment);

  if (!branch) {
    console.warn(`[MP Webhook] payment ${paymentId} ambiguo: no se pudo resolver sucursal.`);
    return;
  }

  const amount = Number(payment.transaction_amount ?? payment.transaction_details?.total_paid_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const status = optionalString(payment.status) ?? "unknown";
  const existing = await prisma.mpIncomingPaymentNotice.findUnique({
    where: { mpPaymentId: paymentId },
    select: { approvedObservedAt: true },
  });

  const approvedObservedAt =
    status === "approved"
      ? existing?.approvedObservedAt ?? new Date()
      : existing?.approvedObservedAt ?? null;

  await prisma.mpIncomingPaymentNotice.upsert({
    where: { mpPaymentId: paymentId },
    create: {
      branchId: branch.id,
      mpPaymentId: paymentId,
      collectorId,
      channel: detectPaymentChannel(payment),
      status,
      paymentType: optionalString(payment.payment_type_id),
      paymentMethod: optionalString(payment.payment_method_id),
      amount,
      currency: optionalString(payment.currency_id),
      payerName: extractPayerName(payment),
      payerEmail: extractPayerEmail(payment),
      referenceLabel: extractPaymentReference(payment),
      occurredAt: extractPaymentOccurredAt(payment),
      approvedObservedAt,
    },
    update: {
      branchId: branch.id,
      collectorId,
      channel: detectPaymentChannel(payment),
      status,
      paymentType: optionalString(payment.payment_type_id),
      paymentMethod: optionalString(payment.payment_method_id),
      amount,
      currency: optionalString(payment.currency_id),
      payerName: extractPayerName(payment),
      payerEmail: extractPayerEmail(payment),
      referenceLabel: extractPaymentReference(payment),
      occurredAt: extractPaymentOccurredAt(payment),
      approvedObservedAt,
    },
  });
}

function resolveBranchForPayment(
  candidateBranches: Array<{ id: string; mpPosId: string | null }>,
  payment: any,
) {
  if (candidateBranches.length === 1) {
    return candidateBranches[0];
  }

  const candidatePosIds = [
    payment.point_of_interaction?.business_info?.pos_id,
    payment.point_of_interaction?.transaction_data?.pos_id,
    payment.point_of_interaction?.pos_id,
    payment.metadata?.pos_id,
    payment.metadata?.mpPosId,
  ]
    .map(optionalString)
    .filter(Boolean) as string[];

  for (const posId of candidatePosIds) {
    const branch = candidateBranches.find((item) => item.mpPosId === posId);
    if (branch) {
      return branch;
    }
  }

  return null;
}

function detectPaymentChannel(payment: any): MpIncomingPaymentChannel {
  const paymentType = optionalString(payment.payment_type_id)?.toLowerCase();
  const paymentMethod = optionalString(payment.payment_method_id)?.toLowerCase();

  if (
    paymentType?.includes("transfer") ||
    paymentMethod?.includes("transfer") ||
    paymentMethod === "bank_transfer"
  ) {
    return MpIncomingPaymentChannel.TRANSFER;
  }

  return MpIncomingPaymentChannel.MERCADOPAGO;
}

function extractPayerName(payment: any) {
  const primaryName = [
    optionalString(payment.payer?.first_name),
    optionalString(payment.payer?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (primaryName) {
    return primaryName;
  }

  const fallbackName = [
    optionalString(payment.additional_info?.payer?.first_name),
    optionalString(payment.additional_info?.payer?.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fallbackName) {
    return fallbackName;
  }

  return optionalString(payment.payer?.nickname) ?? optionalString(payment.payer?.email) ?? null;
}

function extractPayerEmail(payment: any) {
  return optionalString(payment.payer?.email) ?? optionalString(payment.additional_info?.payer?.email) ?? null;
}

function extractPaymentReference(payment: any) {
  return (
    optionalString(payment.external_reference) ??
    optionalString(payment.description) ??
    optionalString(payment.order?.id) ??
    null
  );
}

function extractPaymentOccurredAt(payment: any) {
  const rawValue =
    optionalString(payment.date_approved) ??
    optionalString(payment.date_created) ??
    optionalString(payment.date_last_updated);

  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function optionalString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}
