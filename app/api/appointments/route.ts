import { NextRequest, NextResponse } from "next/server";
import { notifyCancelRequest, notifyClientBookingConfirmed, notifyStaffAppointmentConfirmed } from "@/lib/notify";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { businessDayUtcRange, utcFromYmdAndTime } from "@/lib/business-timezone";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { effectiveServicePrice, resolveAppointmentPrimaryPrice } from "@/lib/location-catalog";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";
import { APPOINTMENT_ACTIVE_DAY_LIST_FILTER } from "@/lib/appointment-blocking-status";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date")?.trim();
    let rangeStart: Date;
    let rangeEnd: Date;
    if (dateParam && /^(\d{4})-(\d{2})-(\d{2})$/.test(dateParam)) {
      const r = businessDayUtcRange(dateParam);
      rangeStart = r.start;
      rangeEnd = r.end;
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      rangeStart = today;
      rangeEnd = endOfDay;
    }

    const appointments = await prisma.appointment.findMany({
      where: { businessId, date: { gte: rangeStart, lte: rangeEnd }, ...APPOINTMENT_ACTIVE_DAY_LIST_FILTER },
      include: { staff: true, service: true, extras: { include: { service: true } } },
      orderBy: { date: "asc" }
    });

    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const effectivePrice = await resolveAppointmentPrimaryPrice(prisma, apt);
        const extrasSum = (apt.extras ?? []).reduce((s, e) => s + e.linePrice, 0);
        return {
          ...apt,
          service: apt.service
            ? { ...apt.service, price: effectivePrice }
            : apt.service,
          totalPrice: effectivePrice + extrasSum,
          totalDurationMin: appointmentTotalDurationMin(apt),
        };
      })
    );

    const total = await prisma.appointment.count({ where: { businessId } });
    const thisWeek = await prisma.appointment.count({
      where: { businessId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    return NextResponse.json({ appointments: enriched, total, thisWeek });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const { id, status, date, time, staffId, serviceId, cancelReason } = await req.json();
    console.log("PATCH appointments:", { id, date, time, staffId, serviceId, status });
    // Owner puede actualizar appointments de cualquier sucursal
    const { ownerId } = JSON.parse(session);
    let existing;
    if (ownerId) {
      existing = await prisma.appointment.findFirst({
        where: { id },
        include: { service: true, extras: true },
      });
    } else {
      existing = await prisma.appointment.findFirst({
        where: { id, businessId },
        include: { service: true, extras: true },
      });
    }
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updateData: Record<string, unknown> = {};
    if (typeof status === "string") updateData.status = status;
    if (cancelReason !== undefined) updateData.cancelReason = cancelReason;
    if (date && time) updateData.date = utcFromYmdAndTime(date, time);
    else if (date) updateData.date = new Date(date);
    if (staffId) updateData.staffId = staffId;
    if (serviceId) {
      updateData.serviceId = serviceId;
      const ns = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!ns) return NextResponse.json({ error: "Service not found" }, { status: 400 });
      updateData.serviceDurationMin = ns.duration ?? 30;
      const np = await effectiveServicePrice(prisma, serviceId, existing.businessId);
      updateData.servicePriceSnapshot = np ?? ns.price ?? 0;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid updates" }, { status: 400 });
    }

    const mergedStaffId = staffId ?? existing.staffId;
    const mergedServiceId = serviceId ?? existing.serviceId;
    const mergedStart = date && time ? utcFromYmdAndTime(date, time) : new Date(existing.date);
    if (date && time || staffId || serviceId) {
      const primarySvc = mergedServiceId
        ? await prisma.service.findUnique({ where: { id: mergedServiceId } })
        : existing.service;
      const keepSnapshot = !serviceId || serviceId === existing.serviceId;
      const durMin = appointmentTotalDurationMin({
        service: primarySvc,
        serviceDurationMin: keepSnapshot ? existing.serviceDurationMin : null,
        extras: existing.extras ?? [],
      });
      const mergedEnd = new Date(mergedStart.getTime() + durMin * 60_000);
      const conflict = await findStaffIntervalConflict(prisma, {
        staffId: mergedStaffId,
        businessId: existing.businessId,
        start: mergedStart,
        end: mergedEnd,
        excludeAppointmentId: id,
      });
      if (conflict) {
        return NextResponse.json(
          {
            error:
              conflict.kind === "break"
                ? "That time overlaps a staff break for this staff member."
                : "That time overlaps another appointment for this staff member.",
          },
          { status: 409 }
        );
      }
    }

    const appointment = await prisma.appointment.update({ where: { id }, data: updateData, include: { staff: true, service: true, business: { include: { owner: true } } } });

    const becameConfirmed =
      typeof status === "string" && status === "confirmed" && existing.status !== "confirmed";
    if (becameConfirmed && appointment.staff) {
      try {
        const sid = appointment.serviceId ?? existing.serviceId;
        const price = await resolveAppointmentPrimaryPrice(prisma, appointment);
        await notifyStaffAppointmentConfirmed({
          staffEmail: appointment.staff.email,
          staffPhone: appointment.staff.phone,
          staffName: appointment.staff.name,
          businessName: (appointment.business as { name?: string })?.name ?? "Business",
          clientName: appointment.clientName,
          serviceName: appointment.service?.name ?? "Service",
          price,
          appointmentAt: appointment.date,
        });
      } catch (e) {
        console.error("Staff appointment confirmed notify error:", e);
      }
    }

    // Notificar al owner si es cancel_requested
    if (status === "cancel_requested" && cancelReason) {
      try {
        const biz = appointment.business as any;
        const owner = biz?.owner;
        console.log("NOTIFY DEBUG:", { bizId: biz?.id, ownerEmail: owner?.email, reason: cancelReason });
        if (owner?.email) {
          await notifyCancelRequest({
            ownerEmail: owner.email,
            ownerName: owner.name,
            ownerPhone: owner.phone,
            businessPhone: biz.phone,
            businessName: biz.name,
            clientName: appointment.clientName,
            serviceName: (appointment.service as any)?.name || "Service",
            staffName: (appointment.staff as any)?.name || "Staff",
            date: appointment.date,
            reason: cancelReason,
          });
        }
      } catch (e) {
        console.error("Email notify error:", e);
      }
    }

    return NextResponse.json(appointment);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const { clientName, clientPhone, clientEmail, staffId, serviceId, date, time } = await req.json();
    if (!String(clientName ?? "").trim() || !staffId || !serviceId || !date || !time) {
      return NextResponse.json({ error: "Client name, staff, service, date and time are required" }, { status: 400 });
    }

    const assigned = await prisma.staffAssignment.findFirst({
      where: { businessId, staffId, active: true },
    });
    if (!assigned) {
      return NextResponse.json({ error: "Staff is not assigned to this location" }, { status: 400 });
    }

    const svcLoc = await prisma.serviceLocation.findFirst({
      where: { businessId, serviceId, active: true },
      include: { service: true },
    });
    if (!svcLoc?.service?.active) {
      return NextResponse.json({ error: "Service is not available at this location" }, { status: 400 });
    }

    const aptDate = utcFromYmdAndTime(date, time);
    const service = svcLoc.service;
    const primaryPrice =
      (await effectiveServicePrice(prisma, serviceId, businessId)) ?? service.price ?? 0;
    const durMin = appointmentTotalDurationMin({ service, extras: [] });
    const aptEnd = new Date(aptDate.getTime() + durMin * 60_000);

    const conflict = await findStaffIntervalConflict(prisma, {
      staffId,
      businessId,
      start: aptDate,
      end: aptEnd,
    });
    if (conflict) {
      return NextResponse.json(
        {
          error:
            conflict.kind === "break"
              ? "That time overlaps a staff break. Choose a different time or staff."
              : "That time overlaps another appointment for this staff member. Choose a different time or staff.",
        },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientName: String(clientName).trim(),
        clientPhone: String(clientPhone ?? "").trim() || "",
        clientEmail: clientEmail != null && String(clientEmail).trim() ? String(clientEmail).trim() : null,
        staffId,
        serviceId,
        serviceDurationMin: service.duration ?? 30,
        servicePriceSnapshot: primaryPrice,
        businessId,
        date: aptDate,
        status: "confirmed",
        source: "dashboard",
      },
      include: { staff: true, service: true },
    });

    const bizRow = await prisma.business.findUnique({ where: { id: businessId } });
    if (bizRow && (global as any).io) {
      (global as any).io.to(`display-${bizRow.slug}`).emit("new-appointment", appointment);
    }

    if (bizRow) {
      try {
        const bookingLink = await buildPublicBookingAbsUrl(prisma, bizRow);
        await notifyClientBookingConfirmed({
          source: "dashboard",
          clientEmail: appointment.clientEmail,
          clientPhone: appointment.clientPhone,
          clientName: appointment.clientName,
          businessName: bizRow.name,
          businessAddress: bizRow.address,
          googleMapsPlaceUrl: bizRow.googleMapsPlaceUrl,
          staffName: appointment.staff?.name || "Staff",
          serviceName: appointment.service?.name || "Service",
          date,
          time,
          bookingLink,
        });
      } catch (e) {
        console.error("Dashboard booking client notify error:", e);
      }
      try {
        const price = await resolveAppointmentPrimaryPrice(prisma, appointment);
        if (appointment.staff) {
          await notifyStaffAppointmentConfirmed({
            staffEmail: appointment.staff.email,
            staffPhone: appointment.staff.phone,
            staffName: appointment.staff.name,
            businessName: bizRow.name,
            clientName: appointment.clientName,
            serviceName: appointment.service?.name || "Service",
            price,
            appointmentAt: appointment.date,
          });
        }
      } catch (e) {
        console.error("Dashboard booking staff notify error:", e);
      }
    }

    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    console.error("POST appointment error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
