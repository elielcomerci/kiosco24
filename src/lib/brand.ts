export const APP_NAME = "Clikit";
export const LEGACY_APP_NAME = "Kiosco24";

export const BRAND_ICON_SRC = "/clikit.svg";
export const BRAND_WORDMARK_BLUE_SRC = "/clikit-blue.svg";
export const BRAND_WORDMARK_WHITE_SRC = "/clikit-white.svg";

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
