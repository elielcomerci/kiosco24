import { ShiftReminderDelivery } from "@prisma/client";
import { NextResponse } from "next/server";

import { guardOperationalAccess } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { prisma } from "@/lib/prisma";
import { canCreateShiftReminder, getActiveShift } from "@/lib/shift-access";

function pickReminder(
  reminders: Array<{
    id: string;
    message: string;
    delivery: ShiftReminderDelivery;
    scheduledFor: Date | null;
    createdDuringShiftId: string | null;
    createdByLabel: string;
    createdAt: Date;
  }>,
  activeShiftId: string,
) {
  const dueScheduled = reminders
    .filter((reminder) => reminder.delivery === "SCHEDULED" && reminder.scheduledFor && reminder.scheduledFor <= new Date())
    .sort((left, right) => left.scheduledFor!.getTime() - right.scheduledFor!.getTime());

  if (dueScheduled.length > 0) {
    return dueScheduled[0] ?? null;
  }

  return (
    reminders
      .filter(
        (reminder) =>
          reminder.delivery === "NEXT_SHIFT" &&
          (!reminder.createdDuringShiftId || reminder.createdDuringShiftId !== activeShiftId),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0] ?? null
  );
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ reminder: null }, { status: 401 });
  }

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ reminder: null });
  }

  const activeShift = await getActiveShift(branchId);
  if (!activeShift) {
    return NextResponse.json({ reminder: null });
  }

  const reminders = await prisma.shiftReminder.findMany({
    where: {
      branchId,
      shownAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      message: true,
      delivery: true,
      scheduledFor: true,
      createdDuringShiftId: true,
      createdByLabel: true,
      createdAt: true,
    },
  });

  const reminder = pickReminder(reminders, activeShift.id);

  return NextResponse.json({
    reminder: reminder
      ? {
          id: reminder.id,
          message: reminder.message,
          delivery: reminder.delivery,
          scheduledFor: reminder.scheduledFor,
          createdByLabel: reminder.createdByLabel,
          createdAt: reminder.createdAt,
        }
      : null,
  });
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

  const { branchId } = await getBranchContext(req, session.user.id);
  if (!branchId) {
    return NextResponse.json({ error: "No branch" }, { status: 404 });
  }

  const activeShift = await getActiveShift(branchId);
  if (!canCreateShiftReminder(session.user, activeShift)) {
    return NextResponse.json(
      { error: "No tenes permiso para dejar recordatorios en esta sucursal." },
      { status: 403 },
    );
  }

  const body = await req.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const delivery =
    body?.delivery === "SCHEDULED" ? ShiftReminderDelivery.SCHEDULED : ShiftReminderDelivery.NEXT_SHIFT;
  const scheduledForRaw = typeof body?.scheduledFor === "string" ? body.scheduledFor.trim() : "";
  const scheduledFor =
    delivery === ShiftReminderDelivery.SCHEDULED && scheduledForRaw ? new Date(scheduledForRaw) : null;

  if (!message) {
    return NextResponse.json({ error: "Escribe un mensaje para guardar el recordatorio." }, { status: 400 });
  }

  if (message.length > 500) {
    return NextResponse.json({ error: "El recordatorio puede tener hasta 500 caracteres." }, { status: 400 });
  }

  if (delivery === ShiftReminderDelivery.SCHEDULED) {
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      return NextResponse.json({ error: "Elegi una fecha y hora validas." }, { status: 400 });
    }

    if (scheduledFor.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "La fecha del recordatorio ya paso." }, { status: 400 });
    }
  }

  const reminder = await prisma.shiftReminder.create({
    data: {
      branchId,
      message,
      delivery,
      scheduledFor,
      createdDuringShiftId: activeShift?.id ?? null,
      shownToShiftId: null,
      createdByEmployeeId: session.user.employeeId ?? null,
      createdByLabel: session.user.name || (session.user.role === "EMPLOYEE" ? "Empleado" : "Dueño"),
    },
    select: {
      id: true,
      message: true,
      delivery: true,
      scheduledFor: true,
      createdByLabel: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ success: true, reminder });
}
