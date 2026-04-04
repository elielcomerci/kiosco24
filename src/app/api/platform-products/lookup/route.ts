import { auth } from "@/lib/auth";
import { guardSetupAccess } from "@/lib/access-control";
import {
  BarcodeLookupResponse,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import {
  browseApprovedPlatformProducts,
  findApprovedPlatformProductByBarcode,
  platformProductToSuggestion,
  searchApprovedPlatformProductsByName,
} from "@/lib/platform-catalog";
import { getBranchContext } from "@/lib/branch";
import { resolveBusinessActivityForKiosco } from "@/lib/business-activities-store";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { kioscoId } = await getBranchContext(req, session.user.id);
  const businessActivity = await resolveBusinessActivityForKiosco(kioscoId);

  const { searchParams } = new URL(req.url);
  const code = normalizeBarcodeCode(searchParams.get("code") ?? "");
  const query = (searchParams.get("q") ?? "").trim();
  const browse = searchParams.get("browse") === "1";
  const requestedLimit = Number(searchParams.get("limit") ?? "");
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined;

  if (browse) {
    const matches = await browseApprovedPlatformProducts(query, limit ?? 12, businessActivity);
    const response: BarcodeLookupResponse = {
      found: matches.length > 0,
      suggestion: null,
      suggestions: matches.map((product) => platformProductToSuggestion(product)),
    };
    return NextResponse.json(response);
  }

  if (query.length >= 2) {
    const matches = await searchApprovedPlatformProductsByName(
      query,
      limit ?? 6,
      businessActivity,
    );
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

  const platformProduct = await findApprovedPlatformProductByBarcode(code, businessActivity);
  const suggestion = platformProduct ? platformProductToSuggestion(platformProduct) : null;
  const response: BarcodeLookupResponse = {
    found: Boolean(suggestion),
    suggestion,
    suggestions: suggestion ? [suggestion] : [],
  };

  return NextResponse.json(response);
}
