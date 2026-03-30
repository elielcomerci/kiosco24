import { NextResponse } from "next/server";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchId } from "@/lib/branch";
import { prisma } from "@/lib/prisma";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

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
    const customerId =
      typeof body?.customerId === "string" && body.customerId.trim() ? body.customerId.trim() : null;
    const amount = roundMoney(Number(body?.amount));

    if (!customerId) {
      return NextResponse.json({ error: "Falta el cliente a cobrar." }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "El monto a cobrar no es valido." }, { status: 400 });
    }

    const customer = await prisma.creditCustomer.findFirst({
      where: {
        id: customerId,
        branchId,
      },
      select: {
        id: true,
        name: true,
        balance: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "El cliente no pertenece a esta sucursal." }, { status: 404 });
    }

    if (customer.balance <= 0) {
      return NextResponse.json({ error: "Este cliente ya no tiene saldo pendiente." }, { status: 409 });
    }

    if (amount > roundMoney(customer.balance)) {
      return NextResponse.json(
        { error: `El cobro supera el saldo pendiente de ${customer.name}.` },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.creditCustomer.update({
        where: { id: customer.id },
        data: {
          balance: { decrement: amount },
        },
        select: {
          id: true,
          name: true,
          balance: true,
        },
      });

      const payment = await tx.creditPayment.create({
        data: {
          customerId: customer.id,
          amount,
        },
        select: {
          id: true,
          amount: true,
          createdAt: true,
        },
      });

      return { customer: updatedCustomer, payment };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Fiados] Error cobrando fiado", error);
    return NextResponse.json({ error: "No se pudo registrar el cobro." }, { status: 500 });
  }
}
