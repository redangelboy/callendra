import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocationCatalog } from "@/lib/location-catalog";
import { businessDayUtcRange, utcFromYmdAndTime } from "@/lib/business-timezone";
import { staffBreakDateFromYmd } from "@/lib/staff-break-date";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const row = await prisma.business.findUnique({
      where: { slug },
    });

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tokenParam = searchParams.get("token") ?? "";
    if (row.displayToken) {
      if (!tokenParam || tokenParam !== row.displayToken) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { staff } = await loadLocationCatalog(prisma, row.id);

    // Si es sucursal, obtener nombre y logo del main
    let parentName = null;
    let logo = row.logo;
    if (row.parentSlug) {
      const main = await prisma.business.findFirst({
        where: { slug: row.parentSlug }
      });
      if (main) {
        parentName = main.name;
        logo = logo || main.logo; // usar logo del main si la sucursal no tiene
      }
    }

    const { displayToken: _omit, ...rowPublic } = row;
    const business = { ...rowPublic, staff, parentName, logo, locationSlug: row.locationSlug };

    const todayChicago = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const { start: startUTC, end: endUTC } = businessDayUtcRange(todayChicago);

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        date: { gte: startUTC, lte: endUTC },
        status: { not: "cancelled" }
      },
      include: { service: true, staff: true },
      orderBy: { date: "asc" }
    });

    const dayKey = staffBreakDateFromYmd(todayChicago);
    const staffBreaksRaw = await prisma.staffBreak.findMany({
      where: { businessId: business.id, date: dayKey },
      include: { staff: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    });
    const staffBreaks = staffBreaksRaw.map((b) => ({
      id: b.id,
      staffId: b.staffId,
      label: b.label,
      startTime: b.startTime,
      duration: b.duration,
      startAt: utcFromYmdAndTime(todayChicago, b.startTime).toISOString(),
      staff: b.staff,
    }));

    return NextResponse.json({ business, appointments, staffBreaks });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
