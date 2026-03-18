import { UserRole } from "@prisma/client";

type AdminCandidate = {
  role?: UserRole | null;
  email?: string | null;
};

function getConfiguredPlatformAdmins() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(candidate: AdminCandidate | null | undefined) {
  if (!candidate) {
    return false;
  }

  if (candidate.role === UserRole.PLATFORM_ADMIN) {
    return true;
  }

  const email = candidate.email?.trim().toLowerCase();
  if (!email) {
    return false;
  }

  return getConfiguredPlatformAdmins().includes(email);
}
