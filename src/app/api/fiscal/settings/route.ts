import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { guardSetupAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { getDefaultBranchFiscalSettings } from "@/lib/fiscal-invoices";
import { isValidCuit } from "@/lib/fiscal";
import {
  decryptFiscalAccessToken,
  encryptFiscalAccessToken,
  getSharedTestAfipAccessToken,
  isAfipProductionEnabled,
} from "@/lib/fiscal-server";
import { FiscalEnvironment, FiscalVatCondition, prisma } from "@/lib/prisma";

function isValidActivityDate(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function serializeFiscalProfile(
  profile: {
    cuit: string;
    razonSocial: string;
    domicilioFiscal: string;
    condicionIva: FiscalVatCondition;
    inicioActividad: string;
    ingresosBrutos: string | null;
    environment: FiscalEnvironment;
    afipAccessToken: string | null;
  } | null,
) {
  if (!profile) return null;

  const ownToken = decryptFiscalAccessToken(profile.afipAccessToken);
  const sharedTestToken = profile.environment === FiscalEnvironment.TEST ? getSharedTestAfipAccessToken() : null;
  const effectiveToken = ownToken || sharedTestToken;

  return {
    cuit: profile.cuit,
    razonSocial: profile.razonSocial,
    domicilioFiscal: profile.domicilioFiscal,
    condicionIva: profile.condicionIva,
    inicioActividad: profile.inicioActividad,
    ingresosBrutos: profile.ingresosBrutos,
    environment: profile.environment,
    tokenConfigured: Boolean(effectiveToken),
    tokenLast4: ownToken ? ownToken.slice(-4) : null,
    usingSharedTestToken: !ownToken && Boolean(sharedTestToken),
    requiresOwnToken: profile.environment === FiscalEnvironment.PROD,
  };
}

export async function GET(req: Request) {
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

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      name: true,
      kioscoId: true,
      fiscalSettings: true,
      kiosco: {
        select: {
          fiscalProfile: true,
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Sucursal no encontrada." }, { status: 404 });
  }

  const branchSettings =
    branch.fiscalSettings ??
    await prisma.branchFiscalSettings.create({
      data: {
        branchId,
        ...getDefaultBranchFiscalSettings(),
      },
    });

  return NextResponse.json({
    profile: serializeFiscalProfile(branch.kiosco.fiscalProfile),
    branchSettings,
    branch: {
      id: branch.id,
      name: branch.name,
    },
    productionEnabled: isAfipProductionEnabled(),
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const cuit = typeof body.cuit === "string" ? body.cuit.replace(/\D+/g, "") : "";
  const razonSocial = typeof body.razonSocial === "string" ? body.razonSocial.trim().slice(0, 160) : "";
  const domicilioFiscal = typeof body.domicilioFiscal === "string" ? body.domicilioFiscal.trim().slice(0, 220) : "";
  const inicioActividad = typeof body.inicioActividad === "string" ? body.inicioActividad.trim() : "";
  const ingresosBrutos =
    typeof body.ingresosBrutos === "string" && body.ingresosBrutos.trim()
      ? body.ingresosBrutos.trim().slice(0, 120)
      : null;
  const afipAccessToken =
    typeof body.afipAccessToken === "string" && body.afipAccessToken.trim()
      ? body.afipAccessToken.trim()
      : null;
  const clearAfipAccessToken = body.clearAfipAccessToken === true;
  const puntoDeVenta =
    body.puntoDeVenta === null || body.puntoDeVenta === undefined || body.puntoDeVenta === ""
      ? null
      : Number(body.puntoDeVenta);
  const parsedMinimumInvoiceAmount = Number(body.minimumInvoiceAmount ?? 0);
  const minimumInvoiceAmount = Number.isFinite(parsedMinimumInvoiceAmount)
    ? Math.max(0, parsedMinimumInvoiceAmount)
    : Number.NaN;
  const activo = Boolean(body.activo);
  const environment = body.environment === FiscalEnvironment.PROD ? FiscalEnvironment.PROD : FiscalEnvironment.TEST;
  const condicionIva =
    body.condicionIva === FiscalVatCondition.RESP_INSCRIPTO
      ? FiscalVatCondition.RESP_INSCRIPTO
      : FiscalVatCondition.MONOTRIBUTO;

  if (!isValidCuit(cuit)) {
    return NextResponse.json({ error: "El CUIT no es valido." }, { status: 400 });
  }

  if (!razonSocial) {
    return NextResponse.json({ error: "La razon social es obligatoria." }, { status: 400 });
  }

  if (!domicilioFiscal) {
    return NextResponse.json({ error: "El domicilio fiscal es obligatorio." }, { status: 400 });
  }

  if (!isValidActivityDate(inicioActividad)) {
    return NextResponse.json({ error: "El inicio de actividad debe tener formato DD/MM/AAAA." }, { status: 400 });
  }

  if (!Number.isInteger(puntoDeVenta) || (puntoDeVenta ?? 0) <= 0) {
    return NextResponse.json({ error: "El punto de venta debe ser un numero mayor a 0." }, { status: 400 });
  }

  if (!Number.isFinite(minimumInvoiceAmount)) {
    return NextResponse.json({ error: "El monto minimo debe ser numerico." }, { status: 400 });
  }

  if (condicionIva !== FiscalVatCondition.MONOTRIBUTO) {
    return NextResponse.json(
      { error: "La V1 de facturacion electronica solo admite Monotributo." },
      { status: 400 },
    );
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      kioscoId: true,
      kiosco: {
        select: {
          fiscalProfile: {
            select: {
              afipAccessToken: true,
            },
          },
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Sucursal no encontrada." }, { status: 404 });
  }

  const existingStoredToken = branch.kiosco.fiscalProfile?.afipAccessToken ?? null;
  const existingToken = decryptFiscalAccessToken(existingStoredToken);
  const nextToken = clearAfipAccessToken ? null : afipAccessToken ?? existingToken;
  const hasSharedTestToken = Boolean(getSharedTestAfipAccessToken());

  if (activo && environment === FiscalEnvironment.PROD && !nextToken) {
    return NextResponse.json(
      { error: "Para produccion necesitas cargar el access token propio de AfipSDK." },
      { status: 400 },
    );
  }

  if (activo && environment === FiscalEnvironment.TEST && !nextToken && !hasSharedTestToken) {
    return NextResponse.json(
      { error: "Carga un access token de AfipSDK o configura un token compartido de prueba en el entorno." },
      { status: 400 },
    );
  }

  const [profile, branchSettings] = await prisma.$transaction([
    prisma.fiscalProfile.upsert({
      where: { kioscoId: branch.kioscoId },
      update: {
        cuit,
        afipAccessToken: clearAfipAccessToken
          ? null
          : nextToken
            ? encryptFiscalAccessToken(nextToken)
            : null,
        razonSocial,
        domicilioFiscal,
        condicionIva,
        inicioActividad,
        ingresosBrutos,
        environment,
      },
      create: {
        kioscoId: branch.kioscoId,
        cuit,
        afipAccessToken: nextToken ? encryptFiscalAccessToken(nextToken) : null,
        razonSocial,
        domicilioFiscal,
        condicionIva,
        inicioActividad,
        ingresosBrutos,
        environment,
      },
    }),
    prisma.branchFiscalSettings.upsert({
      where: { branchId },
      update: {
        activo,
        puntoDeVenta,
        minimumInvoiceAmount,
      },
      create: {
        branchId,
        activo,
        puntoDeVenta,
        minimumInvoiceAmount,
      },
    }),
  ]);

  return NextResponse.json({
    profile: serializeFiscalProfile(profile),
    branchSettings,
    productionEnabled: isAfipProductionEnabled(),
  });
}
