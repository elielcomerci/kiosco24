import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { todayRange } from "@/lib/utils";
import { getBranchId } from "@/lib/branch";

// GET /api/resumen/ventas
// Retorna las ventas detalladas del día
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) return NextResponse.json({ error: "No branch" }, { status: 404 });

  const { start, end } = todayRange();

  const sales = await prisma.sale.findMany({
    where: { branchId, createdAt: { gte: start, lte: end } },
    include: {
      items: true,
      shift: { select: { employeeName: true } }
    },
    orderBy: { createdAt: "desc" },
  });

  const formattedSales = sales.map((s: any) => ({
    id: s.id,
    total: s.total,
    paymentMethod: s.paymentMethod,
    voided: s.voided,
    createdAt: s.createdAt,
    employeeName: s.shift?.employeeName || "Dueño",
    items: s.items.map((i: any) => ({
      name: i.name || "Producto manual",
      quantity: i.quantity,
      price: i.price,
      total: i.price * i.quantity
    }))
  }));

  return NextResponse.json(formattedSales);
}
