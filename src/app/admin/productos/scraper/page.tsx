import {
  PlatformProductStatus,
  ScrapedProductReviewAction,
  ScrapedProductSyncStatus,
  ScraperSource,
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
  type BusinessActivityOption,
} from "@/lib/business-activities";
import {
  normalizeCatalogBarcode,
  normalizeCatalogDescription,
  normalizeCatalogOptionalTitle,
  normalizeCatalogTitle,
} from "@/lib/catalog-text";
import {
  cleanText,
  formatDiffValue,
  platformChangeLabels,
  type ComparisonProduct,
  type DiffRow,
  type PlatformDraft as ScrapedDraft,
} from "@/lib/platform-diff";
import ProductDiffTable from "@/components/admin/ProductDiffTable";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

const PAGE_SIZE = 30;
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
        select: { id: true, name: true, barcode: true },
        orderBy: { name: "asc" },
      },
    },
  },
} as const;


type ScannedCategoryGroup = {
  categoryName: string;
  count: number;
  subcategoryLabel: string | null;
  productIds: string[];
};

async function CategoryMappingSection({ runId, businessActivities }: { runId: string; businessActivities: BusinessActivityOption[] }) {
  const groups = await prisma.scrapedProduct.groupBy({
    by: ["categoryName"],
    where: { runId, categoryName: { not: null } },
    _count: { _all: true },
    _min: { subcategoryLabel: true, id: true },
  });

  const uniqueCategories = groups
    .map((g) => ({
      categoryName: g.categoryName ?? "Sin categoria",
      count: g._count._all,
      subcategoryLabel: g._min.subcategoryLabel,
    }))
    .sort((a, b) => b.count - a.count);

  if (uniqueCategories.length === 0) {
    return <div style={{ color: "#94a3b8", fontSize: "14px" }}>No hay categorias scrapeadas en este run.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {uniqueCategories.map((cat) => (
        <form key={cat.categoryName} action={assignCategorySubcategory} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end",
          padding: "12px 14px", borderRadius: "14px", background: "rgba(2,6,23,.35)", border: "1px solid rgba(148,163,184,.12)",
        }}>
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="categoryName" value={cat.categoryName} />
          <div>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Categoria scrapeada</span>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#e2e8f0" }}>
              {cat.categoryName} <span style={{ color: "#64748b", fontWeight: 400 }}>({cat.count} productos)</span>
            </div>
          </div>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Subcategoria</span>
            <input name="subcategoryLabel" defaultValue={cat.subcategoryLabel ?? ""} className="input" placeholder="Ej: Aceites, Conservas, Fideos..." />
          </label>
          <button type="submit" className="btn btn-secondary" style={{ fontSize: "13px", whiteSpace: "nowrap" }}>Guardar</button>
        </form>
      ))}
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function buildDiffRows(comparisonProduct: ComparisonProduct | null, draft: ScrapedDraft): DiffRow[] {
  return getPlatformDraftChanges(comparisonProduct, draft).map((field) => {
    switch (field) {
      case "barcode":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.barcode, "Sin barcode base"), next: formatDiffValue(draft.barcode, "Sin barcode base") };
      case "name":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.name, "Sin nombre"), next: formatDiffValue(draft.name, "Sin nombre") };
      case "businessActivity":
        return { field, label: platformChangeLabels[field], current: comparisonProduct?.businessActivity ?? DEFAULT_BUSINESS_ACTIVITY_CODE, next: draft.businessActivity };
      case "brand":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.brand), next: formatDiffValue(draft.brand) };
      case "categoryName":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.categoryName, "Sin categoria"), next: formatDiffValue(draft.categoryName, "Sin categoria") };
      case "description":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.description, "Sin descripcion"), next: formatDiffValue(draft.description, "Sin descripcion") };
      case "presentation":
        return { field, label: platformChangeLabels[field], current: formatDiffValue(comparisonProduct?.presentation), next: formatDiffValue(draft.presentation) };
      case "image":
        return { field, label: platformChangeLabels[field], current: comparisonProduct?.image ? "Imagen cargada" : "Sin imagen", next: draft.image ? "Imagen cargada" : "Sin imagen" };
      case "variants":
        return { field, label: platformChangeLabels[field], current: comparisonProduct?.variants.length ? comparisonProduct.variants.map((v) => v.name).join(" | ") : "Sin variantes", next: "Sin variantes" };
      default:
        return { field, label: platformChangeLabels[field], current: "Sin dato", next: "Sin dato" };
    }
  });
}

