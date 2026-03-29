import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import {
  BarcodeLookupResponse,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import {
  findApprovedPlatformProductByBarcode,
  platformProductToSuggestion,
  searchApprovedPlatformProductsByName,
} from "@/lib/platform-catalog";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { searchParams } = new URL(req.url);
  const code = normalizeBarcodeCode(searchParams.get("code") ?? "");
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length >= 3) {
    const matches = await searchApprovedPlatformProductsByName(query, 6);
    const response: BarcodeLookupResponse = {
      found: matches.length > 0,
      suggestion: null,
      suggestions: matches.map((product) => platformProductToSuggestion(product)),
    };
    return NextResponse.json(response);
  }

  if (!canLookupBarcode(code)) {
    const response: BarcodeLookupResponse = { found: false, suggestion: null, suggestions: [] };
    return NextResponse.json(response);
  }

  const platformProduct = await findApprovedPlatformProductByBarcode(code);
  const suggestion = platformProduct ? platformProductToSuggestion(platformProduct) : null;
  const response: BarcodeLookupResponse = {
    found: Boolean(suggestion),
    suggestion,
    suggestions: suggestion ? [suggestion] : [],
  };

  return NextResponse.json(response);
}
