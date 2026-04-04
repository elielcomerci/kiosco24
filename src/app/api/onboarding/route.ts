import { auth } from "@/lib/auth";
import { provisionOwnerKiosco } from "@/lib/provision-owner-kiosco";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/onboarding - called after first login to set up the kiosco
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoName } = await req.json().catch(() => ({ kioscoName: "Mi Kiosco" }));

  const existing = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    include: {
      branches: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (existing) {
    return NextResponse.json({
      kiosco: existing,
      alreadySetup: true,
      branchId: existing.branches[0]?.id ?? null,
    });
  }

  const created = await provisionOwnerKiosco({
    ownerId: session.user.id,
    kioscoName: kioscoName ?? "Mi Kiosco",
    mainBusinessActivity: "KIOSCO",
    seedDefaultCatalog: true,
  });

  return NextResponse.json({
    kiosco: created.kiosco,
    alreadySetup: false,
    branchId: created.mainBranch.id,
  });
}

// GET /api/onboarding - check if kiosco is set up
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ setup: false });

  const kiosco = await prisma.kiosco.findUnique({ where: { ownerId: session.user.id } });
  return NextResponse.json({ setup: !!kiosco, kiosco });
}
