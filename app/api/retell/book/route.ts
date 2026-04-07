import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DateTime } from "luxon";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime, BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { findStaffOverlappingAppointment } from "@/lib/appointment-overlap";
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { notifyClientBookingConfirmed } from "@/lib/notify";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function phonesMatch(stored: string, incoming: string): boolean {
  const a = digitsOnly(stored);
  const b = digitsOnly(incoming);
  if (!a || !b) return stored.trim() === incoming.trim();
  if (a === b) return true;
  if (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10)) return true;
  return false;
}

function formatVoiceDateTime(d: Date): { date: string; time: string } {
  const dt = DateTime.fromJSDate(d, { zone: BUSINESS_TIMEZONE });
  return {
    date: dt.toFormat("MMMM d, yyyy"),
    time: dt.toFormat("h:mm a"),
  };
}

/** Lookup: only upcoming (date >= now). Cancel/modify: next upcoming first, else most recent confirmed by scheduled date. */
async function findAppointmentForPhone(
  businessId: string,
  incomingPhone: string,
  mode: "lookup" | "change"
) {
  const now = new Date();

  const upcoming = await prisma.appointment.findMany({
    where: {
      businessId,
      status: "confirmed",
      date: { gte: now },
    },
    include: { staff: true, service: true },
    orderBy: { date: "asc" },
  });
  for (const apt of upcoming) {
    if (phonesMatch(apt.clientPhone, incomingPhone)) return apt;
  }

  if (mode === "lookup") return null;

  const recent = await prisma.appointment.findMany({
    where: { businessId, status: "confirmed" },
    include: { staff: true, service: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  for (const apt of recent) {
    if (phonesMatch(apt.clientPhone, incomingPhone)) return apt;
  }
  return null;
}

/**
 * Same date/time resolution as booking (year fix, AM/PM, ambiguous hour).
 */
function resolveDateAndTime(date: string, time: string): { resolvedDate: string; resolvedTime: string } {
  const currentYear = new Date().getFullYear();
  let resolvedDate = date;
  if (/^\d{1,2}[\/\-]\d{1,2}$/.test(date)) {
    const parts = date.replace(/\//g, "-").split("-");
    resolvedDate = `${currentYear}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parts = date.split("-");
    resolvedDate = `${currentYear}-${parts[1]}-${parts[2]}`;
  }

  let resolvedTime = time;
  const ampm = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const minutes = ampm[2] ? ampm[2] : "00";
    const period = ampm[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    resolvedTime = `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  if (/^\d{1,2}(:\d{2})?$/.test(time.trim())) {
    const hour = parseInt(time.split(":")[0], 10);
    const nowHour = new Date().getHours();
    if (hour < 12 && nowHour >= 12) {
      resolvedTime = `${String(hour + 12).padStart(2, "0")}:${time.includes(":") ? time.split(":")[1] : "00"}`;
    }
  }

  return { resolvedDate, resolvedTime };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const args = body.args || body;

    const actionRaw = args.action;
    const action =
      typeof actionRaw === "string" ? actionRaw.toLowerCase().trim() : "book";

    if (!["book", "cancel", "modify", "lookup"].includes(action)) {
      return NextResponse.json(
        { success: false, message: `Unknown action: ${String(actionRaw)}` },
        { status: 400 }
      );
    }

    const { slug, clientPhone } = args;

    if (!slug) {
      return NextResponse.json(
        { success: false, message: "Missing required field: slug" },
        { status: 400 }
      );
    }

    const business = await prisma.business.findFirst({
      where: { slug, active: true },
    });

    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    if (action === "lookup") {
      if (!clientPhone) {
        return NextResponse.json(
          { success: false, message: "Missing required field: clientPhone" },
          { status: 400 }
        );
      }
      const apt = await findAppointmentForPhone(business.id, clientPhone, "lookup");
      if (!apt) {
        return NextResponse.json({
          success: false,
          message: "No upcoming appointment found for that phone number",
        });
      }
      const { date: dStr, time: tStr } = formatVoiceDateTime(apt.date);
      const staffName = apt.staff?.name ?? "—";
      const serviceName = apt.service?.name ?? "—";
      return NextResponse.json({
        success: true,
        message: `You have an appointment on ${dStr} at ${tStr} with ${staffName} for ${serviceName}`,
        appointment: {
          id: apt.id,
          date: DateTime.fromJSDate(apt.date, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-MM-dd"),
          time: DateTime.fromJSDate(apt.date, { zone: BUSINESS_TIMEZONE }).toFormat("HH:mm"),
          staffName,
          serviceName,
          status: apt.status,
        },
      });
    }

    if (action === "cancel") {
      if (!clientPhone) {
        return NextResponse.json(
          { success: false, message: "Missing required field: clientPhone" },
          { status: 400 }
        );
      }
      const apt = await findAppointmentForPhone(business.id, clientPhone, "change");
      if (!apt) {
        return NextResponse.json({
          success: false,
          message: "No appointment found for that phone number",
        });
      }
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { status: "cancelled" },
      });
      const displayName = (args.clientName as string | undefined)?.trim() || apt.clientName;
      const { date: dStr, time: tStr } = formatVoiceDateTime(apt.date);
      return NextResponse.json({
        success: true,
        message: `Appointment cancelled for ${displayName} on ${dStr} at ${tStr}`,
      });
    }

    if (action === "modify") {
      const { date, time, staffName, serviceName } = args;
      if (!clientPhone || !date || !time) {
        return NextResponse.json(
          {
            success: false,
            message: "Missing required fields: clientPhone, date, time",
          },
          { status: 400 }
        );
      }

      const apt = await findAppointmentForPhone(business.id, clientPhone, "change");
      if (!apt) {
        return NextResponse.json({
          success: false,
          message: "No appointment found for that phone number",
        });
      }

      const { resolvedDate, resolvedTime } = resolveDateAndTime(date, time);
      const appointmentDate = utcFromYmdAndTime(resolvedDate, resolvedTime);

      const now = new Date();
      if (appointmentDate < now) {
        return NextResponse.json({
          success: false,
          message: "That time has already passed. Please choose a future time.",
        }, { status: 400 });
      }

      const { staff, services } = await loadLocationCatalog(prisma, business.id);

      let selectedStaff = apt.staff;
      if (staffName) {
        const found = staff.find((s) =>
          s.name.toLowerCase().includes(String(staffName).toLowerCase())
        );
        if (!found) {
          return NextResponse.json(
            { success: false, message: "Staff member not found for this location" },
            { status: 400 }
          );
        }
        selectedStaff = found;
      }

      let selectedService = apt.service;
      if (serviceName) {
        const found = services.find((s) =>
          s.name.toLowerCase().includes(String(serviceName).toLowerCase())
        );
        if (!found) {
          return NextResponse.json(
            { success: false, message: "Service not found for this location" },
            { status: 400 }
          );
        }
        selectedService = found;
      }

      if (!selectedStaff || !selectedService) {
        return NextResponse.json(
          { success: false, message: "Could not resolve staff or service for this appointment" },
          { status: 400 }
        );
      }

      const serviceDuration = selectedService.duration || 30;
      const appointmentEnd = new Date(appointmentDate.getTime() + serviceDuration * 60000);

      const overlap = await findStaffOverlappingAppointment(prisma, {
        staffId: selectedStaff.id,
        start: appointmentDate,
        end: appointmentEnd,
        excludeAppointmentId: apt.id,
      });
      if (overlap) {
        return NextResponse.json(
          {
            success: false,
            message: `${selectedStaff.name} is busy at that time. Please choose a different time or staff.`,
          },
          { status: 409 }
        );
      }

      await prisma.appointment.update({
        where: { id: apt.id },
        data: {
          date: appointmentDate,
          staffId: selectedStaff.id,
          serviceId: selectedService.id,
        },
      });

      const displayName = apt.clientName;
      const { date: dStr, time: tStr } = formatVoiceDateTime(appointmentDate);
      return NextResponse.json({
        success: true,
        message: `Appointment updated for ${displayName} to ${dStr} at ${tStr}`,
      });
    }

    // --- book (default) ---
    const {
      clientName,
      clientPhone: bookPhone,
      serviceName,
      staffName,
      date,
      time,
    } = args;

    if (!clientName || !bookPhone || !date || !time) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: clientName, clientPhone, date, time",
        },
        { status: 400 }
      );
    }

    const { resolvedDate, resolvedTime } = resolveDateAndTime(date, time);

    const { staff, services } = await loadLocationCatalog(prisma, business.id);

    let selectedStaff = staff[0];
    if (staffName) {
      const found = staff.find((s: any) =>
        s.name.toLowerCase().includes(staffName.toLowerCase())
      );
      if (found) selectedStaff = found;
    }

    if (!selectedStaff) {
      return NextResponse.json({ success: false, message: "No barbers available" }, { status: 400 });
    }

    let selectedService = services[0];
    if (serviceName) {
      const found = services.find((s: any) =>
        s.name.toLowerCase().includes(serviceName.toLowerCase())
      );
      if (found) selectedService = found;
    }

    if (!selectedService) {
      return NextResponse.json({ success: false, message: "No services available" }, { status: 400 });
    }

    const appointmentDate = utcFromYmdAndTime(resolvedDate, resolvedTime);

    const nowBook = new Date();
    if (appointmentDate < nowBook) {
      return NextResponse.json(
        {
          success: false,
          message: `That time has already passed. Please choose a future time.`,
        },
        { status: 400 }
      );
    }

    const serviceDuration = selectedService.duration || 30;
    const appointmentEnd = new Date(appointmentDate.getTime() + serviceDuration * 60000);

    const overlap = await findStaffOverlappingAppointment(prisma, {
      staffId: selectedStaff.id,
      start: appointmentDate,
      end: appointmentEnd,
    });
    if (overlap) {
      return NextResponse.json(
        {
          success: false,
          message: `${selectedStaff.name} is busy at that time. Please choose a different time or barber.`,
        },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId: selectedStaff.id,
        serviceId: selectedService.id,
        clientName,
        clientPhone: bookPhone,
        clientEmail: null,
        date: appointmentDate,
        status: "confirmed",
        source: "phone",
      },
    });

    try {
      const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/internal/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: `display-${business.slug}`,
          event: "new-appointment",
          data: appointment,
        }),
      });
    } catch (emitError) {
      console.error("Emit error:", emitError);
    }

    try {
      const bookingLink = await buildPublicBookingAbsUrl(prisma, business);
      await notifyClientBookingConfirmed({
        source: "phone",
        clientPhone: bookPhone,
        clientEmail: null,
        clientName,
        businessName: business.name,
        businessAddress: business.address,
        googleMapsPlaceUrl: business.googleMapsPlaceUrl,
        staffName: selectedStaff.name,
        serviceName: selectedService.name,
        date: resolvedDate,
        time: resolvedTime,
        bookingLink,
      });
    } catch (notifyErr) {
      console.error("Retell client SMS notify error:", notifyErr);
    }

    return NextResponse.json({
      success: true,
      message: `Appointment confirmed for ${clientName} on ${resolvedDate} at ${resolvedTime} with ${selectedStaff.name} for ${selectedService.name}.`,
      appointmentId: appointment.id,
    });
  } catch (error) {
    console.error("Retell webhook error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

// GET para obtener info dinámica del negocio (servicios, barbers, horarios)
// Retell puede llamar esto al inicio de la llamada para inyectar variables en el prompt
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const business = await prisma.business.findFirst({
      where: { slug, active: true },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const { staff, services } = await loadLocationCatalog(prisma, business.id);

    const staffNames = staff.map((s: any) => s.name).join(", ");
    const serviceList = services.map((s: any) => `${s.name} ($${s.price}, ${s.duration} min)`).join(" | ");
    const currentYear = new Date().getFullYear();

    return NextResponse.json({
      businessName: business.name,
      currentYear,
      staffNames,
      serviceList,
    });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
