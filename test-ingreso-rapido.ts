import { NextResponse } from "next/server";
import { POST } from "./src/app/api/inventario/ingreso-rapido/route";

// mock Next.js headers/request
const mockRequest = new Request("http://localhost:3000/api/inventario/ingreso-rapido", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-branch-id": "cmm5z1gq2000ar3njpegj1b64"
  },
  body: JSON.stringify({
    mode: "sumar",
    operation: "receive",
    items: [
      {
        productId: "cmna8mcp8000404jv5en3l2g3",
        quantityWithoutExpiry: 10,
        lots: [],
        unitCost: null,
        salePrice: null
      }
    ],
    trackCosts: true,
  })
});

// mock auth by overriding global auth
jest.mock("./src/lib/auth", () => ({
  auth: async () => ({
    user: { id: "cmm5z11we0000r3njn8u55f8g", role: "OWNER" }
  })
}));

async function run() {
  console.log("Running mock request...");
  try {
    const res = await POST(mockRequest);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Crash:", err);
  }
}

run();
