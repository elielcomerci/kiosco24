import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  isCatalogImportMode,
  isCatalogImportScope,
} from "@/lib/catalog-spreadsheet";
import { previewCatalogImport } from "@/lib/catalog-import";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { kioscoId } = await getBranchContext(req, session.user.id);
    if (!kioscoId) {
      return NextResponse.json({ error: "No kiosco selected" }, { status: 400 });
    }

    const formData = await req.formData();
    const targetBranchId =
      typeof formData.get("targetBranchId") === "string" ? String(formData.get("targetBranchId")) : "";
    const scope = formData.get("scope");
    const mode = formData.get("mode");
    const file = formData.get("file");

    if (!targetBranchId) {
      return NextResponse.json({ error: "Elegi una sucursal destino." }, { status: 400 });
    }
    if (!isCatalogImportScope(scope)) {
      return NextResponse.json({ error: "Scope invalido." }, { status: 400 });
    }
    if (!isCatalogImportMode(mode)) {
      return NextResponse.json({ error: "Mode invalido." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta un archivo XLSX." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const preview = await previewCatalogImport({
      kioscoId,
      branchId: targetBranchId,
      buffer: arrayBuffer,
      scope,
      mode,
    });

    return NextResponse.json(preview);
  } catch (error) {
    console.error("Error previewing catalog import:", error);
    return NextResponse.json({ error: "No pudimos analizar el archivo." }, { status: 500 });
  }
}
