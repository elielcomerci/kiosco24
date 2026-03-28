import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  if (!kioscoId) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { expiryAlertDays: true },
  });

  return NextResponse.json({
    expiryAlertDays: kiosco?.expiryAlertDays ?? 30,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!kiosco) {
    return NextResponse.json({ error: "No kiosco found" }, { status: 404 });
  }

  const body = await req.json();
  const expiryAlertDays = Number(body?.expiryAlertDays);

  if (!Number.isInteger(expiryAlertDays) || expiryAlertDays < 0 || expiryAlertDays > 365) {
    return NextResponse.json({ error: "expiryAlertDays invalido" }, { status: 400 });
  }

  const updated = await prisma.kiosco.update({
    where: { id: kiosco.id },
    data: { expiryAlertDays },
    select: { expiryAlertDays: true },
  });

  return NextResponse.json(updated);
}
