import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime } from "@/lib/business-timezone";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { walkInTokensMatch } from "@/lib/walk-in-token";

// Rate limiting en memoria: 3 reservaciones por día por IP
const ipBookingCount = new Map<string, { count: number; date: string }>();

function checkRateLimit(ip: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  const entry = ipBookingCount.get(ip);
  if (!entry || entry.date !== today) {
    ipBookingCount.set(ip, { count: 1, date: today });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

async function verifyRecaptcha(token: string): Promise<boolean> {
  if (!token) return process.env.NODE_ENV === "development";
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // si no hay secret configurado, skip
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${secret}&response=${token}`,
  });
  const data = await res.json();
  return data.success && data.score >= 0.5;
}
import { buildPublicBookingAbsUrl } from "@/lib/booking-public-url";
import { notifyClientBookingConfirmed, notifyStaffAppointmentConfirmed } from "@/lib/notify";
import { effectiveServicePrice, resolveAppointmentPrimaryPrice } from "@/lib/location-catalog";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const parentSlug = searchParams.get("parentSlug");
    const locationSlug = searchParams.get("locationSlug");

    if (!slug && !parentSlug) {
      return NextResponse.json({ error: "Missing slug or parentSlug" }, { status: 400 });
    }

    const business = await resolveBusinessForBooking(prisma, {
      slug: slug ?? undefined,
      parentSlug: parentSlug ?? undefined,
      locationSlug: locationSlug ?? undefined,
    });

    if (!business) {
      if (parentSlug) {
        const siblings = await prisma.business.count({
          where: { parentSlug, active: true },
        });
        if (siblings > 1 && !(locationSlug ?? "").trim()) {
          return NextResponse.json(
            { error: "This brand has multiple locations — add the location segment to the URL" },
            { status: 400 }
          );
        }
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { staff, services } = await loadLocationCatalog(prisma, business.id);

    const tokenParam = searchParams.get("token")?.trim() ?? "";
    if (tokenParam) {
      if (!walkInTokensMatch(tokenParam, business.walkInToken)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { displayToken: _dt, walkInToken: _wt, ...businessPublic } = business as {
      displayToken?: string | null;
      walkInToken?: string | null;
    } & Record<string, unknown>;

    return NextResponse.json({ ...businessPublic, staff, services });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      slug: bodySlug,
      parentSlug,
      locationSlug,
      staffId,
      serviceId,
      date,
      time,
      clientName,
      clientPhone,
      clientEmail,
      smsOptIn,
      walkInToken: bodyWalkInToken,
      recaptchaToken,
    } = body;

    if (!staffId || !serviceId || !date || !time || !String(clientName ?? "").trim()) {
      return NextResponse.json({ error: "Name, staff, service, date and time are required" }, { status: 400 });
    }

    if (!bodySlug && !parentSlug) {
      return NextResponse.json({ error: "slug or parentSlug is required" }, { status: 400 });
    }

    const business = await resolveBusinessForBooking(prisma, {
      slug: bodySlug ?? undefined,
      parentSlug: parentSlug ?? undefined,
      locationSlug: locationSlug ?? undefined,
    });

    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const kioskOk =
      typeof bodyWalkInToken === "string" &&
      bodyWalkInToken.trim() !== "" &&
      walkInTokensMatch(bodyWalkInToken, business.walkInToken);

    if (typeof bodyWalkInToken === "string" && bodyWalkInToken.trim() !== "" && !kioskOk) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!kioskOk && !String(clientPhone ?? "").trim()) {
      return NextResponse.json({ error: "Phone is required for online booking" }, { status: 400 });
    }

    if (smsOptIn !== true) {
      return NextResponse.json(
        { error: "Please agree to receive SMS messages to continue" },
        { status: 400 }
      );
    }

    if (!kioskOk) {
      const captchaOk = await verifyRecaptcha(recaptchaToken || "");
      if (!captchaOk) {
        return NextResponse.json({ error: "Security check failed. Please try again." }, { status: 403 });
      }

      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
      if (!checkRateLimit(ip)) {
        return NextResponse.json({ error: "Too many bookings today. Please try again tomorrow." }, { status: 429 });
      }
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

    const staffOk = await prisma.staffAssignment.findFirst({
      where: { businessId: business.id, staffId, active: true },
    });
    if (!staffOk) {
      return NextResponse.json({ error: "Staff not available at this location" }, { status: 400 });
    }

    const svcLoc = await prisma.serviceLocation.findFirst({
      where: { businessId: business.id, serviceId, active: true },
      include: { service: true },
    });
    if (!svcLoc?.service?.active) {
      return NextResponse.json({ error: "Service not available at this location" }, { status: 400 });
    }

    const appointmentDate = utcFromYmdAndTime(date, time);

    // Checar overlap considerando duración del servicio
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const serviceDuration = service?.duration || 30;
    const primaryPrice =
      (await effectiveServicePrice(prisma, serviceId, business.id)) ?? service?.price ?? 0;
    const appointmentEnd = new Date(appointmentDate.getTime() + serviceDuration * 60000);

    const conflict = await findStaffIntervalConflict(prisma, {
      staffId,
      businessId: business.id,
      start: appointmentDate,
      end: appointmentEnd,
    });
    if (conflict) {
      return NextResponse.json(
        { error: "This time slot is no longer available. Please choose a different time." },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId,
        serviceId,
        serviceDurationMin: serviceDuration,
        servicePriceSnapshot: primaryPrice,
        clientName: String(clientName).trim(),
        clientPhone: String(clientPhone ?? "").trim() || "",
        clientEmail: clientEmail != null && String(clientEmail).trim() ? String(clientEmail).trim() : null,
        smsOptIn: true,
        clientIp: ip || null,
        date: appointmentDate,
        status: "confirmed",
        source: kioskOk ? "walk_in" : "web",
      }
    });

    const displayRoomSlug = business.slug;

    if ((global as any).io) {
      (global as any).io.to(`display-${displayRoomSlug}`).emit("new-appointment", appointment);
    }

    const staffMember = await prisma.staff.findUnique({ where: { id: staffId } });
    const serviceMember = await prisma.service.findUnique({ where: { id: serviceId } });
    const bookingLink = await buildPublicBookingAbsUrl(prisma, business);
    try {
      await notifyClientBookingConfirmed({
        source: kioskOk ? "walk_in" : "web",
        clientEmail: appointment.clientEmail,
        clientPhone: appointment.clientPhone,
        clientName: appointment.clientName,
        businessName: business.name,
        businessAddress: business.address,
        googleMapsPlaceUrl: business.googleMapsPlaceUrl,
        staffName: staffMember?.name || "Staff",
        serviceName: serviceMember?.name || "Service",
        date,
        time,
        bookingLink,
      });
    } catch (notifyErr) {
      console.error("Client booking notify error:", notifyErr);
    }
    try {
      if (staffMember) {
        const price = await resolveAppointmentPrimaryPrice(prisma, {
          ...appointment,
          service: serviceMember,
        });
        await notifyStaffAppointmentConfirmed({
          staffEmail: staffMember.email,
          staffPhone: staffMember.phone,
          staffName: staffMember.name,
          businessName: business.name,
          clientName: appointment.clientName,
          serviceName: serviceMember?.name || "Service",
          price,
          appointmentAt: appointmentDate,
        });
      }
    } catch (staffNotifyErr) {
      console.error("Staff booking notify error:", staffNotifyErr);
    }

    return NextResponse.json({ success: true, appointmentId: appointment.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