function buildScrapedProductsAdminPath(args?: {
  runId?: string | null;
  activity?: string | null;
  search?: string | null;
  page?: number;
  bulkPublished?: number;
  bulkSkipped?: number;
  bulkPending?: number;
  bulkFailed?: number;
}) {
  const params = new URLSearchParams();
  const runId = cleanText(args?.runId);
  const activity = cleanText(args?.activity);
  const search = cleanText(args?.search);
  if (runId) params.set("run", runId);
  if (activity) params.set("activity", activity);
  if (search) params.set("q", search);
  if (args?.page && args.page > 1) params.set("page", String(args.page));
  if (typeof args?.bulkPublished === "number" && args.bulkPublished > 0) params.set("bulkPublished", String(args.bulkPublished));
  if (typeof args?.bulkSkipped === "number" && args.bulkSkipped > 0) params.set("bulkSkipped", String(args.bulkSkipped));
  if (typeof args?.bulkPending === "number" && args.bulkPending > 0) params.set("bulkPending", String(args.bulkPending));
  if (typeof args?.bulkFailed === "number" && args.bulkFailed > 0) params.set("bulkFailed", String(args.bulkFailed));

  const query = params.toString();
  return query ? `/admin/productos/scraper?${query}` : "/admin/productos/scraper";
}

async function ensurePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isPlatformAdmin(session.user)) redirect("/");
  return session;
}

