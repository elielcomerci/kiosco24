import type { UserRole } from "@prisma/client";

import { getBusinessActivityLabel } from "@/lib/business-activities";
import { isPlatformAdmin } from "@/lib/platform-admin";

type AppEntryUserLike = {
  id?: string;
  role?: UserRole | null;
  email?: string | null;
  branchId?: string | null;
  mainBusinessActivity?: string | null;
  appStartPath?: string | null;
};

type AppAccessLike = {
  allowed: boolean;
  reason: string;
  firstBranchId?: string | null;
  kioscoId?: string | null;
};

function canStartInSetup(
  user: AppEntryUserLike | null | undefined,
  access: Pick<AppAccessLike, "allowed" | "reason" | "kioscoId">,
) {
  if (access.allowed) {
    return true;
  }

  if (!user?.id || user.role === "EMPLOYEE" || !access.kioscoId) {
    return false;
  }

  return (
    access.reason === "NO_SUBSCRIPTION" ||
    access.reason === "SUBSCRIPTION_PENDING" ||
    access.reason === "SUBSCRIPTION_PAUSED" ||
    access.reason === "SUBSCRIPTION_CANCELLED"
  );
}

export function resolveAccessAwareAppStartPath(
  user: AppEntryUserLike | null | undefined,
  access: Pick<AppAccessLike, "allowed" | "reason" | "firstBranchId" | "kioscoId">,
) {
  if (isPlatformAdmin(user)) {
    return "/admin";
  }

  if (access.reason === "NO_KIOSCO" || !access.kioscoId) {
    return "/onboarding";
  }

  if (!access.allowed) {
    if (!canStartInSetup(user, access)) {
      return "/suscripcion";
    }

    if (access.firstBranchId) {
      return `/${access.firstBranchId}/productos`;
    }

    return "/onboarding";
  }

  if (access.firstBranchId) {
    return `/${access.firstBranchId}/caja`;
  }

  return "/onboarding";
}

export function resolveSessionAppStartPath(user: AppEntryUserLike | null | undefined) {
  if (!user) {
    return "/login";
  }

  if (isPlatformAdmin(user)) {
    return "/admin";
  }

  if (typeof user.appStartPath === "string" && user.appStartPath) {
    return user.appStartPath;
  }

  if (typeof user.branchId === "string" && user.branchId) {
    return `/${user.branchId}/caja`;
  }

  return "/onboarding";
}

export function resolveSessionAppLabel(user: AppEntryUserLike | null | undefined) {
  if (!user) {
    return "Abrir mi negocio";
  }

  if (isPlatformAdmin(user)) {
    return "Ir al admin";
  }

  const appStartPath = resolveSessionAppStartPath(user);
  const activityLabel = getBusinessActivityLabel(user.mainBusinessActivity).trim().toLowerCase();
  const hasSpecificActivity = activityLabel.length > 0 && activityLabel !== "otro";

  if (appStartPath === "/suscripcion") {
    return hasSpecificActivity ? `Activar mi ${activityLabel}` : "Activar mi negocio";
  }

  if (appStartPath.endsWith("/productos")) {
    return hasSpecificActivity ? `Configurar mi ${activityLabel}` : "Configurar mi negocio";
  }

  return hasSpecificActivity ? `Abrir mi ${activityLabel}` : "Abrir mi negocio";
}
