import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportCatalogSpreadsheet } from "@/lib/catalog-import";
import { getBranchContext } from "@/lib/branch";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { kioscoId, branchId } = await getBranchContext(req, session.user.id);
    if (!kioscoId || !branchId) {
      return NextResponse.json({ error: "No branch selected" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : undefined;

    const buffer = await exportCatalogSpreadsheet({
      kioscoId,
      branchId,
      productIds,
    });

    const fileStamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="catalogo-${fileStamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting catalog spreadsheet:", error);
    return NextResponse.json({ error: "No pudimos exportar el archivo." }, { status: 500 });
  }
}
