import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner } from "@/lib/main-business";
import { effectiveServicePrice } from "@/lib/location-catalog";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";
import { businessDayUtcRange } from "@/lib/business-timezone";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Parse YYYY-MM-DD in local calendar. */
function parseYmdLocal(s: string | null): Date | null {
  if (!s?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session) as {
      ownerId?: string;
      businessId?: string;
    };
    if (!ownerId || !sessionBusinessId) {
      return NextResponse.json({ error: "Consolidated reports require an owner account" }, { status: 403 });
    }

    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) {
      return NextResponse.json({ error: "No business found" }, { status: 400 });
    }

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ownerBusinesses = await prisma.business.findMany({
      where: { ownerId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const ownerBusinessIds = ownerBusinesses.map((b) => b.id);

    const isMainSession = sessionBusinessId === mainId;

    const { searchParams } = new URL(req.url);
    let businessFilter: string[];

    if (isMainSession) {
      const locationId = searchParams.get("locationId");
      if (locationId) {
        if (!ownerBusinessIds.includes(locationId)) {
          return NextResponse.json({ error: "Invalid location" }, { status: 400 });
        }
        businessFilter = [locationId];
      } else {
        businessFilter = ownerBusinessIds;
      }
    } else {
      if (!ownerBusinessIds.includes(sessionBusinessId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      businessFilter = [sessionBusinessId];
    }

    const now = new Date();
    const defaultRangeStart = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const defaultRangeEndDay = startOfDay(now);

    const rangePreset = searchParams.get("range");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dateOverride = searchParams.get("date")?.trim();

    let from: Date;
    let rangeEnd: Date;

    if (dateOverride && /^(\d{4})-(\d{2})-(\d{2})$/.test(dateOverride)) {
      const r = businessDayUtcRange(dateOverride);
      from = r.start;
      rangeEnd = r.end;
    } else if (rangePreset === "today") {
      from = startOfDay(now);
      rangeEnd = endOfDay(now);
    } else {
      from = parseYmdLocal(fromParam) ?? defaultRangeStart;
      const toRaw = parseYmdLocal(toParam) ?? defaultRangeEndDay;
      rangeEnd = endOfDay(toRaw);
    }

    if (from.getTime() > rangeEnd.getTime()) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const serviceId = searchParams.get("serviceId");
    const staffId = searchParams.get("staffId");
    const statusFilter = searchParams.get("status") ?? "all";

    const statusWhere: Prisma.AppointmentWhereInput =
      statusFilter === "active"
        ? { status: { in: ["confirmed", "cancel_requested"] } }
        : statusFilter === "pending_cancel"
          ? { status: "cancel_requested" }
          : statusFilter === "cancelled"
            ? { status: "cancelled" }
            : {};

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: { in: businessFilter },
        date: { gte: from, lte: rangeEnd },
        ...(serviceId ? { serviceId } : {}),
        ...(staffId ? { staffId } : {}),
        ...statusWhere,
      },
      include: { staff: true, service: true, business: true, extras: { include: { service: true } } },
      orderBy: [{ date: "asc" }],
    });

    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const p = apt.serviceId
          ? await effectiveServicePrice(prisma, apt.serviceId, apt.businessId)
          : null;
        const effectivePrice = p ?? apt.service?.price ?? 0;
        const extrasSum = (apt.extras ?? []).reduce((s, e) => s + e.linePrice, 0);
        return {
          ...apt,
          service: apt.service ? { ...apt.service, price: effectivePrice } : apt.service,
          totalPrice: effectivePrice + extrasSum,
          totalDurationMin: appointmentTotalDurationMin(apt),
        };
      })
    );

    const [staffOptions, serviceOptions] = await Promise.all([
      prisma.staff.findMany({
        where: { businessId: { in: businessFilter }, active: true },
        select: { id: true, name: true, businessId: true },
        orderBy: { name: "asc" },
      }),
      prisma.service.findMany({
        where: { businessId: { in: businessFilter }, active: true },
        select: { id: true, name: true, businessId: true, duration: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const total = await prisma.appointment.count({
      where: { businessId: { in: ownerBusinessIds } },
    });
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = await prisma.appointment.count({
      where: { businessId: { in: ownerBusinessIds }, date: { gte: weekAgo } },
    });

    const branchLabel = !isMainSession ? current.name : null;

    return NextResponse.json({
      appointments: enriched,
      total,
      thisWeek,
      isBranchView: !isMainSession,
      branchName: branchLabel,
      locations: ownerBusinesses,
      staffOptions,
      serviceOptions,
    });
  } catch (error) {
    console.error("consolidated GET", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
