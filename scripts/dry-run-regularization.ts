import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "santiagoinsfran12@gmail.com";

  // Encontrar el usuario
  const user = await prisma.user.findUnique({
    where: { email },
    include: { kiosco: { include: { branches: true } } }
  });

  if (!user || !user.kiosco) {
    console.log("Usuario o kiosco no encontrado.");
    return;
  }

  const kioscoId = user.kiosco.id;
  console.log(`Analizando kiosco: ${user.kiosco.name} (ID: ${kioscoId})`);

  let totalUncoveredValue = 0;
  let proposedLayerCount = 0;

  for (const branch of user.kiosco.branches) {
    console.log(`\nSucursal: ${branch.name} (ID: ${branch.id})`);
    
    // Base Inventories
    const baseInventories = await prisma.inventoryRecord.findMany({
      where: { branchId: branch.id, stock: { gt: 0 } },
      include: {
        product: { select: { id: true, name: true, variants: { select: { id: true } } } }
      }
    });

    for (const inv of baseInventories) {
      if (inv.product.variants.length > 0) continue;

      const layers = await prisma.inventoryCostLayer.findMany({
        where: { branchId: branch.id, productId: inv.productId, variantId: null, remainingQuantity: { gt: 0 } }
      });

      const coveredUnits = layers.reduce((acc, layer) => acc + layer.remainingQuantity, 0);
      const uncoveredUnits = Math.max((inv.stock ?? 0) - coveredUnits, 0);
      const cost = Number(inv.cost);

      if (uncoveredUnits > 0 && Number.isFinite(cost) && cost > 0) {
        const capitalRecovered = uncoveredUnits * cost;
        totalUncoveredValue += capitalRecovered;
        proposedLayerCount++;
        console.log(` - [Base] ${inv.product.name} | Stock: ${inv.stock} | Uncovered: ${uncoveredUnits} | Cost: $${cost} | Capital Reval: $${capitalRecovered}`);
      } else if (uncoveredUnits > 0) {
        console.log(` - [Base] ${inv.product.name} | Stock: ${inv.stock} | Uncovered: ${uncoveredUnits} | AVISO: COSTO INVALIDO O CERO ($${cost})`);
      }
    }

    // Variant Inventories
    const variantInventories = await prisma.variantInventory.findMany({
      where: { branchId: branch.id, stock: { gt: 0 } },
      include: { variant: { select: { productId: true, name: true, product: { select: { name: true } } } } }
    });

    for (const inv of variantInventories) {
      const layers = await prisma.inventoryCostLayer.findMany({
        where: { branchId: branch.id, productId: inv.variant.productId, variantId: inv.variantId, remainingQuantity: { gt: 0 } }
      });

      const coveredUnits = layers.reduce((acc, layer) => acc + layer.remainingQuantity, 0);
      const uncoveredUnits = Math.max((inv.stock ?? 0) - coveredUnits, 0);
      const cost = Number(inv.cost);

      if (uncoveredUnits > 0 && Number.isFinite(cost) && cost > 0) {
        const capitalRecovered = uncoveredUnits * cost;
        totalUncoveredValue += capitalRecovered;
        proposedLayerCount++;
        console.log(` - [Var] ${inv.variant.product.name} (${inv.variant.name}) | Stock: ${inv.stock} | Uncovered: ${uncoveredUnits} | Cost: $${cost} | Capital Reval: $${capitalRecovered}`);
      } else if (uncoveredUnits > 0) {
         console.log(` - [Var] ${inv.variant.product.name} (${inv.variant.name}) | Stock: ${inv.stock} | Uncovered: ${uncoveredUnits} | AVISO: COSTO INVALIDO O CERO ($${cost})`);
      }
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Capas a crear: ${proposedLayerCount}`);
  console.log(`Capital Valuado a Recuperar: $${totalUncoveredValue.toFixed(2)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
