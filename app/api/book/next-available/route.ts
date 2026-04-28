import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DateTime } from "luxon";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { walkInTokensMatch } from "@/lib/walk-in-token";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { getStaffServiceSlotsForDay, resolveBookableService } from "@/lib/book-availability";
import { APPOINTMENT_BLOCKING_STATUS_FILTER } from "@/lib/appointment-blocking-status";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NA";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function rotatePickIndex(size: number): number {
  if (size <= 1) return 0;
  const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
  // Rotate tie-break daily to avoid always favoring same staff.
  return Math.abs(now.ordinal) % size;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const parentSlug = searchParams.get("parentSlug");
    const locationSlug = searchParams.get("locationSlug");
    const serviceId = searchParams.get("serviceId")?.trim();
    const tokenParam = searchParams.get("token")?.trim() ?? "";

    if ((!slug && !parentSlug) || !serviceId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const business = await resolveBusinessForBooking(prisma, {
      slug: slug ?? undefined,
      parentSlug: parentSlug ?? undefined,
      locationSlug: locationSlug ?? undefined,
    });
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    if (tokenParam && !walkInTokensMatch(tokenParam, business.walkInToken)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const service = await resolveBookableService(prisma, {
      businessId: business.id,
      serviceId,
    });
    if (!service) {
      return NextResponse.json({ error: "Service not at location" }, { status: 400 });
    }

    const assigned = await prisma.staffAssignment.findMany({
      where: { businessId: business.id, active: true, staff: { active: true } },
      include: { staff: true },
      orderBy: { staff: { name: "asc" } },
    });
    const staffList = assigned
      .map((a) => a.staff)
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (staffList.length === 0) {
      return NextResponse.json({ available: false });
    }

    const start = DateTime.now().setZone(BUSINESS_TIMEZONE).startOf("day");
    const searchEnd = start.plus({ days: 7 }).endOf("day").toJSDate();
    const searchStart = start.toJSDate();
    const loadCounts = await prisma.appointment.groupBy({
      by: ["staffId"],
      where: {
        businessId: business.id,
        staffId: { in: staffList.map((s) => s.id) },
        date: { gte: searchStart, lte: searchEnd },
        ...APPOINTMENT_BLOCKING_STATUS_FILTER,
      },
      _count: { _all: true },
    });
    const loadByStaffId = new Map(loadCounts.map((r) => [r.staffId, r._count._all]));

    let earliest: null | { date: string; time: string } = null;
    const candidates: Array<{ staffId: string; staffName: string; date: string; time: string }> = [];
    for (let offset = 0; offset < 7; offset++) {
      const ymd = start.plus({ days: offset }).toFormat("yyyy-LL-dd");
      for (const staff of staffList) {
        const slots = await getStaffServiceSlotsForDay(prisma, {
          businessId: business.id,
          staffId: staff.id,
          date: ymd,
          serviceDurationMin: service.duration ?? 30,
          excludePastForToday: true,
          minLeadMinutes: 5,
        });
        if (slots[0]) {
          if (!earliest) {
            earliest = { date: ymd, time: slots[0] };
            candidates.push({ staffId: staff.id, staffName: staff.name, date: ymd, time: slots[0] });
            continue;
          }
          const earliestKey = `${earliest.date} ${earliest.time}`;
          const candidateKey = `${ymd} ${slots[0]}`;
          if (candidateKey < earliestKey) {
            earliest = { date: ymd, time: slots[0] };
            candidates.length = 0;
            candidates.push({ staffId: staff.id, staffName: staff.name, date: ymd, time: slots[0] });
          } else if (candidateKey === earliestKey) {
            candidates.push({ staffId: staff.id, staffName: staff.name, date: ymd, time: slots[0] });
          }
        }
      }
    }

    if (candidates.length > 0) {
      const minLoad = Math.min(...candidates.map((c) => loadByStaffId.get(c.staffId) ?? 0));
      const leastLoaded = candidates
        .filter((c) => (loadByStaffId.get(c.staffId) ?? 0) === minLoad)
        .sort((a, b) => a.staffId.localeCompare(b.staffId));
      const chosen = leastLoaded[rotatePickIndex(leastLoaded.length)] ?? leastLoaded[0]!;
      return NextResponse.json({
        available: true,
        staffId: chosen.staffId,
        staffName: chosen.staffName,
        staffInitials: initials(chosen.staffName),
        date: chosen.date,
        time: chosen.time,
      });
    }

    return NextResponse.json({ available: false });
  } catch (error) {
    console.error("GET /api/book/next-available", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
