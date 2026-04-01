import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/stats/stock?scope=branch|kiosco&categoria=XXX&alerta=bajo|cero|vencimiento|pendiente
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.employeeRole === "MANAGER";

  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { branchId, kioscoId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "kiosco" && isOwner ? "kiosco" : "branch";
  const categoria = searchParams.get("categoria"); // optional
  const alerta = searchParams.get("alerta"); // optional - bajo | cero | vencimiento | pendiente

  // Determine target branch IDs
  let targetBranchIds: string[] = [branchId];
  let branchCount = 1;

  if (scope === "kiosco" && isOwner && kioscoId) {
    const branches = await prisma.branch.findMany({
      where: { kioscoId },
      select: { id: true, name: true },
    });
    targetBranchIds = branches.map((b) => b.id);
    branchCount = branches.length;
  }

  // Fetch inventory records
  const inventoryRecords = await prisma.inventoryRecord.findMany({
    where: {
      branchId: { in: targetBranchIds },
      ...(categoria ? { product: { categoryId: categoria } } : {}),
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      },
      branch: { select: { id: true, name: true } },
    },
  });

  // Fetch variant inventory
  const variantInventory = await prisma.variantInventory.findMany({
    where: { branchId: { in: targetBranchIds } },
    include: {
      variant: {
        select: {
          id: true,
          name: true,
          barcode: true,
          product: { select: { name: true, image: true } },
        },
      },
      branch: { select: { id: true, name: true } },
    },
  });

  // Fetch stock lots (for expiration alerts)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const stockLots = await prisma.stockLot.findMany({
    where: {
      branchId: { in: targetBranchIds },
      expiresOn: { lte: thirtyDaysFromNow },
    },
    include: {
      product: { select: { name: true } },
      variant: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  // Fetch negative stock reservations
  const negativeReservations = await prisma.negativeStockReservation.findMany({
    where: {
      branchId: { in: targetBranchIds },
      quantityPending: { gt: 0 },
    },
    include: {
      product: { select: { name: true } },
      variant: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  // Fetch recent restock events
  const reposicionesRecientes = await prisma.restockEvent.findMany({
    where: { branchId: { in: targetBranchIds } },
    include: {
      employee: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true } },
          variant: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Fetch inventory cost layers (for valuation)
  const costLayers = await prisma.inventoryCostLayer.findMany({
    where: { branchId: { in: targetBranchIds } },
    include: {
      product: { select: { name: true } },
      variant: { select: { name: true } },
    },
  });

  // Aggregate alerts
  const alertas: Array<{
    tipo: "stock_bajo" | "sin_stock" | "vencido" | "por_vencer" | "reserva_pendiente";
    productoId: string;
    productoNombre: string;
    branchId: string;
    branchName: string;
    cantidad: number;
    detalle: string;
  }> = [];

  // Stock alerts from inventory records
  for (const inv of inventoryRecords) {
    const stock = inv.stock ?? 0;
    const minStock = inv.minStock ?? 0;

    if (stock === 0) {
      alertas.push({
        tipo: "sin_stock",
        productoId: inv.product.id,
        productoNombre: inv.product.name,
        branchId: inv.branch.id,
        branchName: inv.branch.name,
        cantidad: stock,
        detalle: "Sin stock físico",
      });
    } else if (minStock > 0 && stock < minStock) {
      alertas.push({
        tipo: "stock_bajo",
        productoId: inv.product.id,
        productoNombre: inv.product.name,
        branchId: inv.branch.id,
        branchName: inv.branch.name,
        cantidad: stock,
        detalle: `Mínimo: ${minStock}`,
      });
    }
  }

  // Expiration alerts from stock lots
  for (const lot of stockLots) {
    const daysUntilExpiration = Math.floor((lot.expiresOn.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const productName = lot.variant?.name ?? lot.product.name;

    if (daysUntilExpiration < 0) {
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

  // Negative stock reservations
  for (const res of negativeReservations) {
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

  // Filter alerts by type if requested
  const alertasFiltradas = alerta ? alertas.filter((a) => a.tipo === alerta) : alertas;

  // Summary calculations
  const productosConStock = inventoryRecords.filter((i) => (i.stock ?? 0) > 0).length;
  const productosSinStock = inventoryRecords.filter((i) => (i.stock ?? 0) === 0).length;
  const productosStockBajo = inventoryRecords.filter((i) => (i.minStock ?? 0) > 0 && (i.stock ?? 0) < (i.minStock ?? 0)).length;
  const productosVencidos = stockLots.filter((lot) => lot.expiresOn < now).length;
  const productosPorVencer = stockLots.filter((lot) => lot.expiresOn >= now && lot.expiresOn <= thirtyDaysFromNow).length;
  const reservasPendientes = negativeReservations.filter((r) => r.quantityPending > 0).length;

  // Valuation (sum of remaining cost layers)
  const valorizacionTotal = costLayers.reduce((sum, layer) => sum + (layer.remainingQuantity * layer.unitCost), 0);
  const capasAbiertas = costLayers.length;

  // Units pending to value (products with stock but no cost layers)
  // This is a simplified calculation
  const unidadesPendientesValorizar = inventoryRecords
    .filter((i) => (i.stock ?? 0) > 0)
    .filter((i) => !costLayers.some((l) => l.productId === i.productId && l.branchId === i.branchId))
    .reduce((sum, i) => sum + (i.stock ?? 0), 0);

  // Products top (by stock value)
  const productoMap: Record<string, {
    key: string;
    displayName: string;
    image: string | null;
    stock: number;
    minStock: number | null;
    valorizacion: number;
    precioVenta: number | null;
    margen: number | null;
  }> = {};

  for (const inv of inventoryRecords) {
    const key = `${inv.productId}-${inv.branchId}`;
    if (!productoMap[key]) {
      productoMap[key] = {
        key,
        displayName: inv.product.name,
        image: inv.product.image,
        stock: inv.stock ?? 0,
        minStock: inv.minStock ?? null,
        valorizacion: 0,
        precioVenta: inv.price ?? null,
        margen: null,
      };
    }
    productoMap[key].stock += inv.stock ?? 0;
  }

  // Add valuation from cost layers
  for (const layer of costLayers) {
    const key = `${layer.productId}-${layer.branchId}`;
    if (productoMap[key]) {
      productoMap[key].valorizacion += layer.remainingQuantity * layer.unitCost;
    }
  }

  const productosTop = Object.values(productoMap)
    .filter((p) => p.stock > 0)
    .sort((a, b) => b.valorizacion - a.valorizacion)
    .slice(0, 20);

  // Format restock events
  const reposiciones = reposicionesRecientes.map((r) => ({
    id: r.id,
    type: r.type,
    fecha: r.createdAt.toISOString(),
    empleadoName: r.employee?.name ?? null,
    proveedorName: r.supplierName,
    itemsCantidad: r.items.length,
    costoTotal: r.items.reduce((sum, item) => sum + ((item.unitCost ?? 0) * item.quantity), 0),
  }));

  return NextResponse.json({
    meta: {
      scope: scope as "branch" | "kiosco",
      scopeLabel: scope === "kiosco" ? "Todo el kiosco" : "Esta sucursal",
      branchCount,
    },
    resumen: {
      valorizacionTotal: Math.round(valorizacionTotal),
      productosConStock,
      productosSinStock,
      productosStockBajo,
      productosVencidos,
      productosPorVencer,
      reservasPendientes,
      unidadesPendientesValorizar,
      capasAbiertas,
    },
    alertas: alertasFiltradas.slice(0, 50), // Limit to 50 alerts
    reposicionesRecientes: reposiciones,
    productosTop,
  });
}

// Helper to get branch context (similar to getBranchId but returns both)
async function getBranchContext(req: Request, userId: string) {
  const branchId = req.headers.get("x-branch-id");
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { kioscoId: true },
    });
    return { branchId, kioscoId: branch?.kioscoId ?? null };
  }
  return { branchId: null, kioscoId: null };
}
