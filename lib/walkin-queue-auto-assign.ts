import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { APPOINTMENT_BLOCKING_STATUS_FILTER } from "@/lib/appointment-blocking-status";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { notifyClientBookingConfirmed, notifyStaffAppointmentConfirmed } from "@/lib/notify";
import { effectiveServicePrice } from "@/lib/location-catalog";
import { isStaffIntervalWithinBusinessSchedule } from "@/lib/book-availability";

const WAITING_STATES = ["waiting", "notified"] as const;

/** Walk-ins must wait at least this long before the system may auto-assign (manual take on staff-day is always allowed). */
const AUTO_ASSIGN_BUFFER_MINUTES = 20;

function emitQueueEvent(locationSlug: string, event: string, data: Record<string, unknown>) {
  const io = (global as { io?: { to: (room: string) => { emit: (name: string, payload: unknown) => void } } }).io;
  if (!io) return;
  io.to(`display-${locationSlug}`).emit(event, data);
}

function appointmentStartWithWalkInBuffer(now = DateTime.now().setZone(BUSINESS_TIMEZONE)): Date {
  return now.plus({ minutes: 2 }).toJSDate();
}

type StaffLoad = {
  staffId: string;
  hasActiveOrSoon: boolean;
  recentlyFreed: boolean;
  nextStart: number | null;
  blockedCount: number;
};

function orderFreestStaff(staffLoads: StaffLoad[]): StaffLoad[] {
  if (staffLoads.length === 0) return [];
  return [...staffLoads].sort((a, b) => {
    const aNext = a.nextStart ?? Number.POSITIVE_INFINITY;
    const bNext = b.nextStart ?? Number.POSITIVE_INFINITY;
    if (aNext !== bNext) return bNext - aNext;
    if (a.blockedCount !== b.blockedCount) return a.blockedCount - b.blockedCount;
    return a.staffId.localeCompare(b.staffId);
  });
}

async function takeQueueWithStaff(queueId: string, locationId: string, locationSlug: string, staffId: string) {
  const queue = await prisma.walkInQueue.findUnique({
    where: { id: queueId },
    include: { service: true, location: true },
  });
  if (!queue || !WAITING_STATES.includes(queue.status as (typeof WAITING_STATES)[number])) return null;
  if (queue.locationId !== locationId) return null;

  const startAt = appointmentStartWithWalkInBuffer();
  const duration = Number.isFinite(queue.service.duration) && queue.service.duration > 0 ? queue.service.duration : 30;
  const primaryPrice =
    (await effectiveServicePrice(prisma, queue.serviceId, locationId)) ??
    queue.service.price ??
    0;
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const withinSchedule = await isStaffIntervalWithinBusinessSchedule(prisma, {
    businessId: locationId,
    staffId,
    start: startAt,
    end: endAt,
  });
  if (!withinSchedule) return null;

  const conflict = await findStaffIntervalConflict(prisma, {
    staffId,
    businessId: locationId,
    start: startAt,
    end: endAt,
  });
  if (conflict) return null;

  const appointment = await prisma.appointment.create({
    data: {
      businessId: locationId,
      staffId,
      serviceId: queue.serviceId,
      serviceDurationMin: duration,
      servicePriceSnapshot: primaryPrice,
      clientName: queue.clientName,
      clientPhone: queue.clientPhone ?? "",
      clientEmail: queue.clientEmail ?? null,
      smsOptIn: queue.smsOptIn,
      date: startAt,
      status: "confirmed",
      source: "walk_in_queue_auto",
    },
  });

  try {
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    const business = await prisma.business.findUnique({ where: { id: locationId } });
    if (staff && business) {
      const localDate = DateTime.fromJSDate(appointment.date, { zone: BUSINESS_TIMEZONE });
      const date = localDate.toFormat("yyyy-LL-dd");
      const time = localDate.toFormat("HH:mm");
      const bookingLink = await buildPublicBookingAbsUrl(prisma, business);
      await notifyClientBookingConfirmed({
        source: "walk_in",
        clientEmail: appointment.clientEmail,
        clientPhone: appointment.clientPhone,
        clientName: appointment.clientName,
        businessName: business.name,
        businessAddress: business.address,
        googleMapsPlaceUrl: business.googleMapsPlaceUrl,
        staffName: staff.name,
        serviceName: queue.service.name,
        date,
        time,
        bookingLink,
      });
      const price =
        (await effectiveServicePrice(prisma, queue.serviceId, locationId)) ??
        queue.service.price ??
        0;
      await notifyStaffAppointmentConfirmed({
        staffEmail: staff.email,
        staffPhone: staff.phone,
        staffName: staff.name,
        businessName: business.name,
        clientName: appointment.clientName,
        serviceName: queue.service.name,
        price,
        appointmentAt: appointment.date,
      });
    }
  } catch (e) {
    console.error("walkin auto-assign notifications error", e);
  }

  const taken = await prisma.walkInQueue.update({
    where: { id: queue.id },
    data: {
      status: "taken",
      staffId,
      takenAt: new Date(),
      appointmentId: appointment.id,
    },
  });

  emitQueueEvent(locationSlug, "queue:taken", { queueId: taken.id, appointmentId: appointment.id, staffId });
  emitQueueEvent(locationSlug, "appointment:new", { appointmentId: appointment.id });
  emitQueueEvent(locationSlug, "new-appointment", { appointmentId: appointment.id });
  return taken;
}

