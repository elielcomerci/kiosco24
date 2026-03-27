import {
  type AccessGrantKind,
  type KioscoAccessOverride,
  type SubscriptionStatus,
  type UserRole,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platform-admin";

type SessionUserLike = {
  id?: string;
  role?: UserRole;
  email?: string | null;
  employeeId?: string;
  branchId?: string;
};

export type ActiveAccessGrant = {
  id: string;
  kind: AccessGrantKind;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
};

export type ManualAccessOverride = {
  mode: KioscoAccessOverride;
  note: string | null;
  changedAt: Date | null;
};

export type AccessBlockReason =
  | "PLATFORM_ADMIN"
  | "ADMIN_FORCE_ALLOW"
  | "ADMIN_FORCE_BLOCK"
  | "NO_KIOSCO"
  | "SUBSCRIPTION_ACTIVE"
  | "ACTIVE_GRACE"
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_PENDING"
  | "SUBSCRIPTION_PAUSED"
  | "SUBSCRIPTION_CANCELLED"
  | "NO_BRANCH"
  | "UNAUTHORIZED";

export type KioscoAccessContext = {
  allowed: boolean;
  reason: AccessBlockReason;
  isPlatformAdmin: boolean;
  kioscoId: string | null;
  kioscoName: string | null;
  firstBranchId: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  managementUrl: string | null;
  activeGrant: ActiveAccessGrant | null;
  manualOverride: ManualAccessOverride | null;
};

const activeGrantSelect = {
  id: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  note: true,
} as const;

const kioscoAccessSelect = {
  id: true,
  name: true,
  branches: {
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { id: true },
  },
  subscription: {
    select: {
      status: true,
      managementUrl: true,
    },
  },
  accessGrants: {
    where: {
      revokedAt: null,
    },
    orderBy: { endsAt: "desc" },
    take: 5,
    select: activeGrantSelect,
  },
  accessOverride: true,
  accessOverrideNote: true,
  accessOverrideAt: true,
} as const;

function mapSubscriptionReason(status: SubscriptionStatus | null): AccessBlockReason {
  switch (status) {
    case "ACTIVE":
      return "SUBSCRIPTION_ACTIVE";
    case "PENDING":
      return "SUBSCRIPTION_PENDING";
    case "PAUSED":
      return "SUBSCRIPTION_PAUSED";
    case "CANCELLED":
      return "SUBSCRIPTION_CANCELLED";
    default:
      return "NO_SUBSCRIPTION";
  }
}

function buildContext(input: {
  kioscoId: string | null;
  kioscoName: string | null;
  firstBranchId?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
  managementUrl?: string | null;
  activeGrant?: ActiveAccessGrant | null;
  manualOverride?: ManualAccessOverride | null;
  isPlatformAdmin?: boolean;
}): KioscoAccessContext {
  if (input.isPlatformAdmin) {
    return {
      allowed: true,
      reason: "PLATFORM_ADMIN",
      isPlatformAdmin: true,
      kioscoId: input.kioscoId ?? null,
      kioscoName: input.kioscoName ?? null,
      firstBranchId: input.firstBranchId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      managementUrl: input.managementUrl ?? null,
      activeGrant: input.activeGrant ?? null,
      manualOverride: input.manualOverride ?? null,
    };
  }

  if (input.manualOverride?.mode === "FORCE_BLOCK") {
    return {
      allowed: false,
      reason: "ADMIN_FORCE_BLOCK",
      isPlatformAdmin: false,
      kioscoId: input.kioscoId ?? null,
      kioscoName: input.kioscoName ?? null,
      firstBranchId: input.firstBranchId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      managementUrl: input.managementUrl ?? null,
      activeGrant: input.activeGrant ?? null,
      manualOverride: input.manualOverride,
    };
  }

  if (input.manualOverride?.mode === "FORCE_ALLOW") {
    return {
      allowed: true,
      reason: "ADMIN_FORCE_ALLOW",
      isPlatformAdmin: false,
      kioscoId: input.kioscoId ?? null,
      kioscoName: input.kioscoName ?? null,
      firstBranchId: input.firstBranchId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      managementUrl: input.managementUrl ?? null,
      activeGrant: input.activeGrant ?? null,
      manualOverride: input.manualOverride,
    };
  }

  if (input.activeGrant) {
    return {
      allowed: true,
      reason: "ACTIVE_GRACE",
      isPlatformAdmin: false,
      kioscoId: input.kioscoId ?? null,
      kioscoName: input.kioscoName ?? null,
      firstBranchId: input.firstBranchId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      managementUrl: input.managementUrl ?? null,
      activeGrant: input.activeGrant,
      manualOverride: input.manualOverride ?? null,
    };
  }

  if (input.subscriptionStatus === "ACTIVE") {
    return {
      allowed: true,
      reason: "SUBSCRIPTION_ACTIVE",
      isPlatformAdmin: false,
      kioscoId: input.kioscoId ?? null,
      kioscoName: input.kioscoName ?? null,
      firstBranchId: input.firstBranchId ?? null,
      subscriptionStatus: "ACTIVE",
      managementUrl: input.managementUrl ?? null,
      activeGrant: null,
      manualOverride: input.manualOverride ?? null,
    };
  }

  return {
    allowed: false,
    reason: input.kioscoId ? mapSubscriptionReason(input.subscriptionStatus ?? null) : "NO_KIOSCO",
    isPlatformAdmin: false,
    kioscoId: input.kioscoId ?? null,
    kioscoName: input.kioscoName ?? null,
    firstBranchId: input.firstBranchId ?? null,
    subscriptionStatus: input.subscriptionStatus ?? null,
    managementUrl: input.managementUrl ?? null,
    activeGrant: null,
    manualOverride: input.manualOverride ?? null,
  };
}

export function getAccessBlockMessage(reason: AccessBlockReason) {
  switch (reason) {
    case "NO_SUBSCRIPTION":
      return "No hay una suscripcion activa para este kiosco.";
    case "ADMIN_FORCE_BLOCK":
      return "La cuenta fue bloqueada manualmente por un administrador.";
    case "SUBSCRIPTION_PENDING":
      return "La suscripcion todavia esta pendiente de activacion.";
    case "SUBSCRIPTION_PAUSED":
      return "La suscripcion esta pausada.";
    case "SUBSCRIPTION_CANCELLED":
      return "La suscripcion fue cancelada.";
    case "NO_KIOSCO":
      return "Todavia no se termino de configurar el kiosco.";
    case "NO_BRANCH":
      return "No se encontro la sucursal asociada.";
    default:
      return "El acceso a este kiosco esta bloqueado.";
  }
}

export async function getKioscoAccessContextForSession(user: SessionUserLike | null | undefined): Promise<KioscoAccessContext> {
  if (!user?.id) {
    return {
      allowed: false,
      reason: "UNAUTHORIZED",
      isPlatformAdmin: false,
      kioscoId: null,
      kioscoName: null,
      firstBranchId: null,
      subscriptionStatus: null,
      managementUrl: null,
      activeGrant: null,
      manualOverride: null,
    };
  }

  if (isPlatformAdmin(user)) {
    return buildContext({
      kioscoId: null,
      kioscoName: "Plataforma",
      isPlatformAdmin: true,
    });
  }

  const now = new Date();
  const activeGrant = (grants: Array<ActiveAccessGrant & { endsAt: Date }>) =>
    grants.find((grant) => grant.startsAt <= now && grant.endsAt >= now) ?? null;
  const manualOverride = (kiosco: {
    accessOverride: KioscoAccessOverride;
    accessOverrideNote: string | null;
    accessOverrideAt: Date | null;
  }): ManualAccessOverride | null =>
    kiosco.accessOverride === "INHERIT"
      ? null
      : {
          mode: kiosco.accessOverride,
          note: kiosco.accessOverrideNote,
          changedAt: kiosco.accessOverrideAt,
        };

  if (user.role === "EMPLOYEE") {
    if (user.branchId) {
      const branch = await prisma.branch.findUnique({
          where: { id: user.branchId },
          select: {
            id: true,
            kiosco: {
              select: kioscoAccessSelect,
            },
          },
        });

      if (!branch) {
        return {
          allowed: false,
          reason: "NO_BRANCH",
          isPlatformAdmin: false,
          kioscoId: null,
          kioscoName: null,
          firstBranchId: null,
          subscriptionStatus: null,
          managementUrl: null,
          activeGrant: null,
          manualOverride: null,
        };
      }

      return buildContext({
        kioscoId: branch.kiosco.id,
        kioscoName: branch.kiosco.name,
        firstBranchId: branch.id,
        subscriptionStatus: branch.kiosco.subscription?.status ?? null,
        managementUrl: branch.kiosco.subscription?.managementUrl ?? null,
        activeGrant: activeGrant(branch.kiosco.accessGrants),
        manualOverride: manualOverride(branch.kiosco),
      });
    }

    const employee = user.employeeId
      ? await prisma.employee.findUnique({
          where: { id: user.employeeId },
          select: {
            kioscoId: true,
            branches: {
              where: user.branchId ? { id: user.branchId } : undefined,
              take: 1,
              select: { id: true },
            },
            kiosco: {
              select: kioscoAccessSelect,
            },
          },
        })
      : null;

    if (!employee) {
      return {
        allowed: false,
        reason: "NO_BRANCH",
        isPlatformAdmin: false,
        kioscoId: null,
        kioscoName: null,
        firstBranchId: null,
        subscriptionStatus: null,
        managementUrl: null,
        activeGrant: null,
        manualOverride: null,
      };
    }

    const kiosco = employee.kiosco;
    const activeBranchId = user.branchId || employee.branches[0]?.id || kiosco.branches[0]?.id || null;
    return buildContext({
      kioscoId: kiosco.id,
      kioscoName: kiosco.name,
      firstBranchId: activeBranchId,
      subscriptionStatus: kiosco.subscription?.status ?? null,
      managementUrl: kiosco.subscription?.managementUrl ?? null,
      activeGrant: activeGrant(kiosco.accessGrants),
      manualOverride: manualOverride(kiosco),
    });
  }

  const owner = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      kiosco: {
        select: kioscoAccessSelect,
      },
    },
  });

  return buildContext({
    kioscoId: owner?.kiosco?.id ?? null,
    kioscoName: owner?.kiosco?.name ?? null,
    firstBranchId: owner?.kiosco?.branches[0]?.id ?? null,
    subscriptionStatus: owner?.kiosco?.subscription?.status ?? null,
    managementUrl: owner?.kiosco?.subscription?.managementUrl ?? null,
    activeGrant: owner?.kiosco ? activeGrant(owner.kiosco.accessGrants) : null,
    manualOverride: owner?.kiosco ? manualOverride(owner.kiosco) : null,
  });
}

