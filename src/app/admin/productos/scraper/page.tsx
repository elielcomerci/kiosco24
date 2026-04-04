import {
  PlatformProductStatus,
  ScrapedProductReviewAction,
  ScrapedProductSyncStatus,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  buildPlatformSubmissionDraft,
  findApprovedPlatformProductByBarcode,
  getPlatformDraftChanges,
  type PlatformDraftChangeField,
} from "@/lib/platform-catalog";
import {
  DEFAULT_BUSINESS_ACTIVITY_CODE,
  getBusinessActivityLabel,
  normalizeBusinessActivityCode,
} from "@/lib/business-activities";
import {
  normalizeCatalogBarcode,
  normalizeCatalogDescription,
  normalizeCatalogOptionalTitle,
  normalizeCatalogTitle,
} from "@/lib/catalog-text";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

const pendingSyncStatuses = [
  ScrapedProductSyncStatus.NEW,
  ScrapedProductSyncStatus.MATCHED,
  ScrapedProductSyncStatus.CONFLICT,
] as const;

const scrapedProductReviewInclude = {
  remotePlatformProduct: {
    select: {
      id: true,
      barcode: true,
      businessActivity: true,
      name: true,
      brand: true,
      categoryName: true,
      description: true,
      presentation: true,
      image: true,
      status: true,
      variants: {
        select: {
          id: true,
          name: true,
          barcode: true,
        },
        orderBy: { name: "asc" },
      },
    },
  },
} as const;

const platformChangeLabels: Record<PlatformDraftChangeField, string> = {
  barcode: "Codigo de barras",
  businessActivity: "Rubro",
  name: "Nombre",
  brand: "Marca",
  categoryName: "Categoria",
  description: "Descripcion",
  presentation: "Presentacion",
  image: "Imagen",
  variants: "Variantes",
};

type ComparisonProduct = {
  id: string;
  barcode: string | null;
  businessActivity: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  status?: PlatformProductStatus;
  variants: Array<{
    id?: string;
    name: string;
    barcode: string | null;
  }>;
};

type ScrapedDraft = {
  barcode: string | null;
  businessActivity: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
  variants: Array<{
    name: string;
    barcode: string | null;
  }>;
};

type DiffRow = {
  field: PlatformDraftChangeField;
  label: string;
  current: string;
  next: string;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatDiffValue(value?: string | null, emptyLabel = "Sin dato") {
  const normalized = cleanText(value);
  return normalized ?? emptyLabel;
}

function buildScrapedDraft(product: {
  barcode: string | null;
  businessActivity?: string | null;
  name: string;
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  presentation: string | null;
  image: string | null;
}): ScrapedDraft {
  return {
    barcode: cleanText(product.barcode),
    businessActivity: normalizeBusinessActivityCode(product.businessActivity),
    name: product.name,
    brand: product.brand,
    categoryName: product.categoryName,
    description: product.description,
    presentation: product.presentation,
    image: product.image,
    variants: [],
  };
}

function buildDiffRows(
  comparisonProduct: ComparisonProduct | null,
  draft: ScrapedDraft,
): DiffRow[] {
  return getPlatformDraftChanges(comparisonProduct, draft).map((field) => {
    switch (field) {
      case "barcode":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.barcode, "Sin barcode base"),
          next: formatDiffValue(draft.barcode, "Sin barcode base"),
        };
      case "name":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.name, "Sin nombre"),
          next: formatDiffValue(draft.name, "Sin nombre"),
        };
      case "businessActivity":
        return {
          field,
          label: platformChangeLabels[field],
          current: comparisonProduct?.businessActivity ?? DEFAULT_BUSINESS_ACTIVITY_CODE,
          next: draft.businessActivity,
        };
      case "brand":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.brand),
          next: formatDiffValue(draft.brand),
        };
      case "categoryName":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.categoryName, "Sin categoria"),
          next: formatDiffValue(draft.categoryName, "Sin categoria"),
        };
      case "description":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.description, "Sin descripcion"),
          next: formatDiffValue(draft.description, "Sin descripcion"),
        };
      case "presentation":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.presentation),
          next: formatDiffValue(draft.presentation),
        };
      case "image":
        return {
          field,
          label: platformChangeLabels[field],
          current: comparisonProduct?.image ? "Imagen cargada" : "Sin imagen",
          next: draft.image ? "Imagen cargada" : "Sin imagen",
        };
      case "variants":
        return {
          field,
          label: platformChangeLabels[field],
          current: comparisonProduct?.variants.length
            ? comparisonProduct.variants.map((variant) => variant.name).join(" | ")
            : "Sin variantes",
          next: "Sin variantes",
        };
      default:
        return {
          field,
          label: platformChangeLabels[field],
          current: "Sin dato",
          next: "Sin dato",
        };
    }
  });
}

