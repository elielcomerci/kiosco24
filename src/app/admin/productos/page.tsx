import {
  PlatformProductStatus,
  PlatformProductSubmissionStatus,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { ensurePlatformCatalogSeeded } from "@/lib/platform-catalog";
import { isPlatformAdmin } from "@/lib/platform-admin";
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

async function savePlatformProduct(formData: FormData) {
  "use server";

  await ensurePlatformAdmin();

  const id = String(formData.get("id") ?? "");
  const barcode = String(formData.get("barcode") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const presentation = String(formData.get("presentation") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const image = String(formData.get("image") ?? "").trim();
  const status =
    String(formData.get("status") ?? PlatformProductStatus.APPROVED) === PlatformProductStatus.HIDDEN
      ? PlatformProductStatus.HIDDEN
      : PlatformProductStatus.APPROVED;

  const existingProduct = id
    ? await prisma.platformProduct.findUnique({
        where: { id },
        include: { variants: true },
      })
    : null;
  const effectiveBarcode = existingProduct?.variants.length ? null : barcode;

  if (!name || (!effectiveBarcode && !(existingProduct?.variants.length ?? 0))) {
    return;
  }

  if (id) {
    await prisma.platformProduct.update({
      where: { id },
      data: {
        barcode: effectiveBarcode,
        name,
        brand: brand || null,
        categoryName: categoryName || null,
        presentation: presentation || null,
        description: description || null,
        image: image || null,
        status,
      },
    });
  } else if (barcode) {
    await prisma.platformProduct.upsert({
      where: { barcode: effectiveBarcode! },
      update: {
        name,
        brand: brand || null,
        categoryName: categoryName || null,
        presentation: presentation || null,
        description: description || null,
        image: image || null,
        status,
      },
      create: {
        barcode: effectiveBarcode,
        name,
        brand: brand || null,
        presentation: presentation || null,
        description: description || null,
        image: image || null,
        status,
      },
    });
  }

  revalidatePath("/admin/productos");
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
      });

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

  const [platformProducts, pendingSubmissions] = await Promise.all([
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
  ]);

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
          Este catalogo se usa para precargar datos al crear productos por codigo de barras. Si un producto tiene
          variantes, cada variante puede guardar su propio codigo. Los productos solo aparecen en la caja del kiosco
          cuando ese kiosco completa precio, costo unitario y stock.
        </div>

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
            <h2 style={{ margin: 0, fontSize: "24px" }}>Aportes pendientes</h2>
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
                        {submission.barcode || "Sin barcode base"} · {submission.submittedFromKiosco?.name || "Kiosco desconocido"} ·{" "}
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
                            {variant.barcode ? ` · ${variant.barcode}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    name="reviewNote"
                    className="input"
                    placeholder="Nota interna de moderacion"
                    rows={2}
                    style={{ resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="submit" name="action" value="approve" className="btn btn-primary">
                      Aprobar y publicar
                    </button>
                    <button type="submit" name="action" value="reject" className="btn btn-ghost">
                      Rechazar
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
            <h2 style={{ margin: 0, fontSize: "24px" }}>Base global</h2>
            <div style={{ color: "#94a3b8" }}>{platformProducts.length} productos cargados</div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {platformProducts.map((product) => (
              <form
                key={product.id}
                action={savePlatformProduct}
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "16px",
                  borderRadius: "16px",
                  background: "rgba(30,41,59,.8)",
                  border: "1px solid rgba(148,163,184,.12)",
                }}
              >
                <input type="hidden" name="id" value={product.id} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                  <input name="barcode" className="input" defaultValue={product.barcode ?? ""} />
                  <input name="name" className="input" defaultValue={product.name} />
                  <input name="brand" className="input" defaultValue={product.brand ?? ""} />
                  <input name="categoryName" className="input" defaultValue={product.categoryName ?? ""} placeholder="Categoria" />
                  <input name="presentation" className="input" defaultValue={product.presentation ?? ""} />
                  <input name="image" className="input" defaultValue={product.image ?? ""} />
                  <select name="status" className="input" defaultValue={product.status}>
                    <option value={PlatformProductStatus.APPROVED}>Aprobado</option>
                    <option value={PlatformProductStatus.HIDDEN}>Oculto</option>
                  </select>
                </div>
                <textarea
                  name="description"
                  className="input"
                  defaultValue={product.description ?? ""}
                  rows={2}
                  style={{ resize: "vertical" }}
                />
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
                        {variant.barcode ? ` · ${variant.barcode}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                    Actualizado: {new Date(product.updatedAt).toLocaleString("es-AR")}
                  </div>
                  <button type="submit" className="btn btn-secondary">
                    Guardar cambios
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
