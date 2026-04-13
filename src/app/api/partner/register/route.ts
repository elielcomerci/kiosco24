import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type PartnerRegisterPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
  referralCode?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PartnerRegisterPayload;
    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const phone = normalizeText(body.phone);
    const password = body.password;
    const invitedByCode = normalizeText(body.referralCode);

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Completá nombre, email y contraseña." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña tiene al menos 8 caracteres." },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (existingUser) {
      if (existingUser.role === "PARTNER") {
        return NextResponse.json(
          { error: "Ya tenés una cuenta de partner con ese email." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Ese email ya tiene una cuenta. Si querés ser partner, contactanos." },
        { status: 400 },
      );
    }

    // Generate unique referral code from name
    const baseCode = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 20);

    let referralCode = baseCode;
    let counter = 1;
    while (await prisma.partnerProfile.findUnique({ where: { referralCode } })) {
      referralCode = `${baseCode}-${counter}`;
      counter++;
    }

    // Check if invited by another partner
    let invitedById: string | null = null;
    if (invitedByCode) {
      const inviter = await prisma.partnerProfile.findUnique({
        where: { referralCode: invitedByCode },
        select: { id: true },
      });
      if (inviter) invitedById = inviter.id;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with PARTNER role + hashed password
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: "PARTNER",
        password: hashedPassword,
      },
    });

    // Create partner profile
    await prisma.partnerProfile.create({
      data: {
        userId: user.id,
        referralCode,
        isApproved: false,
        phone: phone || null,
        invitedById,
      },
    });

    return NextResponse.json({
      success: true,
      referralCode,
      message: "Solicitud creada exitosamente. Te contactaremos pronto.",
    });
  } catch (error) {
    console.error("[Partner Register] Error:", error);
    return NextResponse.json(
      { error: "Error al registrar la solicitud." },
      { status: 500 },
    );
  }
}
