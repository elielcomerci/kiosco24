import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getBranchId } from "@/lib/branch";
import {
  generateMercadoPagoCodeChallenge,
  generateMercadoPagoCodeVerifier,
  getMercadoPagoCallbackUrl,
} from "@/lib/mp-oauth";

/**
 * GET /api/mp/auth
 * Genera la URL de autorización de MP y redirige al dueño.
 * El branchId va en el state para recuperarlo en el callback.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const requestedBranchId = req.nextUrl.searchParams.get("branchId");
  const branchId = requestedBranchId || (await getBranchId(req, session.user.id));
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const redirectUri = getMercadoPagoCallbackUrl(process.env.NEXTAUTH_URL || req.nextUrl.origin);
  if (!redirectUri || !process.env.MP_CLIENT_ID) {
    return NextResponse.json({ error: "MercadoPago OAuth no configurado" }, { status: 500 });
  }

  const oauthState = crypto.randomUUID();
  const codeVerifier = generateMercadoPagoCodeVerifier();
  const codeChallenge = generateMercadoPagoCodeChallenge(codeVerifier);
  const authUrl = new URL("https://auth.mercadopago.com/authorization");
  authUrl.searchParams.set("client_id", process.env.MP_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", oauthState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("mp_oauth_state", JSON.stringify({ state: oauthState, branchId, codeVerifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUri.startsWith("https://"),
    path: "/api/mp",
    maxAge: 60 * 10,
  });

  return response;
}
