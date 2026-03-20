import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { PaymentMethod, Prisma, prisma } from "@/lib/prisma";
import { todayRange } from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { canOperateShift, createShiftForbiddenResponse, getActiveShift } from "@/lib/shift-access";

type RawSaleItem = {
  productId?: string | null;
  variantId?: string | null;
  name?: string;
  price?: number;
  quantity?: number;
  cost?: number | null;
};

class RouteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeClientSaleId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  if (
    value === "CASH" ||
    value === "MERCADOPAGO" ||
    value === "TRANSFER" ||
    value === "DEBIT" ||
    value === "CREDIT_CARD" ||
    value === "CREDIT"
  ) {
    return value;
  }

  throw new RouteError("Medio de pago invalido.");
}

function normalizeReceivedAmount(paymentMethod: PaymentMethod, value: unknown) {
  if (paymentMethod !== "CASH") {
    return null;
  }

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RouteError("El monto recibido no es valido.");
  }

  return roundMoney(amount);
}

async function buildSaleSnapshot(
  tx: Prisma.TransactionClient | typeof prisma,
  branchId: string,
  rawItems: RawSaleItem[],
) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new RouteError("El ticket esta vacio.");
  }

  const saleItems: Array<{
    productId: string | null;
    variantId: string | null;
    name: string;
    price: number;
    quantity: number;
    cost: number | null;
  }> = [];

  const inventoryAdjustments = new Map<
    string,
    {
      type: "product" | "variant";
      id: string;
      requestedQuantity: number;
      unlimited: boolean;
    }
  >();

  for (const rawItem of rawItems) {
    const quantity = Math.trunc(Number(rawItem?.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new RouteError("Hay un item con cantidad invalida.");
    }

    if (typeof rawItem?.variantId === "string" && rawItem.variantId) {
      const variantInventory = await tx.variantInventory.findUnique({
        where: {
          variantId_branchId: {
            variantId: rawItem.variantId,
            branchId,
          },
        },
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              productId: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!variantInventory) {
        throw new RouteError("Una variante del ticket ya no existe en esta sucursal.");
      }

      const productInventory = await tx.inventoryRecord.findUnique({
        where: {
          productId_branchId: {
            productId: variantInventory.variant.productId,
            branchId,
          },
        },
      });

      if (!productInventory) {
        throw new RouteError("El producto de una variante del ticket ya no existe en esta sucursal.");
      }

      if (!Number.isFinite(productInventory.price) || productInventory.price <= 0) {
        throw new RouteError(`${variantInventory.variant.product.name} todavia no tiene precio de venta.`);
      }

      saleItems.push({
        productId: variantInventory.variant.productId,
        variantId: variantInventory.variant.id,
        name: `${variantInventory.variant.product.name} - ${variantInventory.variant.name}`,
        price: roundMoney(productInventory.price),
        quantity,
        cost: typeof productInventory.cost === "number" ? roundMoney(productInventory.cost) : null,
      });

      const key = `variant:${variantInventory.id}`;
      const previous = inventoryAdjustments.get(key);
      inventoryAdjustments.set(key, {
        type: "variant",
        id: variantInventory.id,
        requestedQuantity: (previous?.requestedQuantity ?? 0) + quantity,
        unlimited: typeof variantInventory.stock !== "number",
      });

      continue;
    }

    if (typeof rawItem?.productId === "string" && rawItem.productId) {
      const inventory = await tx.inventoryRecord.findUnique({
        where: {
          productId_branchId: {
            productId: rawItem.productId,
            branchId,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              variants: {
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });

      if (!inventory) {
        throw new RouteError("Uno de los productos del ticket ya no existe en esta sucursal.");
      }

      if (inventory.product.variants.length > 0) {
        throw new RouteError(`Selecciona una variante para ${inventory.product.name}.`);
      }

      if (!Number.isFinite(inventory.price) || inventory.price <= 0) {
        throw new RouteError(`${inventory.product.name} todavia no tiene precio de venta.`);
      }

      saleItems.push({
        productId: inventory.product.id,
        variantId: null,
        name: inventory.product.name,
        price: roundMoney(inventory.price),
        quantity,
        cost: typeof inventory.cost === "number" ? roundMoney(inventory.cost) : null,
      });

      const key = `product:${inventory.id}`;
      const previous = inventoryAdjustments.get(key);
      inventoryAdjustments.set(key, {
        type: "product",
        id: inventory.id,
        requestedQuantity: (previous?.requestedQuantity ?? 0) + quantity,
        unlimited: typeof inventory.stock !== "number",
      });

      continue;
    }

    const name = typeof rawItem?.name === "string" && rawItem.name.trim() ? rawItem.name.trim() : "Otro";
    const price = Number(rawItem?.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new RouteError(`El item "${name}" tiene un precio invalido.`);
    }

    const rawCost = rawItem?.cost;
    const normalizedCost =
      typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0 ? roundMoney(rawCost) : null;

    saleItems.push({
      productId: null,
      variantId: null,
      name,
      price: roundMoney(price),
      quantity,
      cost: normalizedCost,
    });
  }

  for (const adjustment of inventoryAdjustments.values()) {
    if (adjustment.type === "variant") {
      const inventory = await tx.variantInventory.findUnique({
        where: { id: adjustment.id },
        select: { stock: true, variant: { select: { name: true, product: { select: { name: true } } } } },
      });

      if (!inventory) {
        throw new RouteError("No se pudo validar el stock de una variante.");
      }

      if (typeof inventory.stock === "number" && adjustment.requestedQuantity > inventory.stock) {
        throw new RouteError(
          `No hay stock suficiente para ${inventory.variant.product.name} - ${inventory.variant.name}.`,
          409,
        );
      }
    } else {
      const inventory = await tx.inventoryRecord.findUnique({
        where: { id: adjustment.id },
        select: { stock: true, product: { select: { name: true } } },
      });

      if (!inventory) {
        throw new RouteError("No se pudo validar el stock de un producto.");
      }

      if (typeof inventory.stock === "number" && adjustment.requestedQuantity > inventory.stock) {
        throw new RouteError(`No hay stock suficiente para ${inventory.product.name}.`, 409);
      }
    }
  }

  const total = roundMoney(
    saleItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  return {
    saleItems,
    total,
    inventoryAdjustments: Array.from(inventoryAdjustments.values()),
  };
}

// GET /api/ventas - list today's sales
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const { start, end } = todayRange();
  const sales = await prisma.sale.findMany({
    where: { branchId, createdAt: { gte: start, lte: end }, voided: false },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sales);
}

// POST /api/ventas - create a sale
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) {
    return accessResponse;
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const paymentMethod = normalizePaymentMethod(body?.paymentMethod);
    const clientSaleId = normalizeClientSaleId(body?.clientSaleId);
    const receivedAmount = normalizeReceivedAmount(paymentMethod, body?.receivedAmount);
    const requestedCreditCustomerId =
      typeof body?.creditCustomerId === "string" && body.creditCustomerId ? body.creditCustomerId : null;

    const activeShift = await getActiveShift(branchId);
    if (!activeShift) {
      return NextResponse.json({ error: "No hay un turno abierto en esta sucursal." }, { status: 409 });
    }

    if (!canOperateShift(session.user, activeShift)) {
      return createShiftForbiddenResponse(activeShift);
    }

    const createdByEmployeeId =
      session.user.role === UserRole.EMPLOYEE ? session.user.employeeId ?? null : null;

    const sale = await prisma.$transaction(async (tx) => {
      if (clientSaleId) {
        const existingSale = await tx.sale.findFirst({
          where: {
            branchId,
            clientSaleId,
          },
          include: { items: true },
        });

        if (existingSale) {
          return existingSale;
        }
      }

      const { saleItems, total, inventoryAdjustments } = await buildSaleSnapshot(tx, branchId, items);

      if (receivedAmount !== null && receivedAmount < total) {
        throw new RouteError("El efectivo recibido no alcanza para cubrir el total.");
      }

      let creditCustomerId: string | null = null;
      if (paymentMethod === "CREDIT") {
        if (!requestedCreditCustomerId) {
          throw new RouteError("Selecciona un cliente para registrar el fiado.");
        }

        const customer = await tx.creditCustomer.findFirst({
          where: {
            id: requestedCreditCustomerId,
            branchId,
          },
          select: { id: true },
        });

        if (!customer) {
          throw new RouteError("El cliente de fiado no pertenece a esta sucursal.");
        }

        creditCustomerId = customer.id;
      }

      for (const adjustment of inventoryAdjustments) {
        if (adjustment.unlimited) {
          continue;
        }

        if (adjustment.type === "variant") {
          const updated = await tx.variantInventory.updateMany({
            where: {
              id: adjustment.id,
              stock: { gte: adjustment.requestedQuantity },
            },
            data: {
              stock: { decrement: adjustment.requestedQuantity },
            },
          });

          if (updated.count !== 1) {
            throw new RouteError("El stock de una variante cambio mientras registrabas la venta.", 409);
          }
        } else {
          const updated = await tx.inventoryRecord.updateMany({
            where: {
              id: adjustment.id,
              stock: { gte: adjustment.requestedQuantity },
            },
            data: {
              stock: { decrement: adjustment.requestedQuantity },
            },
          });

          if (updated.count !== 1) {
            throw new RouteError("El stock de un producto cambio mientras registrabas la venta.", 409);
          }
        }
      }

      const createdSale = await tx.sale.create({
        data: {
          branchId,
          clientSaleId,
          total,
          paymentMethod,
          receivedAmount,
          shiftId: activeShift.id,
          creditCustomerId,
          createdByEmployeeId,
          items: {
            create: saleItems,
          },
        },
        include: { items: true },
      });

      if (creditCustomerId) {
        await tx.creditCustomer.update({
          where: { id: creditCustomerId },
          data: { balance: { increment: total } },
        });
      }

      return createdSale;
    });

    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[Ventas] Error creando venta", error);
    return NextResponse.json({ error: "No se pudo registrar la venta." }, { status: 500 });
  }
}
