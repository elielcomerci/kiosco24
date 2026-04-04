import { NextResponse } from "next/server";

import { guardSetupAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import {
  isCatalogImportMode,
  isCatalogImportScope,
} from "@/lib/catalog-spreadsheet";
import { applyCatalogImport } from "@/lib/catalog-import";

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

    if (scope === "everything" || scope === "stock" || scope === "lots") {
      const accessResponse = await guardSetupAccess(session.user);
      if (accessResponse) {
        return accessResponse;
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await applyCatalogImport({
      kioscoId,
      branchId: targetBranchId,
      buffer: arrayBuffer,
      scope,
      mode,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error applying catalog import:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No pudimos importar el archivo." },
      { status: 400 },
    );
  }
}
