import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { utcFromYmdAndTime } from "@/lib/business-timezone";
import { sendBookingConfirmation } from "@/lib/email/send";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
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

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId,
        serviceId,
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
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