export async function checkAndAutoAssign(locationId: string): Promise<void> {
  const location = await prisma.business.findUnique({
    where: { id: locationId },
    select: { id: true, slug: true, parentSlug: true, ownerId: true },
  });
  if (!location) return;

  const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
  const nowDate = now.toJSDate();

  await prisma.walkInQueue.updateMany({
    where: {
      locationId,
      status: { in: [...WAITING_STATES] },
      createdAt: { lt: now.minus({ minutes: 60 }).toJSDate() },
    },
    data: { status: "expired" },
  });

  const waitingToNotify = await prisma.walkInQueue.findMany({
    where: {
      locationId,
      status: "waiting",
      createdAt: { lte: now.minus({ minutes: AUTO_ASSIGN_BUFFER_MINUTES }).toJSDate() },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const row of waitingToNotify) {
    await prisma.walkInQueue.update({
      where: { id: row.id },
      data: { status: "notified", notifiedAt: nowDate },
    });
    emitQueueEvent(location.slug, "queue:notify", { queueId: row.id });
  }

  const queueRows = await prisma.walkInQueue.findMany({
    where: { locationId, status: { in: [...WAITING_STATES] } },
    include: { service: true },
    orderBy: { createdAt: "asc" },
  });
  if (queueRows.length === 0) return;

  const staffRows = await prisma.staffAssignment.findMany({
    where: { businessId: locationId, active: true, staff: { active: true } },
    include: { staff: { select: { id: true } } },
  });
  const staffIds = staffRows.map((r) => r.staffId);
  if (staffIds.length === 0) return;

  const lookBack = now.minus({ hours: 12 }).toJSDate();
  const soonLimit = now.plus({ minutes: 15 }).toJSDate();
  const appts = await prisma.appointment.findMany({
    where: {
      businessId: locationId,
      staffId: { in: staffIds },
      date: { gte: lookBack, lte: soonLimit },
      ...APPOINTMENT_BLOCKING_STATUS_FILTER,
    },
    include: { service: true, extras: true },
    orderBy: { date: "asc" },
  });

  const byStaff = new Map<string, typeof appts>();
  for (const id of staffIds) byStaff.set(id, []);
  for (const apt of appts) (byStaff.get(apt.staffId) ?? []).push(apt);

  const staffLoads: StaffLoad[] = staffIds.map((staffId) => {
    const rows = byStaff.get(staffId) ?? [];
    let hasActiveOrSoon = false;
    let recentlyFreed = false;
    let nextStart: number | null = null;
    let lastEnded: number | null = null;
    for (const apt of rows) {
      const start = apt.date.getTime();
      const end = start + appointmentTotalDurationMin(apt) * 60_000;
      if (start <= now.toMillis() && end > now.toMillis()) hasActiveOrSoon = true;
      if (start > now.toMillis() && start <= now.plus({ minutes: 15 }).toMillis()) hasActiveOrSoon = true;
      if (start > now.toMillis()) {
        nextStart = nextStart == null ? start : Math.min(nextStart, start);
      }
      if (end <= now.toMillis()) {
        lastEnded = lastEnded == null ? end : Math.max(lastEnded, end);
      }
    }
    if (lastEnded != null && now.toMillis() - lastEnded <= 10 * 60_000) recentlyFreed = true;
    return {
      staffId,
      hasActiveOrSoon,
      recentlyFreed,
      nextStart,
      blockedCount: rows.length,
    };
  });

  const freeStaff = staffLoads.filter((s) => !s.hasActiveOrSoon);
  if (freeStaff.length === 0) return;

  const freeById = new Map(freeStaff.map((s) => [s.staffId, s]));
  const remainingQueue = [...queueRows];
  const autoAssignEligibleAt = now.minus({ minutes: AUTO_ASSIGN_BUFFER_MINUTES }).toJSDate();
  const rowMeetsAutoAssignBuffer = (createdAt: Date) => createdAt <= autoAssignEligibleAt;

  const takeOne = async (
    queuePredicate: (q: (typeof queueRows)[number]) => boolean,
    staffPool: StaffLoad[]
  ): Promise<boolean> => {
    if (staffPool.length === 0 || remainingQueue.length === 0) return false;
    const qIdx = remainingQueue.findIndex(queuePredicate);
    if (qIdx < 0) return false;
    const queue = remainingQueue[qIdx]!;
    for (const chosen of orderFreestStaff(staffPool)) {
      const taken = await takeQueueWithStaff(queue.id, locationId, location.slug, chosen.staffId);
      if (!taken) continue;
      remainingQueue.splice(qIdx, 1);
      freeById.delete(chosen.staffId);
      return true;
    }
    return false;
  };

  // Rule: if a staff member was just freed, pull oldest eligible walk-in (same buffer as notify — no instant grab).
  while (true) {
    const recentlyFreedPool = Array.from(freeById.values()).filter((s) => s.recentlyFreed);
    const ok = await takeOne(
      (q) => q.status === "waiting" && rowMeetsAutoAssignBuffer(q.createdAt),
      recentlyFreedPool
    );
    if (!ok) break;
  }

  // Notified clients (buffer already met) + free staff, FIFO.
  while (true) {
    const pool = Array.from(freeById.values());
    const ok = await takeOne(
      (q) => q.status === "notified" && rowMeetsAutoAssignBuffer(q.createdAt),
      pool
    );
    if (!ok) break;
  }
}
