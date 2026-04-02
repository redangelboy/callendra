import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import {
  parseYmdToJsDayOfWeek,
  businessDayUtcRange,
  utcFromYmdAndTime,
} from "@/lib/business-timezone";

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
    const staffId = searchParams.get("staffId");
    const serviceId = searchParams.get("serviceId");
    const date = searchParams.get("date");

    if ((!slug && !parentSlug) || !staffId || !serviceId || !date) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const business = await resolveBusinessForBooking(prisma, {
      slug: slug ?? undefined,
      parentSlug: parentSlug ?? undefined,
      locationSlug: locationSlug ?? undefined,
    });
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const staffOk = await prisma.staffAssignment.findFirst({
      where: { businessId: business.id, staffId, active: true },
    });
    if (!staffOk) return NextResponse.json({ error: "Staff not at location" }, { status: 400 });

    const svcLoc = await prisma.serviceLocation.findFirst({
      where: { businessId: business.id, serviceId, active: true },
      include: { service: true },
    });
    if (!svcLoc?.service?.active) {
      return NextResponse.json({ error: "Service not at location" }, { status: 400 });
    }

    const service = svcLoc.service;
    const dayOfWeek = parseYmdToJsDayOfWeek(date);

    const schedule = await prisma.schedule.findFirst({
      where: { businessId: business.id, staffId, dayOfWeek, active: true }
    });

    if (!schedule) return NextResponse.json({ slots: [] });

    const startOfDay = new Date(date + "T00:00:00");
    const endOfDay = new Date(date + "T23:59:59");
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        staffId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: "cancelled" }
      }
    });

    const duration = service.duration;
    const slots: string[] = [];
    const [startH, startM] = schedule.startTime.split(":").map(Number);
    const [endH, endM] = schedule.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;

      const slotDate = utcFromYmdAndTime(date, timeStr);
      const isBooked = existingAppointments.some(apt => {
        const aptTime = new Date(apt.date);
        return aptTime.getTime() === slotDate.getTime();
      });

      if (!isBooked) slots.push(timeStr);
    }

    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
