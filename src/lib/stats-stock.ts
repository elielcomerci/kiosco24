import { prisma } from "@/lib/prisma";

type StockStats = {
  meta: {
    scope: "branch" | "kiosco";
    scopeLabel: string;
    branchCount: number;
  };
  resumen: {
    valorizacionTotal: number;
    productosConStock: number;
    productosSinStock: number;
    productosStockBajo: number;
    productosVencidos: number;
    productosPorVencer: number;
    reservasPendientes: number;
    unidadesPendientesValorizar: number;
    capasAbiertas: number;
  };
  alertas: Array<{
    tipo: "stock_bajo" | "sin_stock" | "vencido" | "por_vencer" | "reserva_pendiente";
    productoId: string;
    productoNombre: string;
    branchId: string;
    branchName: string;
    cantidad: number;
    detalle: string;
  }>;
  reposicionesRecientes: Array<{
    id: string;
    type: string;
    fecha: string;
    empleadoName: string | null;
    proveedorName: string | null;
    itemsCantidad: number;
    costoTotal: number;
  }>;
  productosTop: Array<{
    key: string;
    displayName: string;
    image: string | null;
    stock: number;
    minStock: number | null;
    valorizacion: number;
    precioVenta: number | null;
    margen: number | null;
  }>;
};

type InventoryRecordRow = {
  productId: string;
  branchId: string;
  stock: number | null;
  minStock: number | null;
  price: number | null;
  product: { name: string; image: string | null };
  branch: { name: string };
};

type StockLotRow = {
  productId: string;
  branchId: string;
  quantity: number;
  expiresOn: Date | null;
  product: { name: string };
  variant: { name: string } | null;
  branch: { name: string };
};

type NegativeReservationRow = {
  productId: string;
  branchId: string;
  quantityPending: number;
  originalQuantity: number;
  product: { name: string };
  variant: { name: string } | null;
  branch: { name: string };
};

type RestockEventRow = {
  id: string;
  type: string;
  createdAt: Date;
  supplierName: string | null;
  employee: { name: string } | null;
  items: Array<{
    quantity: number;
    unitCost: number | null;
  }>;
};

function roundMoney(value: number): number {
  return Math.round(value);
}

