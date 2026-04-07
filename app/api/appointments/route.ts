import { NextRequest, NextResponse } from "next/server";
import { notifyCancelRequest, notifyClientBookingConfirmed } from "@/lib/notify";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { utcFromYmdAndTime } from "@/lib/business-timezone";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { effectiveServicePrice } from "@/lib/location-catalog";
import { findStaffOverlappingAppointment } from "@/lib/appointment-overlap";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: { businessId, date: { gte: today, lte: endOfDay }, status: { not: "cancelled" } },
      include: { staff: true, service: true },
      orderBy: { date: "asc" }
    });

    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const p = await effectiveServicePrice(prisma, apt.serviceId, businessId);
        const effectivePrice = p ?? apt.service?.price ?? 0;
        return {
          ...apt,
          service: apt.service
            ? { ...apt.service, price: effectivePrice }
            : apt.service,
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
      existing = await prisma.appointment.findFirst({ where: { id } });
    } else {
      existing = await prisma.appointment.findFirst({ where: { id, businessId } });
    }
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updateData: any = { status };
    if (cancelReason !== undefined) updateData.cancelReason = cancelReason;
    if (date && time) updateData.date = utcFromYmdAndTime(date, time);
    else if (date) updateData.date = new Date(date);
    if (staffId) updateData.staffId = staffId;
    if (serviceId) updateData.serviceId = serviceId;

    const mergedStaffId = staffId ?? existing.staffId;
    const mergedServiceId = serviceId ?? existing.serviceId;
    const mergedStart = date && time ? utcFromYmdAndTime(date, time) : new Date(existing.date);
    if (date && time || staffId || serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: mergedServiceId } });
      const durMin = svc?.duration ?? 30;
      const mergedEnd = new Date(mergedStart.getTime() + durMin * 60_000);
      const overlap = await findStaffOverlappingAppointment(prisma, {
        staffId: mergedStaffId,
        start: mergedStart,
        end: mergedEnd,
        excludeAppointmentId: id,
      });
      if (overlap) {
        return NextResponse.json(
          { error: "That time overlaps another appointment for this staff member." },
          { status: 409 }
        );
      }
    }

    const appointment = await prisma.appointment.update({ where: { id }, data: updateData, include: { staff: true, service: true, business: { include: { owner: true } } } });

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
    if (!clientName || !staffId || !serviceId || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const durMin = service?.duration ?? 30;
    const aptEnd = new Date(aptDate.getTime() + durMin * 60_000);

    const overlap = await findStaffOverlappingAppointment(prisma, {
      staffId,
      start: aptDate,
      end: aptEnd,
    });
    if (overlap) {
      return NextResponse.json(
        { error: "That time overlaps another appointment for this staff member. Choose a different time or staff." },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientName,
        clientPhone: clientPhone || "",
        clientEmail: clientEmail != null && String(clientEmail).trim() ? String(clientEmail).trim() : null,
        staffId,
        serviceId,
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
    }

    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    console.error("POST appointment error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
