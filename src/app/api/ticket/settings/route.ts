import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardSetupAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { getDefaultTicketSettings, isTicketPrintMode } from "@/lib/ticketing";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
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
    orderLink: settings.orderLink,
    printMode: settings.printMode,
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

  const accessResponse = await guardSetupAccess(session.user);
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
        ? body.footerText.trim().slice(0, 400)
        : null;
  const nextOrderLink =
    body?.orderLink === undefined
      ? undefined
      : typeof body.orderLink === "string" && body.orderLink.trim()
        ? body.orderLink.trim().slice(0, 300)
        : null;
  const nextPrintMode =
    body?.printMode === undefined
      ? undefined
      : isTicketPrintMode(body.printMode)
        ? body.printMode
        : null;

  if (body?.printMode !== undefined && !nextPrintMode) {
    return NextResponse.json({ error: "El modo de impresion no es valido." }, { status: 400 });
  }

  if (nextOrderLink) {
    try {
      const parsed = new URL(nextOrderLink);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "El link del QR debe empezar con http o https." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "El link del QR no es valido." }, { status: 400 });
    }
  }

  const updated = await prisma.ticketSettings.upsert({
    where: { branchId },
    update: {
      ...(body?.showLogo !== undefined && { showLogo: Boolean(body.showLogo) }),
      ...(body?.showAddress !== undefined && { showAddress: Boolean(body.showAddress) }),
      ...(body?.showPhone !== undefined && { showPhone: Boolean(body.showPhone) }),
      ...(body?.showFooterText !== undefined && { showFooterText: Boolean(body.showFooterText) }),
      ...(body?.footerText !== undefined && { footerText: nextFooterText }),
      ...(body?.orderLink !== undefined && { orderLink: nextOrderLink }),
      ...(body?.printMode !== undefined && { printMode: nextPrintMode }),
    },
    create: {
      branchId,
      ...getDefaultTicketSettings(),
      ...(body?.showLogo !== undefined && { showLogo: Boolean(body.showLogo) }),
      ...(body?.showAddress !== undefined && { showAddress: Boolean(body.showAddress) }),
      ...(body?.showPhone !== undefined && { showPhone: Boolean(body.showPhone) }),
      ...(body?.showFooterText !== undefined && { showFooterText: Boolean(body.showFooterText) }),
      ...(body?.footerText !== undefined && { footerText: nextFooterText }),
      ...(body?.orderLink !== undefined && { orderLink: nextOrderLink }),
      ...(body?.printMode !== undefined && { printMode: nextPrintMode }),
    },
  });

  return NextResponse.json(updated);
}
