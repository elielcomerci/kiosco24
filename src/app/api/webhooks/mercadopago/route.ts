import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SubscriptionStatus } from "@prisma/client";

// Webhook unificado de Mercado Pago
export async function POST(req: NextRequest) {
  try {
    // 1. Manejo raw body para validar firma HMAC
    const rawBodyText = await req.text();
    let body;
    try {
      body = JSON.parse(rawBodyText);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 2. Extraer firma de headers
    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";

    // ─── Validación de Firma MP ──────────────────────────────────────────────
    // Parse x-signature (header format: ts=12345,v1=abcdef)
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
      console.warn("MP_WEBHOOK_SECRET no configurado, omitiendo validación.");
    } else {
      // Recrear template
      const template = `id:${body.data?.id};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac("sha256", secretKey).update(template).digest("hex");
      if (hmac !== v1) {
        console.error("Firma de MP inválida.");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const action = body.action || body.type;

    // ─── Despachador según tipo de evento ───────────────────────────────────
    if (action === "subscription_preapproval") {
      await handleSubscriptionPreapproval(body);
    } else if (action === "payment") {
      // Espacio para la lógica de webhook de ventas / QR futuros
      console.log("Ignorando evento payment por ahora.");
    } else {
      console.log(`Evento ignorado: ${action}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[MP Webhook] Error interno:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─── Handlers Específicos ──────────────────────────────────────────────────

async function handleSubscriptionPreapproval(body: any) {
  const preapprovalId = body.data?.id;
  if (!preapprovalId) return;

  // Consultar a la API de MP el estado real de la suscripción
  const mpHeaders = { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` };
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: mpHeaders,
  });

  if (!res.ok) {
    console.error(`[Webhook] No se pudo obtener la preapproval ${preapprovalId} de MP`);
    return;
  }

  const preapproval = await res.json();
  const mpStatus = preapproval.status; // "pending", "authorized", "paused", "cancelled"

  let dbStatus: SubscriptionStatus = "PENDING";
  if (mpStatus === "authorized") dbStatus = "ACTIVE";
  else if (mpStatus === "paused") dbStatus = "PAUSED";
  else if (mpStatus === "cancelled") dbStatus = "CANCELLED";

  // Actualizar status en DB buscando por mpPreapprovalId
  await prisma.subscription.updateMany({
    where: { mpPreapprovalId: String(preapprovalId) },
    data: { status: dbStatus },
  });

  console.log(`[Webhook] Suscripción ${preapprovalId} actualizada a ${dbStatus}`);
}
