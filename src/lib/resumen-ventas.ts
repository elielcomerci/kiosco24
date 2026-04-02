import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSaleItemSubtotal } from "@/lib/sale-item";
import { artDayRange } from "@/lib/utils";

type ResumenVentaItem = {
  name: string;
  quantity: number;
  price: number;
  soldByWeight?: boolean;
};

type ResumenVenta = {
  id: string;
  total: number;
  paymentMethod: string;
  voided: boolean;
  createdAt: string;
  employeeName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
};

type SaleRow = {
  id: string;
  total: number;
  paymentMethod: string;
  voided: boolean;
  createdAt: Date;
  items: ResumenVentaItem[];
  shift: { employeeName: string } | null;
};

const getResumenVentasCached = unstable_cache(
  async (branchId: string, isoDate: string): Promise<ResumenVenta[]> => {
    const { start, end } = artDayRange(isoDate);

    const sales = await prisma.sale.findMany({
      where: {
        branchId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
        voided: true,
        createdAt: true,
        items: {
          select: {
            name: true,
            quantity: true,
            price: true,
            soldByWeight: true,
          },
        },
        shift: { select: { employeeName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return (sales as SaleRow[]).map((sale) => ({
      id: sale.id,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      voided: sale.voided,
      createdAt: sale.createdAt.toISOString(),
      employeeName: sale.shift?.employeeName || "Dueño",
      items: sale.items.map((item) => ({
        name: item.name || "Producto manual",
        quantity: item.quantity,
        price: item.price,
        total: getSaleItemSubtotal(item),
      })),
    }));
  },
  ["resumen-ventas"],
  { revalidate: 30 }
);

export { getResumenVentasCached as getResumenVentas };
