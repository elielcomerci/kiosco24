import {
  DEFAULT_BUSINESS_ACTIVITY_CODE,
  normalizeBusinessActivityCode,
} from "@/lib/business-activities";

const ACCESS_KEY_SEGMENT_PATTERN = "[A-Z0-9]{8}";
const ACCESS_KEY_SEGMENT_RE = new RegExp(`^${ACCESS_KEY_SEGMENT_PATTERN}$`);

export const BRANCH_ACCESS_KEY_RE = new RegExp(
  `^[A-Z0-9_]+-${ACCESS_KEY_SEGMENT_PATTERN}-${ACCESS_KEY_SEGMENT_PATTERN}$`,
);

export const BRANCH_ACCESS_KEY_PATH_RE = new RegExp(
  `^/[A-Z0-9_]+-${ACCESS_KEY_SEGMENT_PATTERN}-${ACCESS_KEY_SEGMENT_PATTERN}$`,
  "i",
);

export const BRANCH_ACCESS_KEY_PLACEHOLDER = "ALMACEN-AB12CD34-EF56GH78";

export function normalizeBranchAccessKey(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isBranchAccessKey(value: string | null | undefined) {
  const normalized = normalizeBranchAccessKey(value);
  return normalized.length > 0 && BRANCH_ACCESS_KEY_RE.test(normalized);
}

export function isBranchAccessKeyPath(pathname: string | null | undefined) {
  return BRANCH_ACCESS_KEY_PATH_RE.test(typeof pathname === "string" ? pathname.trim() : "");
}

export function getBranchAccessKeyPrefix(businessActivity: string | null | undefined) {
  return normalizeBusinessActivityCode(businessActivity, DEFAULT_BUSINESS_ACTIVITY_CODE);
}

function normalizeAccessKeySegment(segment: string) {
  const normalized = normalizeBranchAccessKey(segment);
  if (!ACCESS_KEY_SEGMENT_RE.test(normalized)) {
    throw new Error("Invalid branch access key segment.");
  }
  return normalized;
}

export function formatBranchAccessKey(
  businessActivity: string | null | undefined,
  firstSegment: string,
  secondSegment: string,
) {
  return [
    getBranchAccessKeyPrefix(businessActivity),
    normalizeAccessKeySegment(firstSegment),
    normalizeAccessKeySegment(secondSegment),
  ].join("-");
}
