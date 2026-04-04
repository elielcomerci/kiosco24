import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Solo el dueño puede gestionar esta oferta." }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      subscriptionWelcomeOfferShownAt: true,
    },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "Kiosco no encontrado." }, { status: 404 });
  }

  const updated = await prisma.kiosco.update({
    where: { id: kiosco.id },
    data: {
      subscriptionWelcomeOfferShownAt: kiosco.subscriptionWelcomeOfferShownAt ?? new Date(),
    },
    select: {
      subscriptionWelcomeOfferShownAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    shownAt: updated.subscriptionWelcomeOfferShownAt?.toISOString() ?? null,
  });
}
