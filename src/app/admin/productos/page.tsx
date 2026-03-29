import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { ensurePlatformCatalogSeeded } from "@/lib/platform-catalog";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { syncAutoProductsFromPlatformProduct } from "@/lib/platform-product-sync";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlatformProductBackupManager from "@/app/admin/productos/PlatformProductBackupManager";
import PlatformProductBulkImporter from "@/app/admin/productos/PlatformProductBulkImporter";
import PlatformProductQuickEditor from "@/app/admin/productos/PlatformProductQuickEditor";

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

  const variantData = submission.variants.map((variant) => ({
    name: variant.name,
    barcode: variant.barcode,
  }));
  const effectiveBarcode = variantData.length > 0 ? null : submission.barcode;

  const platformProduct = submission.platformProductId
    ? await prisma.platformProduct.update({
        where: { id: submission.platformProductId },
        data: {
          barcode: effectiveBarcode,
          name: submission.name,
          brand: submission.brand,
          categoryName: submission.categoryName,
          description: submission.description,
          presentation: submission.presentation,
          image: submission.image,
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
            name: submission.name,
            brand: submission.brand,
            categoryName: submission.categoryName,
            description: submission.description,
            presentation: submission.presentation,
            image: submission.image,
            status: PlatformProductStatus.APPROVED,
            variants: {
              deleteMany: {},
              create: variantData,
            },
          },
          create: {
            barcode: effectiveBarcode,
            name: submission.name,
            brand: submission.brand,
            categoryName: submission.categoryName,
            description: submission.description,
            presentation: submission.presentation,
            image: submission.image,
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
          name: submission.name,
          brand: submission.brand,
          categoryName: submission.categoryName,
          description: submission.description,
          presentation: submission.presentation,
          image: submission.image,
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

export default async function AdminProductsPage() {
  await ensurePlatformAdmin();
  await ensurePlatformCatalogSeeded();

  const [platformProducts, pendingSubmissions, linkedProductsCount, autoSyncProductsCount] = await Promise.all([
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
  ]);
  const approvedCount = platformProducts.filter((product) => product.status === PlatformProductStatus.APPROVED).length;
  const hiddenCount = platformProducts.filter((product) => product.status === PlatformProductStatus.HIDDEN).length;

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
            { label: "Aportes pendientes", value: pendingSubmissions.length, tone: "#f59e0b" },
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
            <div style={{ color: "#94a3b8" }}>{pendingSubmissions.length} pendientes</div>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No hay aportes pendientes por moderar.</div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {pendingSubmissions.map((submission) => (
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
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>{submission.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                        {submission.barcode || "Sin barcode base"} | {submission.submittedFromKiosco?.name || "Kiosco desconocido"} |{" "}
                        {submission.submittedByUser?.name || submission.submittedByUser?.email || "Usuario desconocido"}
                      </div>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                      {new Date(submission.createdAt).toLocaleString("es-AR")}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
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
              ))}
            </div>
          )}
        </section>

        <PlatformProductQuickEditor
          products={platformProducts.map((product) => ({
            id: product.id,
            barcode: product.barcode,
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

        <PlatformProductBackupManager />

        <PlatformProductBulkImporter />

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
              <div style={{ color: "#94a3b8" }}>{platformProducts.length} productos cargados</div>
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
                  <Link href="/admin/productos#editor-rapido" className="btn btn-secondary">
                    Editar arriba
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
