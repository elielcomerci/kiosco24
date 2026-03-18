import bcrypt from "bcryptjs";

const EMPLOYEE_PIN_HASH_RE = /^\$2[aby]\$/;

export class InvalidEmployeePinError extends Error {
  constructor() {
    super("INVALID_EMPLOYEE_PIN");
  }
}

export function normalizeEmployeePinInput(pin: string | null | undefined) {
  if (pin === undefined) {
    return undefined;
  }

  const trimmed = typeof pin === "string" ? pin.trim() : "";
  if (!trimmed) {
    return null;
  }

  if (!/^\d{1,6}$/.test(trimmed)) {
    throw new InvalidEmployeePinError();
  }

  return trimmed;
}

export function isEmployeePinHash(pin: string) {
  return EMPLOYEE_PIN_HASH_RE.test(pin);
}

export async function prepareEmployeePinForStorage(pin: string | null | undefined) {
  const normalizedPin = normalizeEmployeePinInput(pin);

  if (normalizedPin === undefined) {
    return undefined;
  }

  if (normalizedPin === null) {
    return null;
  }

  return bcrypt.hash(normalizedPin, 10);
}

export async function verifyEmployeePinValue(storedPin: string, candidatePin: string) {
  const normalizedCandidate = normalizeEmployeePinInput(candidatePin);
  if (!normalizedCandidate) {
    return { ok: false, upgradedHash: undefined as string | undefined };
  }

  if (isEmployeePinHash(storedPin)) {
    const ok = await bcrypt.compare(normalizedCandidate, storedPin);
    return { ok, upgradedHash: undefined as string | undefined };
  }

  const ok = storedPin === normalizedCandidate;
  return {
    ok,
    upgradedHash: ok ? await bcrypt.hash(normalizedCandidate, 10) : undefined,
  };
}
