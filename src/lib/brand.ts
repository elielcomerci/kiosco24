export const APP_NAME = "Clikit";
export const LEGACY_APP_NAME = "Kiosco24";

const FALLBACK_BRAND_ASSET_BASE_URL = "https://media.zap.com.ar/branding";

function getBrandAssetBaseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_BRAND_ASSET_BASE_URL?.trim();
  return (fromEnv || FALLBACK_BRAND_ASSET_BASE_URL).replace(/\/+$/, "");
}

function buildBrandAssetUrl(fileName: string) {
  return `${getBrandAssetBaseUrl()}/${fileName}`;
}

export const BRAND_ICON_SRC = buildBrandAssetUrl("clikit.svg");
export const BRAND_WORDMARK_BLUE_SRC = buildBrandAssetUrl("clikit-blue.svg");
export const BRAND_WORDMARK_WHITE_SRC = buildBrandAssetUrl("clikit-white.svg");

export const SOUND_STORAGE_KEY = "clikit_sound_enabled";
export const LEGACY_SOUND_STORAGE_KEY = "kiosco24_sound_enabled";
export const SOUND_TOGGLE_EVENT = "clikit_sound_toggle";
export const LEGACY_SOUND_TOGGLE_EVENT = "kiosco24_sound_toggle";

export const PRINT_EVENT = "clikit:print";
export const LEGACY_PRINT_EVENT = "kiosco24:print";

export const TRIAL_WELCOME_STORAGE_KEY = "clikit_trial_welcome_seen";
export const LEGACY_TRIAL_WELCOME_STORAGE_KEY = "kiosco24_trial_welcome_seen";

export const OFFLINE_DB_NAME = "clikit-db";
export const LEGACY_OFFLINE_DB_NAME = "kiosco24-db";

export function getMercadoPagoPosExternalIds(branchId: string) {
  return [`clikit-pos-${branchId}`, `kiosco24-pos-${branchId}`] as const;
}

export function getMercadoPagoStoreExternalIds(branchId: string) {
  return [`clikit-store-${branchId}`, `kiosco24-store-${branchId}`] as const;
}
