import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getBranchId } from "@/lib/branch";

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

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const authUrl = new URL("https://auth.mercadopago.com.ar/authorization");
  authUrl.searchParams.set("client_id", process.env.MP_CLIENT_ID!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXTAUTH_URL}/api/mp/callback`
  );
  // offline_access = habilita el refresh_token para renovar sin re-autorizar
  authUrl.searchParams.set("scope", "offline_access read write");
  // El state viaja de ida y vuelta — lo usamos para saber a qué branch guardar los tokens
  authUrl.searchParams.set("state", branchId);

  return NextResponse.redirect(authUrl.toString());
}
