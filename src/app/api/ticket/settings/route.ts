import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getDefaultTicketSettings } from "@/lib/ticketing";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const defaults = getDefaultTicketSettings();
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      logoUrl: true,
      ticketSettings: true,
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Sucursal no encontrada." }, { status: 404 });
  }

  const settings =
    branch.ticketSettings ??
    await prisma.ticketSettings.create({
      data: {
        branchId,
        ...defaults,
      },
    });

  return NextResponse.json({
    showLogo: settings.showLogo,
    showAddress: settings.showAddress,
    showPhone: settings.showPhone,
    showFooterText: settings.showFooterText,
    footerText: settings.footerText,
    branch: {
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      logoUrl: branch.logoUrl,
    },
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const nextFooterText =
    body?.footerText === undefined
      ? undefined
      : typeof body.footerText === "string" && body.footerText.trim()
        ? body.footerText.trim().slice(0, 160)
        : null;

  const updated = await prisma.ticketSettings.upsert({
    where: { branchId },
    update: {
      ...(body?.showLogo !== undefined && { showLogo: Boolean(body.showLogo) }),
      ...(body?.showAddress !== undefined && { showAddress: Boolean(body.showAddress) }),
      ...(body?.showPhone !== undefined && { showPhone: Boolean(body.showPhone) }),
      ...(body?.showFooterText !== undefined && { showFooterText: Boolean(body.showFooterText) }),
      ...(body?.footerText !== undefined && { footerText: nextFooterText }),
    },
    create: {
      branchId,
      ...getDefaultTicketSettings(),
      ...(body?.showLogo !== undefined && { showLogo: Boolean(body.showLogo) }),
      ...(body?.showAddress !== undefined && { showAddress: Boolean(body.showAddress) }),
      ...(body?.showPhone !== undefined && { showPhone: Boolean(body.showPhone) }),
      ...(body?.showFooterText !== undefined && { showFooterText: Boolean(body.showFooterText) }),
      ...(body?.footerText !== undefined && { footerText: nextFooterText }),
    },
  });

  return NextResponse.json(updated);
}
