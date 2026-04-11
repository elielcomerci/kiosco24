import { auth } from "@/lib/auth";
import { getMercadoPagoCallbackUrl } from "@/lib/mp-oauth";
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
  const returnedState = searchParams.get("state");
  const stateCookie = req.cookies.get("mp_oauth_state")?.value;
  let storedState: { state: string; branchId: string; codeVerifier: string } | null = null;

  if (stateCookie) {
    try {
      const parsed = JSON.parse(stateCookie) as Partial<{ state: string; branchId: string; codeVerifier: string }>;
      if (
        typeof parsed.state === "string" &&
        typeof parsed.branchId === "string" &&
        typeof parsed.codeVerifier === "string"
      ) {
        storedState = { state: parsed.state, branchId: parsed.branchId, codeVerifier: parsed.codeVerifier };
      }
    } catch {
      storedState = null;
    }
  }

  const branchId = storedState?.branchId ?? null;

  if (!code || !returnedState || !storedState || returnedState !== storedState.state || !branchId) {
    const fallbackUrl = branchId
      ? new URL(`/${branchId}/configuracion?error=mp_cancelled`, req.url)
      : new URL("/", req.url);
    const response = NextResponse.redirect(fallbackUrl);
    response.cookies.delete("mp_oauth_state");
    return response;
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

  const redirectUri = getMercadoPagoCallbackUrl(process.env.NEXTAUTH_URL || req.nextUrl.origin);
  if (!redirectUri || !process.env.MP_CLIENT_ID || !process.env.MP_CLIENT_SECRET) {
    const response = NextResponse.redirect(
      new URL(`/${branchId}/configuracion?error=mp_oauth_not_configured`, req.url)
    );
    response.cookies.delete("mp_oauth_state");
    return response;
  }

  // Intercambiar code por tokens
  const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: storedState.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[MP OAuth] Error intercambiando code:", err);
    const response = NextResponse.redirect(
      new URL(`/${branchId}/configuracion?error=mp_failed`, req.url)
    );
    response.cookies.delete("mp_oauth_state");
    return response;
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
  const response = NextResponse.redirect(
    new URL(`/${branchId}/configuracion?mp=connected`, req.url)
  );
  response.cookies.delete("mp_oauth_state");
  return response;
}
