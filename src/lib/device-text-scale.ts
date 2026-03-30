export const DEVICE_TEXT_SCALE_COOKIE = "k24_text_scale";

export type DeviceTextScale = "compact" | "default" | "large";

export const DEFAULT_DEVICE_TEXT_SCALE: DeviceTextScale = "default";

export function normalizeDeviceTextScale(value: unknown): DeviceTextScale {
  if (value === "compact" || value === "default" || value === "large") {
    return value;
  }

  return DEFAULT_DEVICE_TEXT_SCALE;
}
