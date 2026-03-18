import { PrismaClient } from "@prisma/client";

import {
  DEFAULT_KIOSCO_CATEGORIES,
  DEFAULT_KIOSCO_PRODUCT_COUNT,
  DEFAULT_KIOSCO_PRODUCTS,
  DEFAULT_KIOSCO_SCANNABLE_PRODUCT_COUNT,
} from "../src/lib/default-kiosco-catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed base de kiosco listo para onboarding.");
  console.log("Categorias iniciales:", DEFAULT_KIOSCO_CATEGORIES.length);
  console.log("Productos iniciales:", DEFAULT_KIOSCO_PRODUCT_COUNT);
  console.log("Productos escaneables:", DEFAULT_KIOSCO_SCANNABLE_PRODUCT_COUNT);
  console.log("Ejemplo:", DEFAULT_KIOSCO_PRODUCTS[0]?.name ?? "sin productos");
  console.log("Nota: la creacion real del catalogo inicial ocurre en /api/onboarding.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

export {
  DEFAULT_KIOSCO_CATEGORIES,
  DEFAULT_KIOSCO_PRODUCTS,
  DEFAULT_KIOSCO_PRODUCT_COUNT,
  DEFAULT_KIOSCO_SCANNABLE_PRODUCT_COUNT,
};
