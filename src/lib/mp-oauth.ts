import { createHash, randomBytes } from "node:crypto";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getMercadoPagoCallbackUrl(originOrBaseUrl?: string | null) {
  const baseUrl = originOrBaseUrl?.trim();
  if (!baseUrl) {
    return null;
  }

  return `${normalizeBaseUrl(baseUrl)}/api/mp/callback`;
}

export function generateMercadoPagoCodeVerifier() {
  return randomBytes(64).toString("base64url");
}

export function generateMercadoPagoCodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
