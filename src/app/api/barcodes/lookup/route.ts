import { auth } from "@/lib/auth";
import { guardSetupAccess } from "@/lib/access-control";
import {
  BarcodeLookupResponse,
  BarcodeSuggestion,
  canLookupBarcode,
  normalizeBarcodeCode,
} from "@/lib/barcode-suggestions";
import { NextResponse } from "next/server";

interface OpenFoodFactsResponse {
  status?: number;
  product?: {
    product_name?: string;
    generic_name?: string;
    brands?: string;
    quantity?: string;
    image_front_url?: string;
    image_url?: string;
  };
}

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pickSuggestion(code: string, data: OpenFoodFactsResponse): BarcodeSuggestion | null {
  if (data.status !== 1 || !data.product) return null;

  const name = cleanText(data.product.product_name);
  if (!name) return null;

  const brands = cleanText(data.product.brands);

  return {
    code,
    name,
    brand: brands ? brands.split(",")[0]?.trim() || brands : null,
    categoryName: null,
    description: cleanText(data.product.generic_name),
    presentation: cleanText(data.product.quantity),
    image: cleanText(data.product.image_front_url) ?? cleanText(data.product.image_url),
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardSetupAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const { searchParams } = new URL(req.url);
  const code = normalizeBarcodeCode(searchParams.get("code") ?? "");

  if (!canLookupBarcode(code)) {
    const response: BarcodeLookupResponse = { found: false, suggestion: null };
    return NextResponse.json(response);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,generic_name,brands,quantity,image_front_url,image_url`,
      {
        headers: {
          "User-Agent": "Clikit/1.0 (barcode lookup)",
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const response: BarcodeLookupResponse = { found: false, suggestion: null };
      return NextResponse.json(response);
    }

    const data = (await res.json()) as OpenFoodFactsResponse;
    const suggestion = pickSuggestion(code, data);
    const response: BarcodeLookupResponse = {
      found: Boolean(suggestion),
      suggestion,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Barcode lookup failed", error);
    const response: BarcodeLookupResponse = { found: false, suggestion: null };
    return NextResponse.json(response);
  } finally {
    clearTimeout(timeoutId);
  }
}
