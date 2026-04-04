import "server-only";

import {
  BUSINESS_ACTIVITY_OPTIONS,
  DEFAULT_BUSINESS_ACTIVITY_CODE,
  getBusinessActivityOptionFromList,
  normalizeBusinessActivityCode,
  type BusinessActivityOption,
} from "@/lib/business-activities";
import { prisma } from "@/lib/prisma";

let seedPromise: Promise<void> | null = null;

function cleanText(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function mapStoredActivity(activity: {
  code: string;
  label: string;
  description: string | null;
  seedDefaultCatalog: boolean;
  isActive: boolean;
  sortOrder: number;
}): BusinessActivityOption {
  return {
    value: activity.code,
    label: activity.label,
    description: activity.description?.trim() || "Rubro personalizado de Clikit.",
    seedDefaultCatalog: activity.seedDefaultCatalog,
    isActive: activity.isActive,
    sortOrder: activity.sortOrder,
  };
}

export async function ensureBusinessActivitiesSeeded() {
  const existing = await prisma.platformBusinessActivity.findMany({
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((activity) => activity.code));
  const missingDefaults = BUSINESS_ACTIVITY_OPTIONS.filter(
    (option) => !existingCodes.has(option.value),
  );

  if (missingDefaults.length === 0) {
    return;
  }

  if (!seedPromise) {
    seedPromise = (async () => {
      for (const option of missingDefaults) {
        await prisma.platformBusinessActivity.upsert({
          where: { code: option.value },
          update: {},
          create: {
            code: option.value,
            label: option.label,
            description: option.description,
            seedDefaultCatalog: option.seedDefaultCatalog,
            isActive: option.isActive,
            sortOrder: option.sortOrder,
          },
        });
      }
    })().finally(() => {
      seedPromise = null;
    });
  }

  await seedPromise;
}

export async function listBusinessActivityOptions(args?: { includeInactive?: boolean }) {
  await ensureBusinessActivitiesSeeded();

  const activities = await prisma.platformBusinessActivity.findMany({
    where: args?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      code: true,
      label: true,
      description: true,
      seedDefaultCatalog: true,
      isActive: true,
      sortOrder: true,
    },
  });

  return activities.map(mapStoredActivity);
}

export async function getBusinessActivityOptionByValue(
  value: string | null | undefined,
  args?: { includeInactive?: boolean },
) {
  const normalizedCode = normalizeBusinessActivityCode(value, "");
  if (!normalizedCode) {
    return null;
  }

  const activities = await listBusinessActivityOptions(args);
  return getBusinessActivityOptionFromList(activities, normalizedCode);
}

export async function isValidBusinessActivity(value: unknown) {
  const normalizedCode = normalizeBusinessActivityCode(value, "");
  if (!normalizedCode) {
    return false;
  }

  const activity = await getBusinessActivityOptionByValue(normalizedCode);
  return Boolean(activity);
}

export async function shouldSeedDefaultCatalogForBusinessActivity(
  value: string | null | undefined,
) {
  const activity = await getBusinessActivityOptionByValue(value);
  return activity?.seedDefaultCatalog ?? false;
}

export async function createBusinessActivity(args: {
  label: string;
  code?: string | null;
  description?: string | null;
  seedDefaultCatalog?: boolean;
}) {
  await ensureBusinessActivitiesSeeded();

  const label = cleanText(args.label);
  if (!label) {
    throw new Error("El rubro necesita un nombre.");
  }

  const code = normalizeBusinessActivityCode(args.code ?? label, "");
  if (!code) {
    throw new Error("No se pudo generar un codigo valido para el rubro.");
  }

  const existing = await prisma.platformBusinessActivity.findUnique({
    where: { code },
    select: { code: true },
  });
  if (existing) {
    throw new Error("Ya existe un rubro con ese codigo.");
  }

  const currentMax = await prisma.platformBusinessActivity.aggregate({
    _max: { sortOrder: true },
  });

  const created = await prisma.platformBusinessActivity.create({
    data: {
      code,
      label,
      description: cleanText(args.description),
      seedDefaultCatalog: Boolean(args.seedDefaultCatalog),
      isActive: true,
      sortOrder: (currentMax._max.sortOrder ?? 0) + 10,
    },
    select: {
      code: true,
      label: true,
      description: true,
      seedDefaultCatalog: true,
      isActive: true,
      sortOrder: true,
    },
  });

  return mapStoredActivity(created);
}

export async function resolveBusinessActivityForKiosco(kioscoId: string | null | undefined) {
  if (!kioscoId) {
    return DEFAULT_BUSINESS_ACTIVITY_CODE;
  }

  const kiosco = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { mainBusinessActivity: true },
  });

  return normalizeBusinessActivityCode(
    kiosco?.mainBusinessActivity,
    DEFAULT_BUSINESS_ACTIVITY_CODE,
  );
}
