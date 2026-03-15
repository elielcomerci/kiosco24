import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: { subscription: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "Kiosco no encontrado" }, { status: 404 });
  }

  const sub = kiosco.subscription;

  if (!sub) {
    return NextResponse.json(null);
  }

  // Auto-heal managementUrl si existe el MP Preapproval ID pero no la URL
  if (!sub.managementUrl && sub.mpPreapprovalId) {
    try {
      const mpHeaders = {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      };
      
      const res = await fetch(`https://api.mercadopago.com/preapproval/${sub.mpPreapprovalId}`, {
        headers: mpHeaders,
      });

      if (res.ok) {
        const mpData = await res.json();
        if (mpData.permalink) {
          sub.managementUrl = mpData.permalink;
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { managementUrl: mpData.permalink },
          });
        }
      }
    } catch (e) {
      console.error("[Subscription Status] Error recupeando permalink:", e);
    }
  }

  return NextResponse.json({
    status: sub.status,
    managementUrl: sub.managementUrl,
    updatedAt: sub.updatedAt,
  });
}