export const getStockStats = async (
    branchId: string,
    targetBranchIdsKey: string,
    scope: "branch" | "kiosco",
    categoria: string,
    alerta: string,
    branchCountInput: number
  ): Promise<StockStats> => {
    const targetBranchIds = targetBranchIdsKey.split("|").filter(Boolean);
    const branchCount = branchCountInput || targetBranchIds.length;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [inventoryRecords, stockLots, negativeReservations, reposicionesRecientes, costLayers] =
      await Promise.all([
        prisma.inventoryRecord.findMany({
          where: {
            branchId: { in: targetBranchIds },
            ...(categoria ? { product: { categoryId: categoria } } : {}),
          },
          select: {
            productId: true,
            branchId: true,
            stock: true,
            minStock: true,
            price: true,
            product: {
              select: {
                name: true,
                image: true,
              },
            },
            branch: { select: { name: true } },
          },
        }),
        prisma.stockLot.findMany({
          where: {
            branchId: { in: targetBranchIds },
            expiresOn: { lte: thirtyDaysFromNow },
          },
          select: {
            productId: true,
            branchId: true,
            quantity: true,
            expiresOn: true,
            product: { select: { name: true } },
            variant: { select: { name: true } },
            branch: { select: { name: true } },
          },
        }),
        prisma.negativeStockReservation.findMany({
          where: {
            branchId: { in: targetBranchIds },
            quantityPending: { gt: 0 },
          },
          select: {
            productId: true,
            branchId: true,
            quantityPending: true,
            originalQuantity: true,
            product: { select: { name: true } },
            variant: { select: { name: true } },
            branch: { select: { name: true } },
          },
        }),
        prisma.restockEvent.findMany({
          where: { branchId: { in: targetBranchIds } },
          select: {
            id: true,
            type: true,
            createdAt: true,
            supplierName: true,
            employee: { select: { name: true } },
            items: {
              select: {
                quantity: true,
                unitCost: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.inventoryCostLayer.findMany({
          where: { branchId: { in: targetBranchIds } },
          select: {
            productId: true,
            branchId: true,
            remainingQuantity: true,
            unitCost: true,
          },
        }),
      ]);

    const costLayerKeys = new Set(
      costLayers.map((layer) => `${layer.productId}:${layer.branchId}`)
    );

    let productosConStock = 0;
    let productosSinStock = 0;
    let productosStockBajo = 0;
    let unidadesPendientesValorizar = 0;
    const productoMap = new Map<
      string,
      {
        key: string;
        displayName: string;
        image: string | null;
        stock: number;
        minStock: number | null;
        valorizacion: number;
        precioVenta: number | null;
        margen: number | null;
      }
    >();

    const negativeByProductBranch = new Map<string, number>();
    for (const res of negativeReservations as NegativeReservationRow[]) {
      const key = `${res.productId}-${res.branchId}`;
      negativeByProductBranch.set(key, (negativeByProductBranch.get(key) ?? 0) + res.quantityPending);
    }

    for (const inv of inventoryRecords as InventoryRecordRow[]) {
      const key = `${inv.productId}-${inv.branchId}`;
      const stock = (inv.stock ?? 0) - (negativeByProductBranch.get(key) ?? 0);
      const minStock = inv.minStock ?? 0;

      if (stock > 0) {
        productosConStock++;
      } else {
        productosSinStock++;
      }

      if (minStock > 0 && stock < minStock) {
        productosStockBajo++;
      }

      if (stock > 0 && !costLayerKeys.has(`${inv.productId}:${inv.branchId}`)) {
        unidadesPendientesValorizar += stock;
      }

      const current = productoMap.get(key);
      if (current) {
        current.stock += stock;
        continue;
      }

      productoMap.set(key, {
        key,
        displayName: inv.product.name,
        image: inv.product.image,
        stock,
        minStock: inv.minStock ?? null,
        valorizacion: 0,
        precioVenta: inv.price ?? null,
        margen: null,
      });
    }

    for (const layer of costLayers) {
      const key = `${layer.productId}-${layer.branchId}`;
      const current = productoMap.get(key);
      if (current) {
        current.valorizacion += layer.remainingQuantity * layer.unitCost;
      }
    }

    const productosTop = [...productoMap.values()]
      .filter((p) => p.stock > 0)
      .sort((a, b) => b.valorizacion - a.valorizacion)
      .slice(0, 20);

    let productosVencidos = 0;
    let productosPorVencer = 0;
    const alertas: StockStats["alertas"] = [];

    for (const inv of inventoryRecords as InventoryRecordRow[]) {
      const key = `${inv.productId}-${inv.branchId}`;
      const stock = (inv.stock ?? 0) - (negativeByProductBranch.get(key) ?? 0);
      const minStock = inv.minStock ?? 0;

      if (stock <= 0) {
        alertas.push({
          tipo: "sin_stock",
          productoId: inv.productId,
          productoNombre: inv.product.name,
          branchId: inv.branchId,
          branchName: inv.branch.name,
          cantidad: stock,
          detalle: "Sin stock físico",
        });
      } else if (minStock > 0 && stock < minStock) {
        alertas.push({
          tipo: "stock_bajo",
          productoId: inv.productId,
          productoNombre: inv.product.name,
          branchId: inv.branchId,
          branchName: inv.branch.name,
          cantidad: stock,
          detalle: `Mínimo: ${minStock}`,
        });
      }
    }

    for (const lot of stockLots as StockLotRow[]) {
      if (!lot.expiresOn) continue; // Skip lots without expiry date
      
      const daysUntilExpiration = Math.floor(
        (lot.expiresOn.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const productName = lot.variant?.name ?? lot.product.name;

      if (daysUntilExpiration < 0) {
        productosVencidos++;
        alertas.push({
          tipo: "vencido",
          productoId: lot.productId,
          productoNombre: productName,
          branchId: lot.branchId,
          branchName: lot.branch.name,
          cantidad: lot.quantity,
          detalle: `Venció hace ${Math.abs(daysUntilExpiration)} días`,
        });
      } else {
        productosPorVencer++;
        alertas.push({
          tipo: "por_vencer",
          productoId: lot.productId,
          productoNombre: productName,
          branchId: lot.branchId,
          branchName: lot.branch.name,
          cantidad: lot.quantity,
          detalle: `Vence en ${daysUntilExpiration} días`,
        });
      }
    }

    let reservasPendientes = 0;
    for (const res of negativeReservations as NegativeReservationRow[]) {
      reservasPendientes++;
      const productName = res.variant?.name ?? res.product.name;
      alertas.push({
        tipo: "reserva_pendiente",
        productoId: res.productId,
        productoNombre: productName,
        branchId: res.branchId,
        branchName: res.branch.name,
        cantidad: res.quantityPending,
        detalle: `${res.originalQuantity} u. vendidas en negativo`,
      });
    }

    const alertasFiltradas = alerta
      ? alertas.filter((item) => item.tipo === alerta)
      : alertas;

    const valorizacionTotal = costLayers.reduce(
      (sum, layer) => sum + layer.remainingQuantity * layer.unitCost,
      0
    );

    const reposiciones = (reposicionesRecientes as RestockEventRow[]).map((r) => ({
      id: r.id,
      type: r.type,
      fecha: r.createdAt.toISOString(),
      empleadoName: r.employee?.name ?? null,
      proveedorName: r.supplierName,
      itemsCantidad: r.items.length,
      costoTotal: r.items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0),
    }));

    return {
      meta: {
        scope,
        scopeLabel: scope === "kiosco" ? "Todo el kiosco" : "Esta sucursal",
        branchCount,
      },
      resumen: {
        valorizacionTotal: roundMoney(valorizacionTotal),
        productosConStock,
        productosSinStock,
        productosStockBajo,
        productosVencidos,
        productosPorVencer,
        reservasPendientes,
        unidadesPendientesValorizar,
        capasAbiertas: costLayers.length,
      },
      alertas: alertasFiltradas.slice(0, 50),
      reposicionesRecientes: reposiciones,
      productosTop,
    };
};
