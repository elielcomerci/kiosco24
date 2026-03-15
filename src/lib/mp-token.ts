import { prisma } from "@/lib/prisma";

/**
 * Devuelve un access_token vigente para el Branch dado.
 * Si expira en menos de 24 horas, lo renueva automáticamente con el refresh_token.
 * El refresh_token de MP se rota en cada renovación — se guarda el nuevo.
 */
export async function getMpAccessTokenForBranch(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      mpAccessToken: true,
      mpRefreshToken: true,
      mpTokenExpiresAt: true,
    },
  });

  if (!branch?.mpAccessToken) {
    throw new Error("Esta sucursal no tiene MercadoPago conectado.");
  }

  // Renovar si faltan menos de 24 horas para expirar
  const expiresAt = branch.mpTokenExpiresAt;
  const almostExpired =
    !expiresAt || expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  if (almostExpired && branch.mpRefreshToken) {
    const refreshRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID!,
        client_secret: process.env.MP_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: branch.mpRefreshToken,
      }),
    });

    if (refreshRes.ok) {
      const fresh = await refreshRes.json();
      await prisma.branch.update({
        where: { id: branchId },
        data: {
          mpAccessToken: fresh.access_token,
          mpRefreshToken: fresh.refresh_token, // MP rota el refresh_token en cada uso
          mpTokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        },
      });
      return fresh.access_token;
    }
    // Si el refresh falla (token revocado), retorna el existente y deja que el
    // llamador maneje el error 401 de MP
  }

  return branch.mpAccessToken;
}