function buildScrapedProductsAdminPath(args?: {
  runId?: string | null;
  businessActivity?: string | null;
  bulkPublished?: number;
  bulkSkipped?: number;
  bulkPending?: number;
}) {
  const params = new URLSearchParams();
  const runId = cleanText(args?.runId);
  const businessActivity = cleanText(args?.businessActivity);
  if (runId) {
    params.set("run", runId);
  }
  if (businessActivity) {
    params.set("activity", businessActivity);
  }
  if (typeof args?.bulkPublished === "number" && args.bulkPublished > 0) {
    params.set("bulkPublished", String(args.bulkPublished));
  }
  if (typeof args?.bulkSkipped === "number" && args.bulkSkipped > 0) {
    params.set("bulkSkipped", String(args.bulkSkipped));
  }
  if (typeof args?.bulkPending === "number" && args.bulkPending > 0) {
    params.set("bulkPending", String(args.bulkPending));
  }

  const query = params.toString();
  return query ? `/admin/productos/scraper?${query}` : "/admin/productos/scraper";
}

async function ensurePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!isPlatformAdmin(session.user)) {
    redirect("/");
  }

  return session;
}

async function resolveScrapedComparisonProduct(product: {
  barcode: string | null;
  businessActivity?: string | null;
  remotePlatformProduct: (ComparisonProduct & { status: PlatformProductStatus }) | null;
}) {
  if (product.remotePlatformProduct) {
    return product.remotePlatformProduct;
  }

  if (!product.barcode) {
    return null;
  }

  const matched =
    (product.businessActivity
      ? await findApprovedPlatformProductByBarcode(product.barcode, product.businessActivity)
      : null) ?? (await findApprovedPlatformProductByBarcode(product.barcode));
  if (!matched) {
    return null;
  }

  return {
    id: matched.id,
    barcode: matched.barcode,
    businessActivity: matched.businessActivity,
    name: matched.name,
    brand: matched.brand,
    categoryName: matched.categoryName,
    description: matched.description,
    presentation: matched.presentation,
    image: matched.image,
    status: matched.status,
    variants: matched.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
    })),
  };
}

function buildDraftFromFormData(formData: FormData): ScrapedDraft {
  return {
    barcode: normalizeCatalogBarcode(formData.get("barcode")),
    businessActivity: normalizeBusinessActivityCode(formData.get("businessActivity")),
    name: normalizeCatalogTitle(formData.get("name")),
    brand: normalizeCatalogOptionalTitle(formData.get("brand")),
    categoryName: normalizeCatalogOptionalTitle(formData.get("categoryName")),
    description: normalizeCatalogDescription(formData.get("description")),
    presentation: normalizeCatalogOptionalTitle(formData.get("presentation")),
    image: cleanText(typeof formData.get("image") === "string" ? String(formData.get("image")) : ""),
    variants: [],
  };
}

