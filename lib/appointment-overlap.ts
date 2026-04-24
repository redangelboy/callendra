import { DateTime } from "luxon";
import type { PrismaClient, StaffBreak } from "@prisma/client";
import { BUSINESS_TIMEZONE, utcFromYmdAndTime } from "@/lib/business-timezone";
import { staffBreakDateFromYmd } from "@/lib/staff-break-date";
import { APPOINTMENT_BLOCKING_STATUS_FILTER } from "@/lib/appointment-blocking-status";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";

/**
 * Detecta si ya existe una cita (no cancelada) del mismo staff que se solape
 * con [start, end). Usa ventana amplia en DB y refina con duración del servicio.
 */
export async function findStaffOverlappingAppointment(
  prisma: PrismaClient,
  params: {
    staffId: string;
    start: Date;
    end: Date;
    excludeAppointmentId?: string;
  }
) {
  const { staffId, start, end, excludeAppointmentId } = params;

  const candidates = await prisma.appointment.findMany({
    where: {
      staffId,
      ...APPOINTMENT_BLOCKING_STATUS_FILTER,
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      date: {
        gte: new Date(start.getTime() - 36 * 60 * 60 * 1000),
        lte: new Date(end.getTime() + 36 * 60 * 60 * 1000),
      },
    },
    include: { service: true, extras: true },
  });

  const s0 = start.getTime();
  const e0 = end.getTime();

  for (const apt of candidates) {
    const durMin = appointmentTotalDurationMin(apt);
    const aptStart = apt.date.getTime();
    const aptEnd = aptStart + durMin * 60_000;
    if (aptStart < e0 && aptEnd > s0) {
      return apt;
    }
  }
  return null;
}

function ymdForIntervalInBusinessZone(start: Date): string {
  return DateTime.fromJSDate(start).setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
}

function breakIntervalMillis(ymd: string, startTime: string, durationMin: number): { start: number; end: number } {
  const t0 = utcFromYmdAndTime(ymd, startTime).getTime();
  const t1 = t0 + durationMin * 60_000;
  return { start: t0, end: t1 };
}

/** Bloqueo por descanso del staff en la misma sucursal y día (zona negocio). */
export async function findStaffOverlappingBreak(
  prisma: PrismaClient,
  params: {
    staffId: string;
    businessId: string;
    start: Date;
    end: Date;
  }
): Promise<StaffBreak | null> {
  const ymd = ymdForIntervalInBusinessZone(params.start);
  const dayKey = staffBreakDateFromYmd(ymd);

  const breaks = await prisma.staffBreak.findMany({
    where: {
      staffId: params.staffId,
      businessId: params.businessId,
      date: dayKey,
    },
  });

  const s0 = params.start.getTime();
  const e0 = params.end.getTime();

  for (const b of breaks) {
    const { start: bs, end: be } = breakIntervalMillis(ymd, b.startTime, b.duration);
    if (bs < e0 && be > s0) {
      return b;
    }
  }
  return null;
}

export type StaffIntervalConflict =
  | { kind: "appointment"; row: NonNullable<Awaited<ReturnType<typeof findStaffOverlappingAppointment>>> }
  | { kind: "break"; row: StaffBreak };

export async function findStaffIntervalConflict(
  prisma: PrismaClient,
  params: {
    staffId: string;
    businessId: string;
    start: Date;
    end: Date;
    excludeAppointmentId?: string;
  }
): Promise<StaffIntervalConflict | null> {
  const apt = await findStaffOverlappingAppointment(prisma, {
    staffId: params.staffId,
    start: params.start,
    end: params.end,
    excludeAppointmentId: params.excludeAppointmentId,
  });
  if (apt) return { kind: "appointment", row: apt };

  const brk = await findStaffOverlappingBreak(prisma, {
    staffId: params.staffId,
    businessId: params.businessId,
    start: params.start,
    end: params.end,
  });
  if (brk) return { kind: "break", row: brk };

  return null;
}
