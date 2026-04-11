import { prisma } from "./src/lib/prisma";

const terms = [
  "alfajor",
  "quilmes",
  "dogui",
  "purina",
  "pedigree",
  "colgate",
  "algodon",
  "bic",
  "faber",
  "cat chow",
  "tomate",
  "lampara"
];

async function main() {
  for (const term of terms) {
    const products = await prisma.platformProduct.findMany({
      take: 1,
      where: {
        AND: [
          { name: { contains: term, mode: "insensitive" } },
          { image: { not: null } },
        ]
      },
      select: { barcode: true, name: true, brand: true, categoryName: true }
    });
    console.log(`Term: ${term}`);
    console.log(products);
    console.log("---");
  }
}

main().then(() => process.exit(0));