async function keepScrapedProduct(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const scrapedProductId = String(formData.get("scrapedProductId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  if (!scrapedProductId) {
    return;
  }

  const scrapedProduct = await prisma.scrapedProduct.findUnique({
    where: { id: scrapedProductId },
    include: scrapedProductReviewInclude,
  });

  if (!scrapedProduct) {
    return;
  }

  const comparisonProduct = await resolveScrapedComparisonProduct(scrapedProduct);
  const diffRows = buildDiffRows(comparisonProduct, buildScrapedDraft(scrapedProduct));
  const isDeliberateKeep = Boolean(comparisonProduct && diffRows.length > 0);
  await prisma.scrapedProduct.update({
    where: { id: scrapedProduct.id },
    data: {
      syncStatus: ScrapedProductSyncStatus.SKIPPED,
      reviewAction: isDeliberateKeep
        ? ScrapedProductReviewAction.KEEP_REMOTE
        : ScrapedProductReviewAction.SKIP,
      reviewNote: reviewNote || null,
      remotePlatformProductId:
        comparisonProduct?.id ?? scrapedProduct.remotePlatformProductId ?? null,
      remoteOwnerType: comparisonProduct ? "product" : scrapedProduct.remoteOwnerType,
      publishedAt: null,
    },
  });

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
  revalidatePath("/admin");
}

async function publishScrapedProductById({
  scrapedProductId,
  reviewNote,
  editedDraft,
}: {
  scrapedProductId: string;
  reviewNote?: string | null;
  editedDraft?: ScrapedDraft | null;
}) {
  const scrapedProduct = await prisma.scrapedProduct.findUnique({
    where: { id: scrapedProductId },
    include: scrapedProductReviewInclude,
  });

  if (!scrapedProduct) {
    return { status: "missing" as const };
  }

  const comparisonProduct = await resolveScrapedComparisonProduct(scrapedProduct);
  const originalDraft = buildScrapedDraft(scrapedProduct);
  const nextDraft = editedDraft ?? originalDraft;
  const mergedDraft = buildPlatformSubmissionDraft(comparisonProduct, nextDraft);
  const changedBeforePublish =
    JSON.stringify(originalDraft) !== JSON.stringify(nextDraft);

  if (!mergedDraft.name || !mergedDraft.barcode) {
    return { status: "invalid" as const };
  }

  const platformProduct = comparisonProduct
    ? await prisma.platformProduct.update({
        where: { id: comparisonProduct.id },
        data: {
          barcode: mergedDraft.barcode,
          businessActivity: mergedDraft.businessActivity,
          name: mergedDraft.name,
          brand: mergedDraft.brand,
          categoryName: mergedDraft.categoryName,
          description: mergedDraft.description,
          presentation: mergedDraft.presentation,
          image: mergedDraft.image,
          status: PlatformProductStatus.APPROVED,
        },
        select: { id: true },
      })
    : await prisma.platformProduct.upsert({
        where: { barcode: mergedDraft.barcode },
        update: {
          businessActivity: mergedDraft.businessActivity,
          name: mergedDraft.name,
          brand: mergedDraft.brand,
          categoryName: mergedDraft.categoryName,
          description: mergedDraft.description,
          presentation: mergedDraft.presentation,
          image: mergedDraft.image,
          status: PlatformProductStatus.APPROVED,
        },
        create: {
          barcode: mergedDraft.barcode,
          businessActivity: mergedDraft.businessActivity,
          name: mergedDraft.name,
          brand: mergedDraft.brand,
          categoryName: mergedDraft.categoryName,
          description: mergedDraft.description,
          presentation: mergedDraft.presentation,
          image: mergedDraft.image,
          status: PlatformProductStatus.APPROVED,
        },
        select: { id: true },
      });

  await syncAutoProductsFromPlatformProduct(prisma, platformProduct.id);

  await prisma.scrapedProduct.update({
    where: { id: scrapedProduct.id },
    data: {
      syncStatus: ScrapedProductSyncStatus.PUBLISHED,
      reviewAction: changedBeforePublish
        ? ScrapedProductReviewAction.COMBINE
        : ScrapedProductReviewAction.USE_SCRAPED,
      reviewNote: reviewNote || null,
      publishedAt: new Date(),
      remotePlatformProductId: platformProduct.id,
      remoteOwnerType: "product",
    },
  });

  return {
    status: "published" as const,
    platformProductId: platformProduct.id,
  };
}

async function publishScrapedProduct(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const scrapedProductId = String(formData.get("scrapedProductId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  if (!scrapedProductId) {
    return;
  }

  await publishScrapedProductById({
    scrapedProductId,
    reviewNote,
    editedDraft: buildDraftFromFormData(formData),
  });

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
  revalidatePath("/admin");
}

async function resolveSafeScrapedProducts(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();
  const runId = String(formData.get("runId") ?? "").trim();
  const businessActivity = normalizeBusinessActivityCode(
    typeof formData.get("businessActivity") === "string"
      ? String(formData.get("businessActivity"))
      : "",
    "",
  );
  const pendingProducts = await prisma.scrapedProduct.findMany({
    where: {
      reviewAction: ScrapedProductReviewAction.PENDING,
      syncStatus: {
        in: [...pendingSyncStatuses],
      },
      ...(runId ? { runId } : {}),
      ...(businessActivity ? { businessActivity } : {}),
    },
    include: scrapedProductReviewInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let publishedCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;

  for (const product of pendingProducts) {
    const comparisonProduct = await resolveScrapedComparisonProduct(product);

    if (comparisonProduct) {
      const diffRows = buildDiffRows(comparisonProduct, buildScrapedDraft(product));
      if (diffRows.length === 0) {
        await prisma.scrapedProduct.update({
          where: { id: product.id },
          data: {
            syncStatus: ScrapedProductSyncStatus.SKIPPED,
            reviewAction: ScrapedProductReviewAction.SKIP,
            reviewNote: null,
            remotePlatformProductId: comparisonProduct.id,
            remoteOwnerType: "product",
            publishedAt: null,
          },
        });
        skippedCount += 1;
      } else {
        pendingCount += 1;
      }
      continue;
    }

    const result = await publishScrapedProductById({
      scrapedProductId: product.id,
      reviewNote: "Publicado en lote desde admin.",
    });

    if (result.status === "published") {
      publishedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
  revalidatePath("/admin");
  redirect(
    buildScrapedProductsAdminPath({
      runId,
      businessActivity,
      bulkPublished: publishedCount,
      bulkSkipped: skippedCount,
      bulkPending: pendingCount,
    }),
  );
}

export default async function AdminScrapedProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    run?: string;
    activity?: string;
    bulkPublished?: string;
    bulkSkipped?: string;
    bulkPending?: string;
  }>;
}) {
  await ensurePlatformAdmin();
  const params = (await searchParams) ?? {};
  const selectedRunId = typeof params.run === "string" ? params.run.trim() : "";
  const selectedBusinessActivity = normalizeBusinessActivityCode(
    typeof params.activity === "string" ? params.activity : "",
    "",
  );
  const bulkPublishedCount =
    typeof params.bulkPublished === "string" ? Number.parseInt(params.bulkPublished, 10) || 0 : 0;
  const bulkSkippedCount =
    typeof params.bulkSkipped === "string" ? Number.parseInt(params.bulkSkipped, 10) || 0 : 0;
  const bulkPendingCount =
    typeof params.bulkPending === "string" ? Number.parseInt(params.bulkPending, 10) || 0 : 0;

  const pendingWhere = {
    reviewAction: ScrapedProductReviewAction.PENDING,
    syncStatus: {
      in: [...pendingSyncStatuses],
    },
    ...(selectedRunId ? { runId: selectedRunId } : {}),
    ...(selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : {}),
  };

  const [
    businessActivities,
    recentRuns,
    pendingCountsByRun,
    pendingProductsTotalCount,
    rawPendingProducts,
  ] = await Promise.all([
    listBusinessActivityOptions({ includeInactive: true }),
    prisma.scrapeRun.findMany({
      where: selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : undefined,
      orderBy: { startedAt: "desc" },
      take: 12,
      select: {
        id: true,
        businessActivity: true,
        source: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        categoryUrl: true,
        _count: {
          select: { products: true },
        },
      },
    }),
    prisma.scrapedProduct.groupBy({
      by: ["runId"],
      where: {
        reviewAction: ScrapedProductReviewAction.PENDING,
        syncStatus: {
          in: [...pendingSyncStatuses],
        },
        ...(selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : {}),
      },
      _count: {
        _all: true,
      },
    }),
    prisma.scrapedProduct.count({
      where: {
        reviewAction: ScrapedProductReviewAction.PENDING,
        syncStatus: {
          in: [...pendingSyncStatuses],
        },
        ...(selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : {}),
      },
    }),
    prisma.scrapedProduct.findMany({
      where: pendingWhere,
      include: {
        run: {
          select: {
            id: true,
            businessActivity: true,
            source: true,
            status: true,
            startedAt: true,
            categoryUrl: true,
          },
        },
        ...scrapedProductReviewInclude,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const pendingCountByRun = new Map(
    pendingCountsByRun.map((entry) => [entry.runId, entry._count._all]),
  );
  const analyzedPendingProducts = await Promise.all(
    rawPendingProducts.map(async (product) => {
      const comparisonProduct = await resolveScrapedComparisonProduct(product);
      const draft = buildScrapedDraft(product);
      const diffRows = buildDiffRows(comparisonProduct, draft);

      return {
        ...product,
        comparisonProduct,
        diffRows,
        decision:
          comparisonProduct == null
            ? "CREATE"
            : diffRows.length === 0
              ? "SKIP"
              : "REVIEW",
      };
    }),
  );

  const publishablePendingCount = analyzedPendingProducts.filter(
    (product) => product.decision === "CREATE",
  ).length;
  const autoSkippableCount = analyzedPendingProducts.filter(
    (product) => product.decision === "SKIP",
  ).length;
  const safeResolvableCount = publishablePendingCount + autoSkippableCount;
  const reviewPendingProducts = analyzedPendingProducts.filter(
    (product) => product.decision !== "SKIP",
  );
  const conflictCount = reviewPendingProducts.filter(
    (product) => product.decision === "REVIEW",
  ).length;
  const filteredPendingCount = analyzedPendingProducts.length;
  const pendingProducts = reviewPendingProducts.slice(0, 120);
  const selectedBusinessActivityLabel = selectedBusinessActivity
    ? getBusinessActivityLabel(selectedBusinessActivity, businessActivities)
    : "Todos los rubros";

  return (
    <div style={{ minHeight: "100dvh", background: "#020617", padding: "24px", color: "white" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "grid", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>
              Plataforma
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: "34px" }}>Revision de productos scrapeados</h1>
          </div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>
            Rubro actual: {selectedBusinessActivityLabel}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/admin" className="btn btn-ghost">
              Volver a admin
            </Link>
            <Link href="/admin/productos" className="btn btn-secondary">
              Catalogo global
            </Link>
          </div>
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderRadius: "18px",
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          Esta pantalla sirve para cerrar el circuito del scraper. Si el producto no existe se crea, si coincide con la ficha colaborativa se omite en silencio, y si hay diferencias podés verlas, retocar la ficha y publicar.
        </div>

        <section
          style={{
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            borderRadius: "22px",
            padding: "20px",
            display: "grid",
            gap: "14px",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "22px" }}>Filtro por rubro</h2>
            <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
              Cada corrida y cada publicacion del scraper se revisa dentro de su rubro para no
              mezclar catalogos.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href={buildScrapedProductsAdminPath()}
              className="btn btn-ghost"
              style={{
                borderColor: selectedBusinessActivity ? undefined : "rgba(56,189,248,.4)",
                color: selectedBusinessActivity ? undefined : "#bae6fd",
              }}
            >
              Todos los rubros
            </Link>
            {businessActivities.map((activity) => (
              <Link
                key={activity.value}
                href={buildScrapedProductsAdminPath({ businessActivity: activity.value })}
                className="btn btn-ghost"
                style={{
                  borderColor:
                    selectedBusinessActivity === activity.value
                      ? "rgba(56,189,248,.4)"
                      : undefined,
                  color:
                    selectedBusinessActivity === activity.value ? "#bae6fd" : undefined,
                }}
              >
                {activity.label}
              </Link>
            ))}
          </div>
        </section>

        {(bulkPublishedCount > 0 || bulkSkippedCount > 0 || bulkPendingCount > 0) && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "16px",
              background: "rgba(34,197,94,.12)",
              border: "1px solid rgba(34,197,94,.22)",
              color: "#dcfce7",
            }}
          >
            Resolucion automatica lista: {bulkPublishedCount} publicados, {bulkSkippedCount} omitidos sin cambios y{" "}
            {bulkPendingCount} siguen pendientes por diferencias o datos incompletos.
          </div>
        )}

        {safeResolvableCount > 0 && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "16px",
              background: "rgba(14,165,233,.12)",
              border: "1px solid rgba(56,189,248,.18)",
              color: "#dbeafe",
            }}
          >
            Hay {safeResolvableCount} productos que se pueden resolver sin edicion manual:{" "}
            {publishablePendingCount} nuevos para publicar y {autoSkippableCount} identicos para omitir.
          </div>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {[ 
            { label: "Pendientes del filtro", value: filteredPendingCount, tone: "#f59e0b" },
            { label: "Nuevos", value: publishablePendingCount, tone: "#22c55e" },
            { label: "Identicos", value: autoSkippableCount, tone: "#94a3b8" },
            { label: "Con diferencias", value: conflictCount, tone: "#38bdf8" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(15,23,42,.82)",
                border: "1px solid rgba(148,163,184,.18)",
                display: "grid",
                gap: "6px",
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>{item.label}</div>
              <div style={{ fontSize: "30px", fontWeight: 900, color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            borderRadius: "22px",
            padding: "20px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px" }}>Runs recientes</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Filtrá por corrida para revisar una tanda puntual.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href={buildScrapedProductsAdminPath({
                businessActivity: selectedBusinessActivity || null,
              })}
              className="btn btn-ghost"
              style={{
                borderColor: selectedRunId ? undefined : "rgba(56,189,248,.4)",
                color: selectedRunId ? undefined : "#bae6fd",
              }}
            >
              Todos ({pendingProductsTotalCount})
            </Link>
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                href={buildScrapedProductsAdminPath({
                  runId: run.id,
                  businessActivity: selectedBusinessActivity || null,
                })}
                className="btn btn-ghost"
                style={{
                  borderColor: selectedRunId === run.id ? "rgba(56,189,248,.4)" : undefined,
                  color: selectedRunId === run.id ? "#bae6fd" : undefined,
                }}
              >
                {getBusinessActivityLabel(run.businessActivity, businessActivities)} · {run.source} ·{" "}
                {formatDate(run.startedAt)} · pendientes {pendingCountByRun.get(run.id) ?? 0}
              </Link>
            ))}
          </div>
        </section>

        <section
          style={{
            background: "rgba(15,23,42,.82)",
            border: "1px solid rgba(148,163,184,.18)",
            borderRadius: "22px",
            padding: "20px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px" }}>Pendientes del scraper</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Mostrando {pendingProducts.length} de {reviewPendingProducts.length} productos que
                todavia requieren revision manual dentro de {selectedBusinessActivityLabel}
              </div>
            </div>
            <div style={{ display: "grid", gap: "4px", justifyItems: "end" }}>
              {selectedBusinessActivity && (
                <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                  Rubro: {selectedBusinessActivityLabel}
                </div>
              )}
              {selectedRunId && (
                <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                  Filtrado por run {selectedRunId}
                </div>
              )}
            </div>
            {safeResolvableCount > 0 && (
              <form action={resolveSafeScrapedProducts}>
                <input type="hidden" name="runId" value={selectedRunId} />
                <input type="hidden" name="businessActivity" value={selectedBusinessActivity} />
                <button type="submit" className="btn btn-secondary">
                  Resolver seguros ({safeResolvableCount})
                </button>
              </form>
            )}
          </div>

          {pendingProducts.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No hay productos pendientes para revisar en este filtro.</div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {pendingProducts.map((product) => (
                <form
                  key={product.id}
                  style={{
                    display: "grid",
                    gap: "14px",
                    padding: "18px",
                    borderRadius: "18px",
                    background: "rgba(30,41,59,.8)",
                    border: "1px solid rgba(148,163,184,.12)",
                  }}
                >
                  <input type="hidden" name="scrapedProductId" value={product.id} />

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div style={{ fontWeight: 700, fontSize: "20px" }}>{product.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        {product.barcode || "Sin barcode"} |{" "}
                        {getBusinessActivityLabel(product.businessActivity, businessActivities)} |{" "}
                        {product.run.source} | run {product.run.id}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        Scrapeado el {formatDate(product.createdAt)} · categoria{" "}
                        {product.categoryName || "Sin categoria"}
                      </div>
                    </div>
                    <div
                      style={{
                        alignSelf: "start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color:
                          product.decision === "CREATE"
                            ? "#86efac"
                            : "#7dd3fc",
                        background:
                          product.decision === "CREATE"
                            ? "rgba(34,197,94,.12)"
                            : "rgba(56,189,248,.12)",
                        border:
                          product.decision === "CREATE"
                            ? "1px solid rgba(34,197,94,.22)"
                            : "1px solid rgba(56,189,248,.22)",
                      }}
                    >
                      {product.decision === "CREATE"
                        ? "Crear producto"
                        : "Revisar diferencias"}
                    </div>
                  </div>

                  {product.comparisonProduct ? (
                    <div
                      style={{
                        borderRadius: "14px",
                        border: "1px solid rgba(56,189,248,.18)",
                        background: "rgba(2,6,23,.35)",
                        padding: "12px 14px",
                        color: "#cbd5e1",
                        display: "grid",
                        gap: "4px",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        Detectado en catalogo: {product.comparisonProduct.name}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        {product.comparisonProduct.barcode || "Sin barcode"} ·{" "}
                        {product.comparisonProduct.brand || "Sin marca"} ·{" "}
                        {getBusinessActivityLabel(
                          product.comparisonProduct.businessActivity,
                          businessActivities,
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        borderRadius: "14px",
                        border: "1px solid rgba(34,197,94,.18)",
                        background: "rgba(2,6,23,.35)",
                        padding: "12px 14px",
                        color: "#cbd5e1",
                      }}
                    >
                      No se encontro producto colaborativo con ese barcode dentro de{" "}
                      {getBusinessActivityLabel(product.businessActivity, businessActivities)}. Si
                      lo publicas, se crea una ficha nueva.
                    </div>
                  )}

                  {product.diffRows.length > 0 && product.comparisonProduct && (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {product.diffRows.map((row) => (
                          <span
                            key={`${product.id}-${row.field}`}
                            style={{
                              borderRadius: "999px",
                              border: "1px solid rgba(56,189,248,.18)",
                              padding: "6px 10px",
                              fontSize: "12px",
                              color: "#bae6fd",
                              background: "rgba(14,165,233,.12)",
                            }}
                          >
                            {row.label}
                          </span>
                        ))}
                      </div>

                      {product.comparisonProduct && (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {product.diffRows.map((row) => (
                            <div
                              key={`${product.id}-${row.field}-diff`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(120px, 160px) minmax(0, 1fr) minmax(0, 1fr)",
                                gap: "10px",
                                alignItems: "start",
                                padding: "10px 12px",
                                borderRadius: "14px",
                                background: "rgba(2,6,23,.42)",
                                border: "1px solid rgba(148,163,184,.12)",
                              }}
                            >
                              <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700 }}>{row.label}</div>
                              <div>
                                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                  Actual
                                </div>
                                <div style={{ color: "#cbd5e1", wordBreak: "break-word" }}>
                                  {row.field === "businessActivity"
                                    ? getBusinessActivityLabel(row.current, businessActivities)
                                    : row.current}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                  Scrapeado
                                </div>
                                <div style={{ color: "#f8fafc", wordBreak: "break-word" }}>
                                  {row.field === "businessActivity"
                                    ? getBusinessActivityLabel(row.next, businessActivities)
                                    : row.next}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Barcode</span>
                      <input name="barcode" defaultValue={product.barcode ?? ""} className="input" />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Rubro</span>
                      <select
                        name="businessActivity"
                        defaultValue={product.businessActivity}
                        className="input"
                      >
                        {businessActivities.map((activity) => (
                          <option key={`${product.id}-${activity.value}`} value={activity.value}>
                            {activity.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Nombre</span>
                      <input name="name" defaultValue={product.name} className="input" required />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Marca</span>
                      <input name="brand" defaultValue={product.brand ?? ""} className="input" />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Categoria</span>
                      <input name="categoryName" defaultValue={product.categoryName ?? ""} className="input" />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Presentacion</span>
                      <input name="presentation" defaultValue={product.presentation ?? ""} className="input" />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Imagen</span>
                      <input name="image" defaultValue={product.image ?? ""} className="input" />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Descripcion</span>
                    <textarea
                      name="description"
                      defaultValue={product.description ?? ""}
                      className="input"
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Nota interna</span>
                    <textarea
                      name="reviewNote"
                      className="input"
                      placeholder="Opcional: por qué se publica o por qué se mantiene la actual"
                      rows={2}
                      style={{ resize: "vertical" }}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      formAction={publishScrapedProduct}
                      className="btn btn-primary"
                      type="submit"
                      disabled={!product.barcode && !product.comparisonProduct?.barcode}
                    >
                      {product.decision === "CREATE" ? "Crear en catalogo" : "Actualizar catalogo"}
                    </button>

                    {product.comparisonProduct && (
                      <button formAction={keepScrapedProduct} className="btn btn-ghost" type="submit">
                        Mantener actual
                      </button>
                    )}

                    {product.sourceUrl && (
                      <a
                        href={product.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                      >
                        Ver origen
                      </a>
                    )}
                  </div>
                </form>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
