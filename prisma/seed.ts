import { PrismaClient } from "@prisma/client";
import { DEFAULT_SEED_BY_ACTIVITY } from "../src/lib/default-kiosco-catalog";

const prisma = new PrismaClient();

async function main() {
  const rubros = Object.keys(DEFAULT_SEED_BY_ACTIVITY);
  console.log("Siembra por rubro activa. Rubros configurados:", rubros.length);
  rubros.forEach((rubro) => {
    const seed = DEFAULT_SEED_BY_ACTIVITY[rubro];
    console.log(` - ${rubro}: "${seed.product.name}"`);
  });
  console.log("La creacion real del catalogo ocurre en /api/auth/register y /api/onboarding.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
