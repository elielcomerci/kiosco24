import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { exportSalesSpreadsheet, ExportSaleRow } from "@/lib/sales-export";
import { formatTicketNumberValue } from "@/lib/ticketing";

// Helper para convertir fecha a string en timezone Argentina
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  MERCADOPAGO: "MercadoPago",
  TRANSFER: "Transferencia",
  DEBIT: "Débito",
  CREDIT_CARD: "Tarjeta Créd.",
  CREDIT: "Fiado",
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResponse = await guardOperationalAccess(session.user);
  if (accessResponse) return accessResponse;

  const branchId = await getBranchId(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const types = url.searchParams.get("types")?.split(",") || [];

  const includeFacturadas = types.includes("FACTURADA");
  const includeTickets = types.includes("TICKET");
  const includeLibres = types.includes("LIBRE");

  if (!includeFacturadas && !includeTickets && !includeLibres) {
    return NextResponse.json({ error: "Se debe seleccionar al menos un tipo de comprobante." }, { status: 400 });
  }

  // Si no se asignan fechas, se toma todo el historial. Recomendamos usar un from/to por defecto en el cliente.
  let createdAtFilter: any = {};
  if (from || to) {
    if (from) createdAtFilter.gte = new Date(`${from}T00:00:00.000-03:00`);
    if (to) createdAtFilter.lte = new Date(`${to}T23:59:59.999-03:00`);
  }

  // Buscamos todas las ventas que apliquen con este rango de fecha
  // Nota: Hacemos una única query masiva y particionamos en JS, para evitar 3 queries separadas sobre potencialmente miles de registros.
  const salesQueryWhere: any = {
    branchId,
    ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
  };

  const allSales = await prisma.sale.findMany({
    where: salesQueryWhere,
    orderBy: [{ ticketIssuedAt: "desc" }, { createdAt: "desc" }],
    include: {
      createdByEmployee: { select: { name: true } },
      invoice: { select: { status: true, comprobanteTipo: true, comprobanteNro: true, puntoDeVenta: true } },
      items: { select: { name: true, quantity: true } },
    },
  });

  const facturadas: ExportSaleRow[] = [];
  const tickets: ExportSaleRow[] = [];
  const libres: ExportSaleRow[] = [];

  for (const sale of allSales) {
    // Si la venta esta anulada, podríamos omitirla o marcarla. En este caso exportaremos lo real cobrado. 
    // Optaremos por agregar el texto [ANULADA] en comprobante.
    const dateToUse = sale.ticketIssuedAt ?? sale.createdAt;
    
    // Concatenar artículos
    let itemsText = sale.items.map(i => `${i.quantity}x ${i.name}`).join(", ");
    if (itemsText.length === 0) itemsText = "Venta manual"; // Fallback por si la venta se armó sin ítems (imposible pero salvaguarda)

    const row: ExportSaleRow = {
      fecha: formatDate(dateToUse),
      hora: formatTime(dateToUse),
      comprobante: "",
      total: sale.total,
      medioDePago: PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod,
      cajero: sale.createdByEmployee?.name || "Dueño/Admin",
      articulos: itemsText,
    };

    const isFacturada = sale.invoice != null && sale.invoice.status === "ISSUED";

    if (isFacturada) {
      if (!includeFacturadas) continue;
      // Ej: FAC-C 0001-00000212
      const point = String(sale.invoice!.puntoDeVenta || 0).padStart(4, "0");
      const num = String(sale.invoice!.comprobanteNro || 0).padStart(8, "0");
      const tipoLabel = sale.invoice!.comprobanteTipo === 11 ? "C" : "";
      row.comprobante = `FAC-${tipoLabel} ${point}-${num}`;
      
      if (sale.voided) row.comprobante += " (ANULADA)";
      facturadas.push(row);
      
    } else if (sale.ticketNumber !== null) {
      if (!includeTickets) continue;
      row.comprobante = `TICKET #${formatTicketNumberValue(sale.ticketNumber)}`;
      
      if (sale.voided) row.comprobante += " (ANULADA)";
      tickets.push(row);
      
    } else {
      if (!includeLibres) continue;
      row.comprobante = "Sin Comprobante";
      
      if (sale.voided) row.comprobante += " (ANULADA)";
      libres.push(row);
    }
  }

  try {
    const buffer = await exportSalesSpreadsheet({
      facturadas,
      tickets,
      libres,
    });

    const fileStamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ventas-${fileStamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting sales:", error);
    return NextResponse.json({ error: "Fallo temporal del servicio excel." }, { status: 500 });
  }
}
