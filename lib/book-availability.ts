import type { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import {
  BUSINESS_TIMEZONE,
  businessDayUtcRange,
  parseYmdToJsDayOfWeek,
  utcFromYmdAndTime,
} from "@/lib/business-timezone";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";
import { APPOINTMENT_BLOCKING_STATUS_FILTER } from "@/lib/appointment-blocking-status";

/** Minute step between offered start times. Independent of service duration (e.g. 30 min haircut can start 19:20, 19:25, …). */
export const BOOKING_SLOT_GRID_STEP_MINUTES = 5;

export async function resolveBookableService(
  prisma: PrismaClient,
  params: { businessId: string; serviceId: string }
) {
  const svcLoc = await prisma.serviceLocation.findFirst({
    where: { businessId: params.businessId, serviceId: params.serviceId, active: true },
    include: { service: true },
  });
  if (!svcLoc?.service?.active) return null;
  return svcLoc.service;
}

export async function getStaffServiceSlotsForDay(
  prisma: PrismaClient,
  params: {
    businessId: string;
    staffId: string;
    date: string;
    serviceDurationMin: number;
    excludePastForToday?: boolean;
    minLeadMinutes?: number;
  }
): Promise<string[]> {
  const dayOfWeek = parseYmdToJsDayOfWeek(params.date);
  const schedule = await prisma.schedule.findFirst({
    where: {
      businessId: params.businessId,
      staffId: params.staffId,
      dayOfWeek,
      active: true,
    },
  });
  if (!schedule) return [];

  const { start: dayStart, end: dayEnd } = businessDayUtcRange(params.date);
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      staffId: params.staffId,
      date: { gte: dayStart, lte: dayEnd },
      ...APPOINTMENT_BLOCKING_STATUS_FILTER,
    },
    include: { service: true, extras: true },
  });

  const dayKey = new Date(`${params.date}T00:00:00.000Z`);
  const staffBreaks = await prisma.staffBreak.findMany({
    where: {
      staffId: params.staffId,
      businessId: params.businessId,
      date: dayKey,
    },
  });

  const duration = Number.isFinite(params.serviceDurationMin) && params.serviceDurationMin > 0
    ? Math.floor(params.serviceDurationMin)
    : 30;

  const [startH, startM] = schedule.startTime.split(":").map(Number);
  const [endH, endM] = schedule.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return [];
  }

  const slots: string[] = [];
  const nowInBusinessTz = DateTime.now().setZone(BUSINESS_TIMEZONE);
  const nowMillis = nowInBusinessTz.toMillis();
  const todayYmd = nowInBusinessTz.toFormat("yyyy-LL-dd");
  const enforceFutureOnly = params.excludePastForToday === true && params.date === todayYmd;
  const leadMinutes = Number.isFinite(params.minLeadMinutes) ? Math.max(0, Math.floor(params.minLeadMinutes!)) : 0;
  const minStartMillis = leadMinutes > 0 ? nowInBusinessTz.plus({ minutes: leadMinutes }).toMillis() : null;
  const gridStep = BOOKING_SLOT_GRID_STEP_MINUTES;
  for (let m = startMinutes; m + duration <= endMinutes; m += gridStep) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
    const slotDate = utcFromYmdAndTime(params.date, timeStr);
    const slotEnd = new Date(slotDate.getTime() + duration * 60_000);
    if (enforceFutureOnly && slotDate.getTime() <= nowMillis) continue;
    if (minStartMillis != null && slotDate.getTime() < minStartMillis) continue;
    const s0 = slotDate.getTime();
    const e0 = slotEnd.getTime();

    const aptHit = existingAppointments.some((apt) => {
      const aptDur = appointmentTotalDurationMin(apt);
      const aptStart = apt.date.getTime();
      const aptEnd = aptStart + aptDur * 60_000;
      return aptStart < e0 && aptEnd > s0;
    });
    if (aptHit) continue;

    const breakHit = staffBreaks.some((br) => {
      const bStart = utcFromYmdAndTime(params.date, br.startTime).getTime();
      const bEnd = bStart + br.duration * 60_000;
      return bStart < e0 && bEnd > s0;
    });
    if (breakHit) continue;

    slots.push(timeStr);
  }

  return slots;
}