export async function getKioscoAccessContextByAccessKey(accessKey: string): Promise<KioscoAccessContext> {
  const now = new Date();
  const branch = await prisma.branch.findUnique({
    where: { accessKey },
    select: {
      id: true,
      kiosco: {
        select: kioscoAccessSelect,
      },
    },
  });

  if (!branch) {
    return {
      allowed: false,
      reason: "NO_BRANCH",
      isPlatformAdmin: false,
      kioscoId: null,
      kioscoName: null,
      firstBranchId: null,
      subscriptionStatus: null,
      managementUrl: null,
      activeGrant: null,
      manualOverride: null,
    };
  }

  return buildContext({
    kioscoId: branch.kiosco.id,
    kioscoName: branch.kiosco.name,
    firstBranchId: branch.id,
    subscriptionStatus: branch.kiosco.subscription?.status ?? null,
    managementUrl: branch.kiosco.subscription?.managementUrl ?? null,
    activeGrant: branch.kiosco.accessGrants.find((grant) => grant.startsAt <= now && grant.endsAt >= now) ?? null,
    manualOverride:
      branch.kiosco.accessOverride === "INHERIT"
        ? null
        : {
            mode: branch.kiosco.accessOverride,
            note: branch.kiosco.accessOverrideNote,
            changedAt: branch.kiosco.accessOverrideAt,
          },
  });
}

export async function guardOperationalAccess(user: SessionUserLike | null | undefined) {
  const access = await getKioscoAccessContextForSession(user);
  if (access.allowed) {
    return null;
  }

  return NextResponse.json(
    {
      error: getAccessBlockMessage(access.reason),
      code: access.reason,
    },
    { status: 402 },
  );
}
