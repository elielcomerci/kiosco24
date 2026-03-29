import Afip from "@afipsdk/afip.js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import type { FiscalEnvironmentValue } from "@/lib/fiscal";

type FiscalProfileServerLike = {
  cuit: string;
  environment: FiscalEnvironmentValue;
  afipAccessToken?: string | null;
};

export function isAfipProductionEnabled() {
  return process.env.AFIPSDK_PRODUCTION_ENABLED === "true";
}

function isSharedTestTokenEnabled() {
  return process.env.AFIPSDK_SHARED_TEST_TOKEN_ENABLED === "true";
}

export function getSharedTestAfipAccessToken() {
  if (!isSharedTestTokenEnabled()) {
    return null;
  }

  const token = process.env.AFIPSDK_ACCESS_TOKEN?.trim();
  return token || null;
}

function getFiscalTokenCipherKey() {
  const secret = (process.env.FISCAL_TOKEN_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!secret) {
    throw new Error("Falta FISCAL_TOKEN_SECRET o AUTH_SECRET para cifrar tokens fiscales.");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptFiscalAccessToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return null;

  if (normalized.startsWith("enc:v1:")) {
    return normalized;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getFiscalTokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptFiscalAccessToken(token: string | null | undefined) {
  const normalized = token?.trim();
  if (!normalized) return null;

  if (!normalized.startsWith("enc:v1:")) {
    return normalized;
  }

  const [, , ivBase64, tagBase64, payloadBase64] = normalized.split(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("El token fiscal guardado tiene un formato invalido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getFiscalTokenCipherKey(),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function resolveProfileAfipAccessToken(profile: FiscalProfileServerLike) {
  const ownToken = decryptFiscalAccessToken(profile.afipAccessToken);
  if (ownToken) {
    return ownToken;
  }

  if (profile.environment === "TEST") {
    const sharedTestToken = getSharedTestAfipAccessToken();
    if (sharedTestToken) {
      return sharedTestToken;
    }
  }

  if (profile.environment === "PROD") {
    throw new Error("Falta el access token de AfipSDK para este kiosco.");
  }

  throw new Error("Falta el access token de AfipSDK. Cargalo en la configuracion fiscal del kiosco.");
}

export function getAfipInstance(profile: FiscalProfileServerLike) {
  const requestedProduction = profile.environment === "PROD";
  const production = requestedProduction && isAfipProductionEnabled();

  if (requestedProduction && !production) {
    throw new Error(
      "La sucursal esta configurada para produccion, pero este entorno no habilita AFIP real.",
    );
  }

  return new Afip({
    CUIT: Number(profile.cuit),
    access_token: resolveProfileAfipAccessToken(profile),
    production,
  });
}
