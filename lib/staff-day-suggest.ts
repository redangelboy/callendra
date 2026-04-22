import { DateTime } from "luxon";
import type { PrismaClient } from "@prisma/client";
import { BUSINESS_TIMEZONE, businessDayUtcRange, utcFromYmdAndTime } from "@/lib/business-timezone";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";

/** Next 5-minute wall-clock instant in business timezone, on or after `from`. */
export function roundUpToNextFiveMinuteUtc(from: Date): Date {
  const z0 = DateTime.fromJSDate(from, { zone: BUSINESS_TIMEZONE });
  const m0 = z0.hour * 60 + z0.minute;
  const m = m0 + (z0.second > 0 || z0.millisecond > 0 ? 1 : 0);
  const rounded = Math.ceil(m / 5) * 5;
  const out = z0.startOf("day").plus({ minutes: rounded });
  const ymd = out.toFormat("yyyy-LL-dd");
  const hhmm = out.toFormat("HH:mm");
  return utcFromYmdAndTime(ymd, hhmm);
}

/**
 * Earliest start (5-min steps) on the same calendar day as `from` where [candidate, candidate+duration)
 * does not conflict for this staff at `businessId`.
 */
export async function suggestEarlierStartForAppointment(
  prisma: PrismaClient,
  params: {
    staffId: string;
    businessId: string;
    appointmentId: string;
    from: Date;
  }
): Promise<Date | null> {
  const apt = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { service: true },
  });
  if (!apt) return null;
  const durMin = apt.service?.duration ?? 30;

  let candidate = roundUpToNextFiveMinuteUtc(params.from);
  const ymd = DateTime.fromJSDate(candidate, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-LL-dd");
  const { end: dayEnd } = businessDayUtcRange(ymd);

  for (let i = 0; i < 96; i++) {
    if (candidate.getTime() >= dayEnd.getTime()) return null;
    const end = new Date(candidate.getTime() + durMin * 60_000);
    const conflict = await findStaffIntervalConflict(prisma, {
      staffId: params.staffId,
      businessId: params.businessId,
      start: candidate,
      end,
      excludeAppointmentId: params.appointmentId,
    });
    if (!conflict) return candidate;
    candidate = new Date(candidate.getTime() + 5 * 60_000);
  }
  return null;
}
