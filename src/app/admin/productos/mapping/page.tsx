import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { redirect } from "next/navigation";
import { listBusinessActivityOptions } from "@/lib/business-activities-store";
import { getBusinessActivityLabel } from "@/lib/business-activities";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function ensurePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isPlatformAdmin(session.user)) {
    redirect("/");
  }
  return session;
}

async function updateBatchAction(formData: FormData) {
  "use server";
  await ensurePlatformAdmin();

  const sourceCategory = String(formData.get("sourceCategory") ?? "");
  const targetCategory = String(formData.get("targetCategory") ?? "").trim();
  const targetBusinessActivity = String(formData.get("targetBusinessActivity") ?? "");

  if (!sourceCategory) return;

  const updateData: any = {};
  if (targetCategory) updateData.categoryName = targetCategory;
  if (targetBusinessActivity) updateData.businessActivity = targetBusinessActivity;

  if (Object.keys(updateData).length === 0) return;

  await prisma.platformProduct.updateMany({
    where: { categoryName: sourceCategory },
    data: updateData,
  });

  revalidatePath("/admin/productos/mapping");
  revalidatePath("/admin/productos");
}

export default async function PlatformMappingPage() {
  await ensurePlatformAdmin();

  const businessActivities = await listBusinessActivityOptions({ includeInactive: true });

  const groups = await prisma.platformProduct.groupBy({
    by: ["categoryName"],
    _count: { _all: true },
    orderBy: { categoryName: "asc" },
  });

  const sortedGroups = groups
    .map((g) => ({
      categoryName: g.categoryName || "Sin categoria",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", color: "#f8fafc" }}>
      <header style={{ marginBottom: "30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Link href="/admin/productos" style={{ color: "#38bdf8", textDecoration: "none", fontSize: "14px" }}>
            &larr; Volver a Productos
          </Link>
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-.02em" }}>
          Mapeo Global de Categorias
        </h1>
        <p style={{ color: "#94a3b8", marginTop: "8px", fontSize: "16px" }}>
          Administra rubros y limpia categorias del catalogo colaborativo de forma masiva.
        </p>
      </header>

      <section style={{ display: "grid", gap: "16px" }}>
        {sortedGroups.map((group) => (
          <form
            key={group.categoryName}
            action={updateBatchAction}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: "16px",
              alignItems: "end",
              padding: "20px",
              borderRadius: "20px",
              background: "rgba(15,23,42,.6)",
              border: "1px solid rgba(148,163,184,.12)",
              backdropFilter: "blur(10px)",
            }}
          >
            <input type="hidden" name="sourceCategory" value={group.categoryName} />
            
            <div>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                Categoria Actual
              </span>
              <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>
                {group.categoryName}
                <span style={{ color: "#475569", fontWeight: 400, marginLeft: "8px" }}>
                  ({group.count} prod.)
                </span>
              </div>
            </div>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>Nuevo Rubro (Bulk)</span>
              <select name="targetBusinessActivity" className="input" style={{ width: "100%" }}>
                <option value="">Mantener actual</option>
                {businessActivities.map((ba) => (
                  <option key={ba.value} value={ba.value}>
                    {ba.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>Renombrar Categoria (Bulk)</span>
              <input
                name="targetCategory"
                className="input"
                placeholder="Ej: Bebidas, Snacks..."
                style={{ width: "100%" }}
              />
            </label>

            <button type="submit" className="btn btn-primary" style={{ height: "42px" }}>
              Aplicar a todos
            </button>
          </form>
        ))}
      </section>

      {sortedGroups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>
          No hay productos categorizados en el catalogo global.
        </div>
      )}
    </div>
  );
}
