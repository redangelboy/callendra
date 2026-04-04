import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime } from "@/lib/business-timezone";

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
import { sendBookingConfirmation } from "@/lib/email/send";

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

    return NextResponse.json({ ...business, staff, services });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recaptchaToken } = body;
    const captchaOk = await verifyRecaptcha(recaptchaToken || "");
    if (!captchaOk) {
      return NextResponse.json({ error: "Security check failed. Please try again." }, { status: 403 });
    }

    // Rate limit por IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many bookings today. Please try again tomorrow." }, { status: 429 });
    }
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
    } = body;

    if (!staffId || !serviceId || !date || !time || !clientName || !clientPhone) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
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
    const appointmentEnd = new Date(appointmentDate.getTime() + serviceDuration * 60000);

    const conflict = await prisma.appointment.findFirst({
      where: {
        staffId,
        status: { not: "cancelled" },
        AND: [
          { date: { lt: appointmentEnd } },
          { date: { gte: new Date(appointmentDate.getTime() - serviceDuration * 60000) } }
        ]
      },
      include: { service: true }
    });

    if (conflict) {
      const conflictEnd = new Date(conflict.date.getTime() + (conflict.service?.duration || 30) * 60000);
      if (conflict.date < appointmentEnd && conflictEnd > appointmentDate) {
        return NextResponse.json({ error: "This time slot is no longer available. Please choose a different time." }, { status: 409 });
      }
    }

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId,
        serviceId,
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        clientIp: ip || null,
        date: appointmentDate,
        status: "confirmed",
        source: "web",
      }
    });

    const displayRoomSlug = business.slug;

    if ((global as any).io) {
      (global as any).io.to(`display-${displayRoomSlug}`).emit("new-appointment", appointment);
    }

    // Send confirmation email
    if (appointment.clientEmail) {
      try {
        const staffMember = await prisma.staff.findUnique({ where: { id: staffId } });
        const serviceMember = await prisma.service.findUnique({ where: { id: serviceId } });
        const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
        const bookingPath = `${baseUrl}/en/book/${business.slug}`;

        await sendBookingConfirmation({
          clientEmail: appointment.clientEmail,
          clientName: appointment.clientName,
          businessName: business.name,
          staffName: staffMember?.name || "Staff",
          serviceName: serviceMember?.name || "Service",
          date: date,
          time: time,
          bookingLink: bookingPath,
          businessEmail: undefined,
        });
        console.log("Confirmation email sent to:", appointment.clientEmail);
      } catch (emailError) {
        console.error("Email send error:", emailError);
      }
    }

    return NextResponse.json({ success: true, appointmentId: appointment.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
