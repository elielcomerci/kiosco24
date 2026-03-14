import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SUGGESTED_PRODUCTS = [
  { name: "Coca Cola 500ml",   price: 1200, cost: 800,  emoji: "🥤" },
  { name: "Pepsi 500ml",       price: 1100, cost: 700,  emoji: "🥤" },
  { name: "Agua 500ml",        price: 800,  cost: 450,  emoji: "💧" },
  { name: "Coca Cola 1.5L",    price: 2100, cost: 1400, emoji: "🥤" },
  { name: "Sprite 500ml",      price: 1100, cost: 700,  emoji: "🥤" },
  { name: "Alfajor Habano",    price: 600,  cost: 350,  emoji: "🍫" },
  { name: "Alfajor Capitán",   price: 700,  cost: 400,  emoji: "🍫" },
  { name: "Papas Lays",        price: 900,  cost: 550,  emoji: "🥔" },
  { name: "Chicles Beldent",   price: 450,  cost: 250,  emoji: "🍬" },
  { name: "Mentitas",          price: 350,  cost: 180,  emoji: "🍬" },
  { name: "Chocolinas",        price: 1400, cost: 900,  emoji: "🍪" },
  { name: "Oreo",              price: 1600, cost: 1000, emoji: "🍪" },
  { name: "Red Bull 250ml",    price: 2200, cost: 1500, emoji: "⚡" },
  { name: "Gatorade 500ml",    price: 1400, cost: 900,  emoji: "⚡" },
  { name: "Cigarrillos PM",    price: 2800, cost: 2200, emoji: "🚬" },
  { name: "Cigarrillos LM",    price: 2700, cost: 2100, emoji: "🚬" },
  { name: "Maní Confitado",    price: 400,  cost: 200,  emoji: "🥜" },
  { name: "Galletitas Terrab", price: 800,  cost: 450,  emoji: "🍪" },
  { name: "Facturas x3",       price: 900,  cost: 450,  emoji: "🥐" },
  { name: "Café",              price: 600,  cost: 150,  emoji: "☕" },
];

// POST /api/onboarding — called after first login to set up the kiosco
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kioscoName } = await req.json().catch(() => ({ kioscoName: "Mi Kiosco" }));

  // Check if kiosco already exists
  const existing = await prisma.kiosco.findUnique({ where: { ownerId: session.user.id } });
  if (existing) return NextResponse.json({ kiosco: existing, alreadySetup: true });

  // Create kiosco, branch, products and inventory records all together
  const kiosco = await prisma.kiosco.create({
    data: {
      name: kioscoName ?? "Mi Kiosco",
      ownerId: session.user.id,
      products: {
        create: SUGGESTED_PRODUCTS.map(({ price, cost, ...p }) => ({ ...p })), // Global catalog without price
      },
      branches: {
        create: {
          name: "Sucursal Principal",
        }
      }
    },
    include: {
      products: true,
      branches: true
    }
  });

  const mainBranch = kiosco.branches[0];

  // Creates the inventory records for the main branch
  await prisma.inventoryRecord.createMany({
    data: kiosco.products.map((product: { id: string; name: string }) => {
      // Find the original suggested product to extract price and cost
      const suggested = SUGGESTED_PRODUCTS.find(p => p.name === product.name);
      return {
        productId: product.id,
        branchId: mainBranch.id,
        price: suggested?.price ?? 0,
        cost: suggested?.cost,
        stock: 0,
        showInGrid: true,
      };
    })
  });

  return NextResponse.json({ kiosco, alreadySetup: false, branchId: mainBranch.id });
}

// GET /api/onboarding — check if kiosco is set up
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ setup: false });

  const kiosco = await prisma.kiosco.findUnique({ where: { ownerId: session.user.id } });
  return NextResponse.json({ setup: !!kiosco, kiosco });
}
