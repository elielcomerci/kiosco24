import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/mp/callback
 * MP redirige acá después de que el dueño autoriza la conexión.
 * Solo guarda los tokens — NO crea sucursal/caja en MP (eso lo hace /api/mp/setup-pos).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const branchId = searchParams.get("state"); // Lo pusimos en /api/mp/auth

  if (!code || !branchId) {
    return NextResponse.redirect(
      new URL(`/api/mp/auth?error=mp_cancelled`, req.url)
    );
  }

  // Verificar que el branch pertenece al usuario en sesión
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      kiosco: { ownerId: session.user.id },
    },
    select: { id: true },
  });

  if (!branch) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Intercambiar code por tokens
  const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID!,
      client_secret: process.env.MP_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/mp/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[MP OAuth] Error intercambiando code:", err);
    return NextResponse.redirect(
      new URL(`/${branchId}/configuracion?error=mp_failed`, req.url)
    );
  }

  const tokens = await tokenRes.json();
  // tokens: { access_token, refresh_token, user_id, expires_in, ... }

  await prisma.branch.update({
    where: { id: branchId },
    data: {
      mpUserId: String(tokens.user_id),
      mpAccessToken: tokens.access_token,
      mpRefreshToken: tokens.refresh_token,
      mpTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      // Limpiar los IDs del POS anterior si el dueño reconectó una cuenta distinta
      mpStoreId: null,
      mpPosId: null,
    },
  });

  // Redirigir a configuración — la UI mostrará el estado "Conectado, configurando POS..."
  return NextResponse.redirect(
    new URL(`/${branchId}/configuracion?mp=connected`, req.url)
  );
}
