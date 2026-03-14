import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const SUGGESTED_PRODUCTS = [
  { name: "Coca Cola 500ml",  price: 1200, cost: 800,  emoji: "🥤", barcode: "7790895000075" },
  { name: "Pepsi 500ml",      price: 1100, cost: 700,  emoji: "🥤", barcode: "7790310981801" },
  { name: "Agua 500ml",       price: 800,  cost: 450,  emoji: "💧", barcode: "7791895000040" },
  { name: "Coca Cola 1.5L",   price: 2100, cost: 1400, emoji: "🥤" },
  { name: "Sprite 500ml",     price: 1100, cost: 700,  emoji: "🥤" },
  { name: "Alfajor Habano",   price: 600,  cost: 350,  emoji: "🍫" },
  { name: "Alfajor Capitán",  price: 700,  cost: 400,  emoji: "🍫" },
  { name: "Papas Lays",       price: 900,  cost: 550,  emoji: "🥔", barcode: "7791331005014" },
  { name: "Chicles Beldent",  price: 450,  cost: 250,  emoji: "🍬" },
  { name: "Mentitas",         price: 350,  cost: 180,  emoji: "🍬" },
  { name: "Chocolinas",       price: 1400, cost: 900,  emoji: "🍪" },
  { name: "Oreo",             price: 1600, cost: 1000, emoji: "🍪" },
  { name: "Red Bull 250ml",   price: 2200, cost: 1500, emoji: "⚡" },
  { name: "Gatorade 500ml",   price: 1400, cost: 900,  emoji: "⚡" },
  { name: "Cigarrillos PM",   price: 2800, cost: 2200, emoji: "🚬" },
  { name: "Cigarrillos LM",   price: 2700, cost: 2100, emoji: "🚬" },
  { name: "Maní Confitado",   price: 400,  cost: 200,  emoji: "🥜" },
  { name: "Galletitas Terrab", price: 800, cost: 450,  emoji: "🍪" },
  { name: "Facturas x3",      price: 900,  cost: 450,  emoji: "🥐" },
  { name: "Café",             price: 600,  cost: 150,  emoji: "☕" },
];

async function main() {
  console.log("Seed: productos sugeridos cargados (se usan en onboarding)");
  console.log("Productos disponibles:", SUGGESTED_PRODUCTS.length);
  // Nota: La creación real del usuario, Kiosco, Branch y cruce de InventoryRecords 
  // se delega a las rutas API de onboarding (ej: login/callback o acciones de setup)
  // ya que este schema multitenant dinámico depende del dueño.
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

export { SUGGESTED_PRODUCTS };
