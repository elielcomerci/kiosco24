import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    console.log(`[Register] Attempting to register email: ${email}`);

    if (!email || !password) {
      console.warn("[Register] Missing email or password");
      return NextResponse.json(
        { error: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    // Diagnostic log for DB connection
    console.log("[Register] Checking for existing user...");
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.warn(`[Register] User already exists: ${email}`);
      return NextResponse.json(
        { error: "El usuario ya existe" },
        { status: 400 }
      );
    }

    console.log("[Register] Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("[Register] Creating user in DB...");
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "OWNER",
      },
    });

    console.log(`[Register] User created successfully: ${user.id}`);
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("[Register] CRITICAL ERROR:", error);
    return NextResponse.json(
      { 
        error: "Error al registrar el usuario", 
        details: process.env.NODE_ENV === "development" ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}
