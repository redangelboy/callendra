import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { walkInTokensMatch } from "@/lib/walk-in-token";
import { getStaffServiceSlotsForDay, resolveBookableService } from "@/lib/book-availability";

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
    const tokenParam = searchParams.get("token")?.trim() ?? "";

    if ((!slug && !parentSlug) || !staffId || !serviceId || !date) {
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

    const staffOk = await prisma.staffAssignment.findFirst({
      where: { businessId: business.id, staffId, active: true },
    });
    if (!staffOk) return NextResponse.json({ error: "Staff not at location" }, { status: 400 });

    const service = await resolveBookableService(prisma, {
      businessId: business.id,
      serviceId,
    });
    if (!service) {
      return NextResponse.json({ error: "Service not at location" }, { status: 400 });
    }

    const slots = await getStaffServiceSlotsForDay(prisma, {
      businessId: business.id,
      staffId,
      date,
      serviceDurationMin: service.duration ?? 30,
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
