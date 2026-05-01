import { DateTime } from "luxon";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { canManageBusiness, readSession } from "@/lib/session-auth";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { checkAndAutoAssign } from "@/lib/walkin-queue-auto-assign";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { notifyClientBookingConfirmed, notifyStaffAppointmentConfirmed } from "@/lib/notify";
import { effectiveServicePrice } from "@/lib/location-catalog";

function emitEvent(locationSlug: string, event: string, payload: Record<string, unknown>) {
  const io = (global as { io?: { to: (room: string) => { emit: (name: string, data: unknown) => void } } }).io;
  if (!io) return;
  io.to(`display-${locationSlug}`).emit(event, payload);
}

async function validateTakeAccess(req: NextRequest, locationId: string, staffId: string, token: string) {
  if (token) {
    const staff = await prisma.staff.findFirst({
      where: { staffDayViewToken: token, active: true },
      include: { staffAssignments: { where: { active: true }, select: { businessId: true } } },
    });
    if (!staff || staff.id !== staffId) return false;
    return staff.staffAssignments.some((a) => a.businessId === locationId) || staff.businessId === locationId;
  }
  const session = readSession(req);
  if (!canManageBusiness(session)) return false;
  if (session?.ownerId) {
    const location = await prisma.business.findFirst({
      where: { id: locationId, ownerId: session.ownerId, active: true },
      select: { id: true },
    });
    return !!location;
  }
  return session?.businessId === locationId;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { queueId?: string; staffId?: string; token?: string };
    const queueId = (body.queueId ?? "").trim();
    const staffId = (body.staffId ?? "").trim();
    const token = (body.token ?? "").trim();
    if (!queueId || !staffId) {
      return NextResponse.json({ error: "queueId and staffId are required" }, { status: 400 });
    }

    const queue = await prisma.walkInQueue.findUnique({
      where: { id: queueId },
      include: {
        location: { select: { id: true, slug: true } },
        service: { select: { id: true, name: true, price: true, duration: true, active: true } },
      },
    });
    if (!queue) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
    if (!["waiting", "notified"].includes(queue.status)) {
      return NextResponse.json({ error: "Queue item is no longer available" }, { status: 409 });
    }

    const access = await validateTakeAccess(req, queue.locationId, staffId, token);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const assigned = await prisma.staffAssignment.findFirst({
      where: { businessId: queue.locationId, staffId, active: true, staff: { active: true } },
      select: { id: true },
    });
    if (!assigned) {
      return NextResponse.json({ error: "Staff is not assigned to this location" }, { status: 400 });
    }

    if (!queue.service.active) {
      return NextResponse.json({ error: "Service is not active" }, { status: 400 });
    }

    const start = DateTime.now().setZone(BUSINESS_TIMEZONE).plus({ minutes: 2 }).toJSDate();
    const duration = Number.isFinite(queue.service.duration) && queue.service.duration > 0 ? queue.service.duration : 30;
    const primaryPrice =
      (await effectiveServicePrice(prisma, queue.serviceId, queue.locationId)) ??
      queue.service.price ??
      0;
    const end = new Date(start.getTime() + duration * 60_000);

    const conflict = await findStaffIntervalConflict(prisma, {
      staffId,
      businessId: queue.locationId,
      start,
      end,
    });
    if (conflict) {
      return NextResponse.json({ error: "Staff is no longer available for immediate take" }, { status: 409 });
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: queue.locationId,
        staffId,
        serviceId: queue.serviceId,
        serviceDurationMin: duration,
        servicePriceSnapshot: primaryPrice,
        clientName: queue.clientName,
        clientEmail: queue.clientEmail ?? null,
        clientPhone: queue.clientPhone ?? "",
        date: start,
        status: "confirmed",
        source: "walk_in_queue",
      },
    });

    try {
      const staff = await prisma.staff.findUnique({ where: { id: staffId } });
      const business = await prisma.business.findUnique({ where: { id: queue.locationId } });
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
          (await effectiveServicePrice(prisma, queue.serviceId, queue.locationId)) ??
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
      console.error("walkin take notifications error", e);
    }

    const taken = await prisma.walkInQueue.update({
      where: { id: queue.id },
      data: {
        status: "taken",
        staffId,
        appointmentId: appointment.id,
        takenAt: new Date(),
      },
    });

    emitEvent(queue.location.slug, "queue:taken", { queueId: taken.id, staffId, appointmentId: appointment.id });
    emitEvent(queue.location.slug, "appointment:new", { appointmentId: appointment.id });
    emitEvent(queue.location.slug, "new-appointment", { appointmentId: appointment.id });

    await checkAndAutoAssign(queue.locationId);

    return NextResponse.json({ success: true, appointmentId: appointment.id });
  } catch (error) {
    console.error("POST /api/walkin-queue/take", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
