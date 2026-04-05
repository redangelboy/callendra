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
  connectionString: process.env.DATABASE_URL!
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

    const { start: dayStart, end: dayEnd } = businessDayUtcRange(date);
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        staffId,
        date: { gte: dayStart, lte: dayEnd },
        status: { not: "cancelled" },
      },
      include: { service: true },
    });

    const rawDuration = Number(service.duration);
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 30;
    const slots: string[] = [];
    const [startH, startM] = schedule.startTime.split(":").map(Number);
    const [endH, endM] = schedule.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
      return NextResponse.json({ slots: [] });
    }

    /** true si [slotStart, slotEnd) se solapa con alguna cita existente (misma regla que el POST de booking). */
    function slotOverlapsExisting(slotStart: Date, slotEnd: Date): boolean {
      const s0 = slotStart.getTime();
      const e0 = slotEnd.getTime();
      return existingAppointments.some((apt) => {
        const aptDur = apt.service?.duration ?? 30;
        const aptStart = apt.date.getTime();
        const aptEnd = aptStart + aptDur * 60_000;
        return aptStart < e0 && aptEnd > s0;
      });
    }

    for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;

      const slotDate = utcFromYmdAndTime(date, timeStr);
      const slotEnd = new Date(slotDate.getTime() + duration * 60_000);
      if (slotOverlapsExisting(slotDate, slotEnd)) continue;

      slots.push(timeStr);
    }

    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
