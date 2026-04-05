import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  createBusinessActivity,
  ensureBusinessActivitiesSeeded,
  listBusinessActivityOptions,
} from "@/lib/business-activities-store";
import { getBusinessActivityLabel } from "@/lib/business-activities";
import {
  buildPlatformSubmissionDraft,
  ensurePlatformCatalogSeeded,
  findApprovedPlatformProductByBarcode,
  getPlatformDraftChanges,
  type PlatformDraftChangeField,
} from "@/lib/platform-catalog";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlatformProductBackupManager from "@/app/admin/productos/PlatformProductBackupManager";
import PlatformProductBulkImporter from "@/app/admin/productos/PlatformProductBulkImporter";
import PlatformImagePushManager from "@/app/admin/productos/PlatformImagePushManager";
import PlatformProductQuickEditor from "@/app/admin/productos/PlatformProductQuickEditor";
import {
  formatDiffValue,
  platformChangeLabels,
  formatVariantDiffValue,
  type DiffRow,
  type ComparisonProduct,
  type PlatformDraft,
} from "@/lib/platform-diff";
import ProductDiffTable from "@/components/admin/ProductDiffTable";
type SubmissionDiffSource = {
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
  platformProduct?: {
    id?: string;
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
  } | null;
};

type SubmissionComparisonProduct = NonNullable<SubmissionDiffSource["platformProduct"]> & {
  id: string;
};


async function resolveSubmissionComparisonProduct(submission: {
  barcode: string | null;
  businessActivity?: string | null;
  platformProduct?: SubmissionComparisonProduct | null;
}) {
  if (submission.platformProduct) {
    return submission.platformProduct;
  }

  if (!submission.barcode) {
    return null;
  }

  const matchedProduct =
    (submission.businessActivity
      ? await findApprovedPlatformProductByBarcode(submission.barcode, submission.businessActivity)
      : null) ?? (await findApprovedPlatformProductByBarcode(submission.barcode));
  if (!matchedProduct) {
    return null;
  }

  return {
    id: matchedProduct.id,
    barcode: matchedProduct.barcode,
    businessActivity: matchedProduct.businessActivity,
    name: matchedProduct.name,
    brand: matchedProduct.brand,
    categoryName: matchedProduct.categoryName,
    description: matchedProduct.description,
    presentation: matchedProduct.presentation,
    image: matchedProduct.image,
    variants: matchedProduct.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      barcode: variant.barcode,
    })),
  };
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