async function resolveScrapedComparisonProduct(product: {
  barcode: string | null;
  businessActivity?: string | null;
  remotePlatformProduct: (ComparisonProduct & { status: PlatformProductStatus }) | null;
}) {
  if (product.remotePlatformProduct) return product.remotePlatformProduct;
  if (!product.barcode) return null;
  const matched =
    (product.businessActivity ? await findApprovedPlatformProductByBarcode(product.barcode, product.businessActivity) : null)
    ?? (await findApprovedPlatformProductByBarcode(product.barcode));
  if (!matched) return null;
  return {
    id: matched.id, barcode: matched.barcode, businessActivity: matched.businessActivity,
    name: matched.name, brand: matched.brand, categoryName: matched.categoryName,
    description: matched.description, presentation: matched.presentation, image: matched.image,
    status: matched.status, variants: matched.variants.map((v) => ({ id: v.id, name: v.name, barcode: v.barcode })),
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
  if (!scrapedProductId) return;

  const scrapedProduct = await prisma.scrapedProduct.findUnique({
    where: { id: scrapedProductId }, include: scrapedProductReviewInclude,
  });
  if (!scrapedProduct) return;

  const comparisonProduct = await resolveScrapedComparisonProduct(scrapedProduct);
  const diffRows = buildDiffRows(comparisonProduct, buildScrapedDraft(scrapedProduct));
  const isDeliberateKeep = Boolean(comparisonProduct && diffRows.length > 0);

  await prisma.scrapedProduct.update({
    where: { id: scrapedProduct.id },
    data: {
      syncStatus: ScrapedProductSyncStatus.SKIPPED,
      reviewAction: isDeliberateKeep ? ScrapedProductReviewAction.KEEP_REMOTE : ScrapedProductReviewAction.SKIP,
      reviewNote: reviewNote || null,
      remotePlatformProductId: comparisonProduct?.id ?? scrapedProduct.remotePlatformProductId ?? null,
      remoteOwnerType: comparisonProduct ? "product" : scrapedProduct.remoteOwnerType,
      publishedAt: null,
    },
  });
  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
}

async function publishScrapedProductById({
  scrapedProductId, reviewNote, editedDraft,
}: {
  scrapedProductId: string;
  reviewNote?: string | null;
  editedDraft?: ScrapedDraft | null;
}) {
  const scrapedProduct = await prisma.scrapedProduct.findUnique({
    where: { id: scrapedProductId }, include: scrapedProductReviewInclude,
  });
  if (!scrapedProduct) return { status: "missing" as const };

  const comparisonProduct = await resolveScrapedComparisonProduct(scrapedProduct);
  const originalDraft = buildScrapedDraft(scrapedProduct);
  const nextDraft = editedDraft ?? originalDraft;
  const mergedDraft = buildPlatformSubmissionDraft(comparisonProduct, nextDraft);
  const changedBeforePublish = JSON.stringify(originalDraft) !== JSON.stringify(nextDraft);

  if (!mergedDraft.name || !mergedDraft.barcode) return { status: "invalid" as const };

  // Use subcategoryLabel as categoryName if available
  const finalCategoryName = scrapedProduct.subcategoryLabel || mergedDraft.categoryName;

  const platformProduct = comparisonProduct
    ? await prisma.platformProduct.update({
        where: { id: comparisonProduct.id },
        data: { barcode: mergedDraft.barcode, businessActivity: mergedDraft.businessActivity, name: mergedDraft.name, brand: mergedDraft.brand, categoryName: finalCategoryName, description: mergedDraft.description, presentation: mergedDraft.presentation, image: mergedDraft.image, status: PlatformProductStatus.APPROVED },
        select: { id: true },
      })
    : await prisma.platformProduct.upsert({
        where: { barcode: mergedDraft.barcode },
        update: { businessActivity: mergedDraft.businessActivity, name: mergedDraft.name, brand: mergedDraft.brand, categoryName: finalCategoryName, description: mergedDraft.description, presentation: mergedDraft.presentation, image: mergedDraft.image, status: PlatformProductStatus.APPROVED },
        create: { barcode: mergedDraft.barcode, businessActivity: mergedDraft.businessActivity, name: mergedDraft.name, brand: mergedDraft.brand, categoryName: finalCategoryName, description: mergedDraft.description, presentation: mergedDraft.presentation, image: mergedDraft.image, status: PlatformProductStatus.APPROVED },
        select: { id: true },
      });

  await syncAutoProductsFromPlatformProduct(prisma, platformProduct.id);

  await prisma.scrapedProduct.update({
    where: { id: scrapedProduct.id },
    data: {
      syncStatus: ScrapedProductSyncStatus.PUBLISHED,
      reviewAction: changedBeforePublish ? ScrapedProductReviewAction.COMBINE : ScrapedProductReviewAction.USE_SCRAPED,
      reviewNote: reviewNote || null, publishedAt: new Date(),
      remotePlatformProductId: platformProduct.id, remoteOwnerType: "product",
    },
  });

  return { status: "published" as const, platformProductId: platformProduct.id };
}

async function publishScrapedProduct(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();
  const scrapedProductId = String(formData.get("scrapedProductId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();
  if (!scrapedProductId) return;
  await publishScrapedProductById({ scrapedProductId, reviewNote, editedDraft: buildDraftFromFormData(formData) });
  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
}

async function resolveSafeScrapedProducts(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();
  const runId = String(formData.get("runId") ?? "").trim();
  const businessActivity = normalizeBusinessActivityCode(typeof formData.get("businessActivity") === "string" ? String(formData.get("businessActivity")) : "", "");
  const pendingProducts = await prisma.scrapedProduct.findMany({
    where: {
      reviewAction: ScrapedProductReviewAction.PENDING,
      syncStatus: { in: [...pendingSyncStatuses] },
      ...(runId ? { runId } : {}),
      ...(businessActivity ? { businessActivity } : {}),
    },
    include: scrapedProductReviewInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let publishedCount = 0, skippedCount = 0, pendingCount = 0;
  for (const product of pendingProducts) {
    const comparisonProduct = await resolveScrapedComparisonProduct(product);
    if (comparisonProduct) {
      const diffRows = buildDiffRows(comparisonProduct, buildScrapedDraft(product));
      if (diffRows.length === 0) {
        await prisma.scrapedProduct.update({
          where: { id: product.id },
          data: { syncStatus: ScrapedProductSyncStatus.SKIPPED, reviewAction: ScrapedProductReviewAction.SKIP, reviewNote: null, remotePlatformProductId: comparisonProduct.id, remoteOwnerType: "product", publishedAt: null },
        });
        skippedCount += 1;
      } else { pendingCount += 1; }
      continue;
    }
    const result = await publishScrapedProductById({ scrapedProductId: product.id, reviewNote: "Publicado en lote desde admin." });
    if (result.status === "published") publishedCount += 1;
    else pendingCount += 1;
  }
  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
  redirect(buildScrapedProductsAdminPath({ runId, activity: businessActivity || null, bulkPublished: publishedCount, bulkSkipped: skippedCount, bulkPending: pendingCount }));
}

async function bulkActionScrapedProducts(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();
  const action = String(formData.get("bulkAction") ?? "");
  const ids = formData.getAll("selectedIds").map(String).filter(Boolean);
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;

  if (ids.length === 0) {
    revalidatePath("/admin/productos/scraper");
    return;
  }

  let publishedCount = 0, skippedCount = 0, failedCount = 0;

  if (action === "publish") {
    for (const id of ids) {
      const result = await publishScrapedProductById({ scrapedProductId: id, reviewNote });
      if (result.status === "published") publishedCount += 1;
      else failedCount += 1;
    }
  } else if (action === "skip") {
    for (const id of ids) {
      await prisma.scrapedProduct.update({
        where: { id },
        data: { syncStatus: ScrapedProductSyncStatus.SKIPPED, reviewAction: ScrapedProductReviewAction.SKIP, reviewNote, remotePlatformProductId: null, remoteOwnerType: null, publishedAt: null },
      });
      skippedCount += 1;
    }
  }

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
  redirect(buildScrapedProductsAdminPath({
    bulkPublished: publishedCount, bulkSkipped: skippedCount, bulkPending: 0, bulkFailed: failedCount,
  }));
}

async function assignRunBusinessActivity(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();
  const runId = String(formData.get("runId") ?? "").trim();
  const businessActivity = String(formData.get("businessActivity") ?? "").trim();

  if (!runId || !businessActivity) {
    revalidatePath("/admin/productos/scraper");
    return;
  }

  const normalized = normalizeBusinessActivityCode(businessActivity, "");
  await prisma.scrapeRun.update({
    where: { id: runId },
    data: { businessActivity: normalized },
  });

  // Also update all products in the run
  await prisma.scrapedProduct.updateMany({
    where: { runId },
    data: { businessActivity: normalized },
  });

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
}

async function assignCategorySubcategory(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();
  const runId = String(formData.get("runId") ?? "").trim();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const subcategoryLabel = String(formData.get("subcategoryLabel") ?? "").trim();

  if (!runId || !categoryName) {
    revalidatePath("/admin/productos/scraper");
    return;
  }

  await prisma.scrapedProduct.updateMany({
    where: { runId, categoryName },
    data: { subcategoryLabel: subcategoryLabel || null },
  });

  revalidatePath("/admin/productos/scraper");
  revalidatePath("/admin/productos");
}

export default async function AdminScrapedProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    run?: string;
    activity?: string;
    q?: string;
    page?: string;
    bulkPublished?: string;
    bulkSkipped?: string;
    bulkPending?: string;
    bulkFailed?: string;
  }>;
}) {
  await ensurePlatformAdmin();
  const params = (await searchParams) ?? {};
  const selectedRunId = typeof params.run === "string" ? params.run.trim() : "";
  const selectedBusinessActivity = normalizeBusinessActivityCode(typeof params.activity === "string" ? params.activity : "", "");
  const searchQuery = typeof params.q === "string" ? params.q.trim() : "";
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const bulkPublishedCount = typeof params.bulkPublished === "string" ? Number.parseInt(params.bulkPublished, 10) || 0 : 0;
  const bulkSkippedCount = typeof params.bulkSkipped === "string" ? Number.parseInt(params.bulkSkipped, 10) || 0 : 0;
  const bulkPendingCount = typeof params.bulkPending === "string" ? Number.parseInt(params.bulkPending, 10) || 0 : 0;
  const bulkFailedCount = typeof params.bulkFailed === "string" ? Number.parseInt(params.bulkFailed, 10) || 0 : 0;

  const baseWhere: Record<string, unknown> = {
    reviewAction: ScrapedProductReviewAction.PENDING,
    syncStatus: { in: [...pendingSyncStatuses] },
    ...(selectedRunId ? { runId: selectedRunId } : {}),
    ...(selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : {}),
  };

  if (searchQuery) {
    baseWhere.OR = [
      { name: { contains: searchQuery, mode: "insensitive" as const } },
      { barcode: { contains: searchQuery, mode: "insensitive" as const } },
      { brand: { contains: searchQuery, mode: "insensitive" as const } },
      { categoryName: { contains: searchQuery, mode: "insensitive" as const } },
    ];
  }

  const [businessActivities, recentRuns, pendingCountsByRun, totalCount] = await Promise.all([
    listBusinessActivityOptions({ includeInactive: true }),
    prisma.scrapeRun.findMany({
      where: selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : undefined,
      orderBy: { startedAt: "desc" },
      take: 12,
      select: {
        id: true, businessActivity: true, source: true, status: true, startedAt: true, finishedAt: true, categoryUrl: true,
        _count: { select: { products: true } },
      },
    }),
    prisma.scrapedProduct.groupBy({
      by: ["runId"],
      where: {
        reviewAction: ScrapedProductReviewAction.PENDING,
        syncStatus: { in: [...pendingSyncStatuses] },
        ...(selectedBusinessActivity ? { businessActivity: selectedBusinessActivity } : {}),
      },
      _count: { _all: true },
    }),
    prisma.scrapedProduct.count({ where: baseWhere }),
  ]);

  const pendingCountByRun = new Map(
    pendingCountsByRun.map((entry) => [entry.runId, entry._count._all]),
  );

  // Order: CONFLICT first, then NEW, then MATCHED
  const products = await prisma.scrapedProduct.findMany({
    where: baseWhere,
    include: {
      run: { select: { id: true, businessActivity: true, source: true, status: true, startedAt: true, categoryUrl: true } },
      ...scrapedProductReviewInclude,
    },
    orderBy: [
      { syncStatus: "desc" },  // CONFLICT > NEW > MATCHED (alphabetically reversed)
      { createdAt: "desc" },
    ],
    take: PAGE_SIZE,
    skip: (currentPage - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const analyzedProducts = await Promise.all(products.map(async (product) => {
    const comparisonProduct = await resolveScrapedComparisonProduct(product);
    const draft = buildScrapedDraft(product);
    const diffRows = buildDiffRows(comparisonProduct, draft);
    return {
      ...product,
      comparisonProduct,
      diffRows,
      decision: comparisonProduct == null ? "CREATE" : diffRows.length === 0 ? "SKIP" : "REVIEW",
    } as const;
  }));

  const selectedBusinessActivityLabel = selectedBusinessActivity ? getBusinessActivityLabel(selectedBusinessActivity, businessActivities) : "Todos los rubros";

  return (
    <div style={{ minHeight: "100dvh", background: "#020617", padding: "24px", color: "white" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", display: "grid", gap: "20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>Plataforma</div>
            <h1 style={{ margin: "6px 0 0", fontSize: "34px" }}>Revision de productos scrapeados</h1>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/admin" className="btn btn-ghost">Volver a admin</Link>
            <Link href="/admin/productos" className="btn btn-secondary">Catalogo global</Link>
          </div>
        </div>

        <div style={{ padding: "16px 18px", borderRadius: "18px", background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", color: "#cbd5e1", lineHeight: 1.6 }}>
          Esta pantalla sirve para cerrar el circuito del scraper. Si el producto no existe se crea, si coincide con la ficha colaborativa se omite en silencio, y si hay diferencias podés verlas, retocar la ficha y publicar.
        </div>

        {/* Bulk action feedback */}
        {(bulkPublishedCount > 0 || bulkSkippedCount > 0 || bulkPendingCount > 0 || bulkFailedCount > 0) && (
          <div style={{ padding: "12px 16px", borderRadius: "16px", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.22)", color: "#dcfce7" }}>
            Accion masiva: {bulkPublishedCount} publicados, {bulkSkippedCount} omitidos, {bulkFailedCount} fallidos. {bulkPendingCount} siguen pendientes.
          </div>
        )}

        {/* Business activity filter */}
        <section style={{ background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", borderRadius: "22px", padding: "20px", display: "grid", gap: "14px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "22px" }}>Filtro por rubro</h2>
            <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>Cada corrida y cada publicacion del scraper se revisa dentro de su rubro.</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href={buildScrapedProductsAdminPath({ activity: selectedBusinessActivity || null, search: searchQuery || null })} className="btn btn-ghost" style={{ borderColor: !selectedBusinessActivity ? "rgba(56,189,248,.4)" : undefined, color: !selectedBusinessActivity ? "#bae6fd" : undefined }}>Todos</Link>
            {businessActivities.map((a) => (
              <Link key={a.value} href={buildScrapedProductsAdminPath({ activity: a.value, search: searchQuery || null })} className="btn btn-ghost" style={{ borderColor: selectedBusinessActivity === a.value ? "rgba(56,189,248,.4)" : undefined, color: selectedBusinessActivity === a.value ? "#bae6fd" : undefined }}>{a.label}</Link>
            ))}
          </div>
        </section>

        {/* Search bar */}
        <section style={{ background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", borderRadius: "22px", padding: "20px" }}>
          <form action={(formData) => {
            const q = String(formData.get("q") ?? "").trim();
            redirect(buildScrapedProductsAdminPath({ runId: selectedRunId || null, activity: selectedBusinessActivity || null, search: q || null }));
          }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input name="q" defaultValue={searchQuery} className="input" placeholder="Buscar por nombre, barcode, marca o categoria..." style={{ flex: 1, minWidth: 240 }} />
              <button type="submit" className="btn btn-primary">Buscar</button>
              {searchQuery && (
                <Link href={buildScrapedProductsAdminPath({ runId: selectedRunId || null, activity: selectedBusinessActivity || null })} className="btn btn-ghost">Limpiar</Link>
              )}
            </div>
          </form>
          {searchQuery && (
            <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>Resultados para &ldquo;{searchQuery}&rdquo; · {totalCount} productos</div>
          )}
        </section>

        {/* Stats */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total pendientes", value: totalCount, tone: "#f59e0b" },
            { label: "En pagina", value: analyzedProducts.length, tone: "#bae6fd" },
            { label: "Conflictos", value: analyzedProducts.filter((p) => p.decision === "REVIEW").length, tone: "#ef4444" },
            { label: "Nuevos", value: analyzedProducts.filter((p) => p.decision === "CREATE").length, tone: "#22c55e" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "16px 18px", borderRadius: "18px", background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", display: "grid", gap: "6px" }}>
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>{item.label}</div>
              <div style={{ fontSize: "30px", fontWeight: 900, color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </section>

        {/* Runs */}
        <section style={{ background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", borderRadius: "22px", padding: "20px", display: "grid", gap: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "24px" }}>Runs recientes</h2>
            <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
              Asigná cada corrida a un rubro. Filtrá por corrida para revisar una tanda puntual.
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {recentRuns.map((run) => {
              const runPending = pendingCountByRun.get(run.id) ?? 0;
              const isSelected = selectedRunId === run.id;
              return (
                <div key={run.id} style={{
                  display: "grid", gap: "12px", padding: "14px 16px", borderRadius: "16px",
                  background: isSelected ? "rgba(56,189,248,.08)" : "rgba(2,6,23,.35)",
                  border: isSelected ? "1px solid rgba(56,189,248,.3)" : "1px solid rgba(148,163,184,.12)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <div style={{ fontWeight: 700, fontSize: "16px" }}>
                        {getBusinessActivityLabel(run.businessActivity, businessActivities)} · {run.source}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        {formatDate(run.startedAt)} · {run._count.products} productos · {runPending} pendientes
                      </div>
                    </div>
                    <Link
                      href={buildScrapedProductsAdminPath({ runId: run.id, activity: selectedBusinessActivity || null, search: searchQuery || null })}
                      className="btn btn-ghost"
                      style={{ fontSize: "13px" }}
                    >
                      {isSelected ? "Seleccionado" : "Ver"}
                    </Link>
                  </div>

                  {/* Rubro selector for this run */}
                  <form action={assignRunBusinessActivity} style={{ display: "flex", gap: "10px", alignItems: "end" }}>
                    <input type="hidden" name="runId" value={run.id} />
                    <label style={{ display: "grid", gap: "4px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Asignar rubro</span>
                      <select name="businessActivity" defaultValue={run.businessActivity} className="input" style={{ minWidth: 200 }}>
                        {businessActivities.map((a) => (
                          <option key={`${run.id}-${a.value}`} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="btn btn-secondary" style={{ fontSize: "13px" }}>Guardar</button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>

        {/* Category mapping section - only visible when a run is selected */}
        {selectedRunId && (
          <section style={{ background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", borderRadius: "22px", padding: "20px", display: "grid", gap: "16px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px" }}>Categorias scrapeadas</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Asigná cada categoria scrapeada a una subcategoria dentro del rubro seleccionado.
              </div>
            </div>

            <CategoryMappingSection runId={selectedRunId} businessActivities={businessActivities} />
          </section>
        )}

        {/* Products list with bulk actions */}
        <section style={{ background: "rgba(15,23,42,.82)", border: "1px solid rgba(148,163,184,.18)", borderRadius: "22px", padding: "20px", display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px" }}>Productos pendientes</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Mostrando {analyzedProducts.length} de {totalCount} · Conflicto primero
              </div>
            </div>
            <form action={resolveSafeScrapedProducts} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <input type="hidden" name="runId" value={selectedRunId} />
              <input type="hidden" name="businessActivity" value={selectedBusinessActivity} />
              <button type="submit" className="btn btn-secondary">Resolver seguros</button>
            </form>
          </div>

          {/* Bulk action bar */}
          {analyzedProducts.length > 0 && (
            <form id="bulk-action-form" action={bulkActionScrapedProducts} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", padding: "12px 14px", borderRadius: "14px", background: "rgba(2,6,23,.35)", border: "1px solid rgba(148,163,184,.12)" }}>
              <span style={{ color: "#94a3b8", fontSize: "13px", marginRight: 8 }}>Seleccionados:</span>
              <input type="hidden" name="reviewNote" value="Accion masiva desde admin." />
              <button type="submit" name="bulkAction" value="publish" className="btn btn-primary">Publicar seleccion</button>
              <button type="submit" name="bulkAction" value="skip" className="btn btn-ghost">Omitir seleccion</button>
              <span style={{ color: "#64748b", fontSize: "13px" }}>· Conflicto = revisar antes de publicar · Nuevo = directo a crear</span>
            </form>
          )}

          {analyzedProducts.length === 0 ? (
            <div style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>No hay productos pendientes para revisar en este filtro.</div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {analyzedProducts.map((product) => (
                <form key={product.id} style={{ display: "grid", gap: "14px", padding: "18px", borderRadius: "18px", background: "rgba(30,41,59,.8)", border: product.decision === "REVIEW" ? "1px solid rgba(239,68,68,.3)" : "1px solid rgba(148,163,184,.12)" }}>
                  <input type="hidden" name="scrapedProductId" value={product.id} />

                  {/* Checkbox (for bulk) + header */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "start" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "start", flex: 1 }}>
                      <input type="checkbox" form="bulk-action-form" name="selectedIds" value={product.id} style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "#38bdf8" }} />
                      <div style={{ display: "grid", gap: "4px" }}>
                        <div style={{ fontWeight: 700, fontSize: "18px" }}>{product.name}</div>
                        <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                          {product.barcode || "Sin barcode"} · {getBusinessActivityLabel(product.businessActivity, businessActivities)} · {product.run.source} · {product.categoryName || "Sin categoria"}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "12px" }}>Scrapeado el {formatDate(product.createdAt)}</div>
                      </div>
                    </div>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
                      color: product.decision === "CREATE" ? "#86efac" : product.decision === "REVIEW" ? "#fca5a5" : "#7dd3fc",
                      background: product.decision === "CREATE" ? "rgba(34,197,94,.12)" : product.decision === "REVIEW" ? "rgba(239,68,68,.12)" : "rgba(56,189,248,.12)",
                      border: product.decision === "CREATE" ? "1px solid rgba(34,197,94,.22)" : product.decision === "REVIEW" ? "1px solid rgba(239,68,68,.22)" : "1px solid rgba(56,189,248,.22)",
                    }}>
                      {product.decision === "CREATE" ? "Crear producto" : product.decision === "REVIEW" ? "Conflicto" : "Revisar diferencias"}
                    </div>
                  </div>

                  {/* Comparison info */}
                  {product.comparisonProduct ? (
                    <div style={{ borderRadius: "14px", border: "1px solid rgba(56,189,248,.18)", background: "rgba(2,6,23,.35)", padding: "12px 14px", color: "#cbd5e1" }}>
                      <div style={{ fontWeight: 700 }}>Detectado: {product.comparisonProduct.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>{product.comparisonProduct.barcode || "Sin barcode"} · {product.comparisonProduct.brand || "Sin marca"}</div>
                    </div>
                  ) : (
                    <div style={{ borderRadius: "14px", border: "1px solid rgba(34,197,94,.18)", background: "rgba(2,6,23,.35)", padding: "12px 14px", color: "#cbd5e1", fontSize: "14px" }}>
                      No se encontro producto colaborativo con ese barcode. Se crea ficha nueva.
                    </div>
                  )}

                  {/* Diff rows */}
                  {product.comparisonProduct && (
                    <ProductDiffTable rows={product.diffRows} />
                  )}

                  {/* Editable fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Barcode</span>
                      <input name="barcode" defaultValue={product.barcode ?? ""} className="input" />
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Rubro</span>
                      <select name="businessActivity" defaultValue={product.businessActivity} className="input">
                        {businessActivities.map((a) => <option key={`${product.id}-${a.value}`} value={a.value}>{a.label}</option>)}
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
                    <textarea name="description" defaultValue={product.description ?? ""} className="input" rows={2} style={{ resize: "vertical" }} />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Nota interna</span>
                    <textarea name="reviewNote" className="input" placeholder="Opcional: motivo de la accion" rows={1} style={{ resize: "vertical" }} />
                  </label>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button formAction={publishScrapedProduct} className="btn btn-primary" type="submit" disabled={!product.barcode && !product.comparisonProduct?.barcode}>
                      {product.decision === "CREATE" ? "Crear en catalogo" : "Actualizar catalogo"}
                    </button>
                    {product.comparisonProduct && <button formAction={keepScrapedProduct} className="btn btn-ghost" type="submit">Mantener actual</button>}
                    {product.sourceUrl && <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">Ver origen</a>}
                  </div>
                </form>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              {currentPage > 1 && (
                <Link href={buildScrapedProductsAdminPath({ runId: selectedRunId || null, activity: selectedBusinessActivity || null, search: searchQuery || null, page: currentPage - 1 })} className="btn btn-ghost">&larr; Anterior</Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) => {
                  if (item === "...") return <span key={`dots-${idx}`} style={{ color: "#64748b", padding: "0 4px" }}>…</span>;
                  const p = item as number;
                  return (
                    <Link key={p} href={buildScrapedProductsAdminPath({ runId: selectedRunId || null, activity: selectedBusinessActivity || null, search: searchQuery || null, page: p })}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "36px", height: "36px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, textDecoration: "none",
                        background: p === currentPage ? "rgba(56,189,248,.2)" : "transparent",
                        border: p === currentPage ? "1px solid rgba(56,189,248,.4)" : "1px solid transparent",
                        color: p === currentPage ? "#bae6fd" : "#94a3b8",
                      }}>
                      {p}
                    </Link>
                  );
                })}
              {currentPage < totalPages && (
                <Link href={buildScrapedProductsAdminPath({ runId: selectedRunId || null, activity: selectedBusinessActivity || null, search: searchQuery || null, page: currentPage + 1 })} className="btn btn-ghost">Siguiente &rarr;</Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
