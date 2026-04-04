import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import crypto from "crypto";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Clikit <onboarding@resend.dev>";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email es requerido" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Si el email existe, recibirás un enlace de recuperación" },
        { status: 200 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        sessionToken: token,
        userId: user.id,
        expires: expiresAt,
      },
    });

    const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: "Recuperar contraseña - Clikit",
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 16px;">Recuperar contraseña</h1>
            <p style="font-size: 16px; color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
              Hola${user.name ? ` ${user.name}` : ""},
            </p>
            <p style="font-size: 16px; color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
              Has solicitado recuperar tu contraseña de Clikit. Haz clic en el botón de abajo para crear una nueva:
            </p>
            <a href="${resetUrl}" style="display: inline-block; background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-bottom: 24px;">
              Cambiar contraseña
            </a>
            <p style="font-size: 14px; color: #6b7280; line-height: 1.5; margin-bottom: 24px;">
              O copia y pega este enlace en tu navegador:
            </p>
            <p style="font-size: 12px; color: #6b7280; word-break: break-all; background-color: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 24px;">
              ${resetUrl}
            </p>
            <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
              Este enlace expira en 1 hora por seguridad.
            </p>
            <p style="font-size: 14px; color: #6b7280; line-height: 1.5; margin-top: 24px;">
              Si no solicitaste este cambio, puedes ignorar este email.
            </p>
          </div>
        `,
      });
    } else {
      console.log("[RESET PASSWORD] Token generado:", token);
      console.log("[RESET PASSWORD] URL:", resetUrl);
    }

    return NextResponse.json(
      { message: "Si el email existe, recibirás un enlace de recuperación" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[request-reset] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