function buildSubmissionDiffRows(submission: SubmissionDiffSource) {
  const draft: PlatformDraft = {
    barcode: submission.barcode,
    businessActivity: submission.businessActivity,
    name: submission.name,
    brand: submission.brand,
    categoryName: submission.categoryName,
    description: submission.description,
    presentation: submission.presentation,
    image: submission.image,
    variants: submission.variants.map((variant) => ({
      name: variant.name,
      barcode: variant.barcode,
    })),
  };

  const comparisonProduct = submission.platformProduct ? {
    id: submission.platformProduct.id ?? "",
    barcode: submission.platformProduct.barcode,
    businessActivity: submission.platformProduct.businessActivity,
    name: submission.platformProduct.name,
    brand: submission.platformProduct.brand,
    categoryName: submission.platformProduct.categoryName,
    description: submission.platformProduct.description,
    presentation: submission.platformProduct.presentation,
    image: submission.platformProduct.image,
    variants: submission.platformProduct.variants.map(v => ({ name: v.name, barcode: v.barcode }))
  } : null;

  return getPlatformDraftChanges(comparisonProduct, draft).map((field) => {
    switch (field) {
      case "barcode":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.barcode, "Sin barcode base"),
          next: formatDiffValue(submission.barcode, "Sin barcode base"),
        };
      case "businessActivity":
        return {
          field,
          label: platformChangeLabels[field],
          current: comparisonProduct?.businessActivity ?? "KIOSCO",
          next: submission.businessActivity,
        };
      case "name":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.name, "Sin nombre"),
          next: formatDiffValue(submission.name, "Sin nombre"),
        };
      case "brand":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.brand),
          next: formatDiffValue(submission.brand),
        };
      case "categoryName":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.categoryName, "Sin categoria"),
          next: formatDiffValue(submission.categoryName, "Sin categoria"),
        };
      case "description":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.description, "Sin descripcion"),
          next: formatDiffValue(submission.description, "Sin descripcion"),
        };
      case "presentation":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatDiffValue(comparisonProduct?.presentation),
          next: formatDiffValue(submission.presentation),
        };
      case "image":
        return {
          field,
          label: platformChangeLabels[field],
          current: comparisonProduct?.image ? "Imagen cargada" : "Sin imagen",
          next: submission.image ? "Imagen cargada" : "Sin imagen",
        };
      case "variants":
        return {
          field,
          label: platformChangeLabels[field],
          current: formatVariantDiffValue(comparisonProduct?.variants),
          next: formatVariantDiffValue(submission.variants),
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

async function reviewSubmission(formData: FormData) {
  "use server";

  const session = await ensurePlatformAdmin();
  const submissionId = String(formData.get("submissionId") ?? "");
  const action = String(formData.get("action") ?? "approve");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  if (!submissionId) {
    return;
  }

  const submission = await prisma.platformProductSubmission.findUnique({
    where: { id: submissionId },
    include: {
      platformProduct: {
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
      variants: true,
    },
  });

  if (!submission) {
    return;
  }

  if (action === "reject") {
    await prisma.platformProductSubmission.update({
      where: { id: submission.id },
      data: {
        status: PlatformProductSubmissionStatus.REJECTED,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    revalidatePath("/admin/productos");
    return;
  }

  const comparisonProduct = await resolveSubmissionComparisonProduct({
    barcode: submission.barcode,
    businessActivity: submission.businessActivity,
    platformProduct: submission.platformProduct as any,
  });
  const mergedDraft = buildPlatformSubmissionDraft(comparisonProduct as any, {
    barcode: submission.barcode,
    businessActivity: submission.businessActivity,
    name: submission.name,
    brand: submission.brand,
    categoryName: submission.categoryName,
    description: submission.description,
    presentation: submission.presentation,
    image: submission.image,
    variants: submission.variants.map((variant) => ({
      name: variant.name,
      barcode: variant.barcode,
    })),
  });
  const variantData = mergedDraft.variants.map((variant) => ({
    name: variant.name,
    barcode: variant.barcode,
  }));
  const effectiveBarcode = variantData.length > 0 ? null : mergedDraft.barcode;
  const targetPlatformProductId = comparisonProduct?.id ?? submission.platformProductId ?? null;

  const platformProduct = targetPlatformProductId
    ? await prisma.platformProduct.update({
        where: { id: targetPlatformProductId },
        data: {
          barcode: effectiveBarcode,
          businessActivity: mergedDraft.businessActivity,
          name: mergedDraft.name,
          brand: mergedDraft.brand,
          categoryName: mergedDraft.categoryName,
          description: mergedDraft.description,
          presentation: mergedDraft.presentation,
          image: mergedDraft.image,
          status: PlatformProductStatus.APPROVED,
          variants: {
            deleteMany: {},
            create: variantData,
          },
        },
        select: { id: true },
      })
    : effectiveBarcode
      ? await prisma.platformProduct.upsert({
          where: { barcode: effectiveBarcode },
          update: {
            businessActivity: mergedDraft.businessActivity,
            name: mergedDraft.name,
            brand: mergedDraft.brand,
            categoryName: mergedDraft.categoryName,
            description: mergedDraft.description,
            presentation: mergedDraft.presentation,
            image: mergedDraft.image,
            status: PlatformProductStatus.APPROVED,
            variants: {
              deleteMany: {},
              create: variantData,
            },
          },
          create: {
            barcode: effectiveBarcode,
            businessActivity: mergedDraft.businessActivity,
            name: mergedDraft.name,
            brand: mergedDraft.brand,
            categoryName: mergedDraft.categoryName,
            description: mergedDraft.description,
            presentation: mergedDraft.presentation,
            image: mergedDraft.image,
            status: PlatformProductStatus.APPROVED,
            variants: {
              create: variantData,
            },
          },
          select: { id: true },
        })
      : await prisma.platformProduct.create({
        data: {
          barcode: effectiveBarcode,
          businessActivity: mergedDraft.businessActivity,
          name: mergedDraft.name,
          brand: mergedDraft.brand,
          categoryName: mergedDraft.categoryName,
          description: mergedDraft.description,
          presentation: mergedDraft.presentation,
          image: mergedDraft.image,
          status: PlatformProductStatus.APPROVED,
          variants: {
            create: variantData,
          },
        },
        select: { id: true },
      });

  await syncAutoProductsFromPlatformProduct(prisma, platformProduct.id);

  await prisma.platformProductSubmission.update({
    where: { id: submission.id },
    data: {
      status: PlatformProductSubmissionStatus.APPROVED,
      reviewNote: reviewNote || null,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      platformProductId: platformProduct.id,
    },
  });

  revalidatePath("/admin/productos");
}


async function ensureDefaultCatalogAction() {
  "use server";

  await ensurePlatformAdmin();
  await ensurePlatformCatalogSeeded();
  revalidatePath("/admin/productos");
}

async function clearNoChangeSubmissionsAction() {
  "use server";

  const session = await ensurePlatformAdmin();

  const pendingSubmissions = await prisma.platformProductSubmission.findMany({
    where: { status: PlatformProductSubmissionStatus.PENDING },
    include: {
      platformProduct: {
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
      variants: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const staleSubmissionIds: string[] = [];

  for (const submission of pendingSubmissions) {
    const comparisonProduct = await resolveSubmissionComparisonProduct({
      barcode: submission.barcode,
      businessActivity: submission.businessActivity,
      platformProduct: submission.platformProduct,
    });

    if (!comparisonProduct) {
      continue;
    }

    const diffRows = buildSubmissionDiffRows({
      barcode: submission.barcode,
      businessActivity: submission.businessActivity,
      name: submission.name,
      brand: submission.brand,
      categoryName: submission.categoryName,
      description: submission.description,
      presentation: submission.presentation,
      image: submission.image,
      variants: submission.variants.map((variant) => ({
        name: variant.name,
        barcode: variant.barcode,
      })),
      platformProduct: comparisonProduct,
    });

    if (diffRows.length === 0) {
      staleSubmissionIds.push(submission.id);
    }
  }

  if (staleSubmissionIds.length > 0) {
    await prisma.platformProductSubmission.updateMany({
      where: {
        id: { in: staleSubmissionIds },
        status: PlatformProductSubmissionStatus.PENDING,
      },
      data: {
        status: PlatformProductSubmissionStatus.REJECTED,
        reviewNote: "Sin cambios respecto a la ficha global.",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });
  }

  revalidatePath("/admin/productos");
}

async function createBusinessActivityAction(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();

  await createBusinessActivity({
    label: String(formData.get("label") ?? ""),
    code: String(formData.get("code") ?? ""),
    description: String(formData.get("description") ?? ""),
    seedDefaultCatalog: formData.get("seedDefaultCatalog") === "on",
  });

  revalidatePath("/admin/productos");
}

export default async function AdminProductsPage() {
  await ensurePlatformAdmin();
  await ensureBusinessActivitiesSeeded();
  await ensurePlatformCatalogSeeded();

  const [
    businessActivities,
    platformProducts,
    rawPendingSubmissions,
    linkedProductsCount,
    autoSyncProductsCount,
    totalPlatformProductsCount,
    pendingSubmissionsTotalCount,
    approvedCount,
    hiddenCount,
    productsByBusinessActivity,
  ] = await Promise.all([
    listBusinessActivityOptions({ includeInactive: true }),
    prisma.platformProduct.findMany({
      include: {
        variants: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 120,
    }),
    prisma.platformProductSubmission.findMany({
      where: { status: PlatformProductSubmissionStatus.PENDING },
      include: {
        platformProduct: {
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
        submittedByUser: {
          select: {
            email: true,
            name: true,
          },
        },
        submittedFromKiosco: {
          select: {
            name: true,
          },
        },
        variants: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.product.count({
      where: {
        platformProductId: {
          not: null,
        },
      },
    }),
    prisma.product.count({
      where: {
        platformProductId: {
          not: null,
        },
        platformSyncMode: "AUTO",
      },
    }),
    prisma.platformProduct.count(),
    prisma.platformProductSubmission.count({
      where: { status: PlatformProductSubmissionStatus.PENDING },
    }),
    prisma.platformProduct.count({
      where: { status: PlatformProductStatus.APPROVED },
    }),
    prisma.platformProduct.count({
      where: { status: PlatformProductStatus.HIDDEN },
    }),
    prisma.platformProduct.groupBy({
      by: ["businessActivity"],
      _count: { _all: true },
    }),
  ]);
  const productCountsByActivity = Object.fromEntries(
    productsByBusinessActivity.map((entry) => [entry.businessActivity, entry._count._all]),
  );
  const pendingSubmissions = await Promise.all(
    rawPendingSubmissions.map(async (submission) => {
      const effectivePlatformProduct = await resolveSubmissionComparisonProduct({
        barcode: submission.barcode,
        businessActivity: submission.businessActivity,
        platformProduct: submission.platformProduct,
      });
      const diffRows = buildSubmissionDiffRows({
        barcode: submission.barcode,
        businessActivity: submission.businessActivity,
        name: submission.name,
        brand: submission.brand,
        categoryName: submission.categoryName,
        description: submission.description,
        presentation: submission.presentation,
        image: submission.image,
        variants: submission.variants.map((variant) => ({
          name: variant.name,
          barcode: variant.barcode,
        })),
        platformProduct: effectivePlatformProduct,
      });

      return {
        ...submission,
        effectivePlatformProduct,
        diffRows,
      };
    }),
  );
  const noChangePendingCount = pendingSubmissions.filter(
    (submission) => submission.effectivePlatformProduct && submission.diffRows.length === 0,
  ).length;

  return (
    <div style={{ minHeight: "100dvh", background: "#020617", padding: "24px", color: "white" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>
              Plataforma
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: "34px" }}>Catalogo global de productos</h1>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/admin" className="btn btn-ghost">
              Volver a admin
            </Link>
            <Link href="/admin/productos/scraper" className="btn btn-ghost">
              Pendientes scraper
            </Link>
            <form action={ensureDefaultCatalogAction}>
              <button type="submit" className="btn btn-secondary">
                Reaplicar catalogo base
              </button>
            </form>
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
          <div style={{ fontWeight: 700, marginBottom: "8px" }}>La base global sirve para dejar bien la ficha comun.</div>
          <div>Nombre, foto, marca, descripcion y presentacion salen de aca.</div>
          <div>Precio, stock y configuracion de caja siguen siendo de cada kiosco.</div>
          <div>Si un kiosco usa sincronizacion automatica, estos cambios se reflejan solos.</div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            { label: "Aportes pendientes", value: pendingSubmissionsTotalCount, tone: "#f59e0b" },
            { label: "Productos aprobados", value: approvedCount, tone: "#22c55e" },
            { label: "Productos ocultos", value: hiddenCount, tone: "#94a3b8" },
            { label: "Vinculados en kioscos", value: linkedProductsCount, tone: "#38bdf8" },
            { label: "Auto-sync activos", value: autoSyncProductsCount, tone: "#a78bfa" },
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
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "24px" }}>Rubros de la base colaborativa</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Crea nuevos rubros para segmentar la base curada y que cada negocio vea su catalogo colaborativo sin friccion.
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, .85fr)", gap: "16px" }}>
            <div
              style={{
                display: "grid",
                gap: "12px",
                padding: "16px",
                borderRadius: "18px",
                background: "rgba(2,6,23,.38)",
                border: "1px solid rgba(148,163,184,.12)",
              }}
            >
              <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                Rubros activos y cantidad de productos curados por rubro.
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {businessActivities.map((activity) => (
                  <div
                    key={activity.value}
                    style={{
                      minWidth: "160px",
                      padding: "12px 14px",
                      borderRadius: "16px",
                      background: "rgba(30,41,59,.72)",
                      border: "1px solid rgba(148,163,184,.12)",
                      display: "grid",
                      gap: "4px",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{activity.label}</div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>{activity.value}</div>
                    <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>
                      {productCountsByActivity[activity.value] ?? 0} producto{(productCountsByActivity[activity.value] ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              action={createBusinessActivityAction}
              style={{
                display: "grid",
                gap: "12px",
                padding: "16px",
                borderRadius: "18px",
                background: "rgba(30,41,59,.72)",
                border: "1px solid rgba(148,163,184,.12)",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "18px" }}>Nuevo rubro</div>
                <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px", lineHeight: 1.5 }}>
                  El codigo es opcional. Si lo dejas vacio, lo generamos a partir del nombre.
                </div>
              </div>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700 }}>Nombre visible</span>
                <input name="label" className="input" placeholder="Ej: Ferreteria industrial" required />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700 }}>Codigo interno</span>
                <input name="code" className="input" placeholder="Ej: FERRETERIA_INDUSTRIAL" />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700 }}>Descripcion</span>
                <textarea
                  name="description"
                  className="input"
                  rows={3}
                  placeholder="Breve descripcion para registro y administracion."
                  style={{ resize: "vertical" }}
                />
              </label>

              <label style={{ display: "flex", gap: "10px", alignItems: "center", color: "#cbd5e1", fontSize: "14px" }}>
                <input type="checkbox" name="seedDefaultCatalog" />
                Sembrar catalogo base por defecto para cuentas nuevas de este rubro
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" className="btn btn-primary">
                  Crear rubro
                </button>
              </div>
            </form>
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
              <h2 style={{ margin: 0, fontSize: "24px" }}>Aportes pendientes</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Revisalos rapido y publica solo lo que mejora la ficha general.
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {noChangePendingCount > 0 && (
                <form action={clearNoChangeSubmissionsAction}>
                  <button type="submit" className="btn btn-ghost">
                    Limpiar sin cambios ({noChangePendingCount})
                  </button>
                </form>
              )}
              <div style={{ color: "#94a3b8" }}>
                Mostrando {pendingSubmissions.length} de {pendingSubmissionsTotalCount} pendientes
              </div>
            </div>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No hay aportes pendientes por moderar.</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {pendingSubmissions.map((submission) => {
                const diffRows = submission.diffRows;
                const comparisonProduct = submission.effectivePlatformProduct;

                return (
                  <form
                    key={submission.id}
                    action={reviewSubmission}
                    style={{
                      display: "grid",
                      gap: "10px",
                      padding: "16px",
                      borderRadius: "16px",
                      background: "rgba(30,41,59,.8)",
                      border: "1px solid rgba(148,163,184,.12)",
                    }}
                  >
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontWeight: 700, fontSize: "18px" }}>{submission.name}</div>
                        <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                          {submission.barcode || "Sin barcode base"} | {submission.submittedFromKiosco?.name || "Kiosco desconocido"} |{" "}
                          {submission.submittedByUser?.name || submission.submittedByUser?.email || "Usuario desconocido"}
                        </div>
                        <div style={{ color: "#cbd5e1", fontSize: "13px" }}>
                          Rubro: {getBusinessActivityLabel(submission.businessActivity, businessActivities)}
                        </div>
                        <div
                          style={{
                            display: "inline-flex",
                            width: "fit-content",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: comparisonProduct ? "#38bdf8" : "#f59e0b",
                            background: comparisonProduct
                              ? "rgba(56,189,248,0.12)"
                              : "rgba(245,158,11,0.12)",
                            border: comparisonProduct
                              ? "1px solid rgba(56,189,248,0.22)"
                              : "1px solid rgba(245,158,11,0.22)",
                          }}
                        >
                          {comparisonProduct ? "Mejora sobre ficha existente" : "Producto nuevo para revisar"}
                        </div>
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        {new Date(submission.createdAt).toLocaleString("es-AR")}
                      </div>
                    </div>

                    {diffRows.length === 0 ? (
                      <div
                        style={{
                          borderRadius: "14px",
                          border: "1px solid rgba(148,163,184,.18)",
                          background: "rgba(2,6,23,.35)",
                          padding: "12px 14px",
                          color: "#cbd5e1",
                        }}
                      >
                        Este aporte no cambia la ficha global. Probablemente el kiosco solo consumio la base precargada.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {diffRows.map((row) => (
                            <span
                              key={`${submission.id}-${row.field}`}
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

                        {comparisonProduct && (
                          <ProductDiffTable rows={diffRows} />
                        )}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Rubro</div>
                        <div>{getBusinessActivityLabel(submission.businessActivity, businessActivities)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Marca</div>
                        <div>{submission.brand || "Sin marca"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Presentacion</div>
                        <div>{submission.presentation || "Sin dato"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Categoria</div>
                        <div>{submission.categoryName || "Sin categoria"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Descripcion</div>
                        <div>{submission.description || "Sin descripcion"}</div>
                      </div>
                    </div>

                    {submission.variants.length > 0 && (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Variantes</div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {submission.variants.map((variant) => (
                            <span
                              key={variant.id}
                              style={{
                                borderRadius: "999px",
                                border: "1px solid rgba(148,163,184,.16)",
                                padding: "6px 10px",
                                fontSize: "12px",
                                color: "#cbd5e1",
                                background: "rgba(2,6,23,.5)",
                              }}
                            >
                              {variant.name}
                              {variant.barcode ? ` | ${variant.barcode}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      name="reviewNote"
                      className="input"
                      placeholder="Nota interna opcional"
                      rows={2}
                      style={{ resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button type="submit" name="action" value="approve" className="btn btn-primary">
                        Aprobar y publicar
                      </button>
                      <button type="submit" name="action" value="reject" className="btn btn-ghost">
                        Rechazar aporte
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </section>

        <PlatformProductQuickEditor
          businessActivities={businessActivities}
          products={platformProducts.map((product) => ({
            id: product.id,
            barcode: product.barcode,
            businessActivity: product.businessActivity,
            name: product.name,
            brand: product.brand,
            categoryName: product.categoryName,
            presentation: product.presentation,
            description: product.description,
            image: product.image,
            status: product.status,
            variants: product.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              barcode: variant.barcode,
            })),
          }))}
        />

        <PlatformImagePushManager />

        <PlatformProductBackupManager />

        <PlatformProductBulkImporter businessActivities={businessActivities} />

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
              <h2 style={{ margin: 0, fontSize: "24px" }}>Ultimos productos globales</h2>
              <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
                Referencia rapida para revisar la base. La edicion fina va por el editor rapido de arriba.
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#94a3b8" }}>
                Mostrando {platformProducts.length} de {totalPlatformProductsCount} productos cargados
              </div>
              <Link href="/admin/productos#editor-rapido" className="btn btn-ghost">
                Ir al editor
              </Link>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {platformProducts.slice(0, 80).map((product) => (
              <article
                key={product.id}
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "16px",
                  borderRadius: "16px",
                  background: "rgba(30,41,59,.8)",
                  border: "1px solid rgba(148,163,184,.12)",
                }}
              >
                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image}
                      alt={product.name}
                      style={{ width: "54px", height: "54px", borderRadius: "14px", objectFit: "cover", border: "1px solid rgba(148,163,184,.18)" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "54px",
                        height: "54px",
                        borderRadius: "14px",
                        border: "1px dashed rgba(148,163,184,.18)",
                        background: "rgba(2,6,23,.5)",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>{product.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                      {product.barcode || "Sin barcode base"}
                      {product.brand ? ` | ${product.brand}` : ""}
                      {product.categoryName ? ` | ${product.categoryName}` : ""}
                    </div>
                    <div style={{ color: "#cbd5e1", fontSize: "12px", marginTop: "4px" }}>
                      Rubro: {getBusinessActivityLabel(product.businessActivity, businessActivities)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>Presentacion</div>
                    <div>{product.presentation || "Sin dato"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>Estado</div>
                    <div style={{ color: product.status === PlatformProductStatus.HIDDEN ? "#fca5a5" : "#86efac" }}>
                      {product.status === PlatformProductStatus.HIDDEN ? "Oculto" : "Aprobado"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>Ultima actualizacion</div>
                    <div>{new Date(product.updatedAt).toLocaleString("es-AR")}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Descripcion</div>
                  <div style={{ color: "#cbd5e1" }}>{product.description || "Sin descripcion"}</div>
                </div>
                {product.variants.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {product.variants.map((variant) => (
                      <span
                        key={variant.id}
                        style={{
                          borderRadius: "999px",
                          border: "1px solid rgba(148,163,184,.16)",
                          padding: "6px 10px",
                          fontSize: "12px",
                          color: "#cbd5e1",
                          background: "rgba(2,6,23,.5)",
                        }}
                      >
                        {variant.name}
                        {variant.barcode ? ` | ${variant.barcode}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                    Usa el editor rapido para cambiar esta ficha.
                  </div>
                  <Link href={`/admin/productos?edit=${product.id}#editor-rapido`} className="btn btn-secondary">
                    Editar ficha
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
