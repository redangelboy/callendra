import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner, isOwnerMainBusinessSession } from "@/lib/main-business";
import { effectiveServicePrice } from "@/lib/location-catalog";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) {
      return NextResponse.json({ error: "No business found" }, { status: 400 });
    }

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId || !isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      return NextResponse.json({ error: "Consolidated data is only available from the main business" }, { status: 403 });
    }

    const locations = await prisma.business.findMany({
      where: { ownerId, active: true },
      select: { id: true },
    });
    const ids = locations.map((b) => b.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: { in: ids },
        date: { gte: today, lte: endOfDay },
        status: { not: "cancelled" },
      },
      include: { staff: true, service: true, business: true },
      orderBy: { date: "asc" },
    });

    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const p = await effectiveServicePrice(prisma, apt.serviceId, apt.businessId);
        const effectivePrice = p ?? apt.service?.price ?? 0;
        return {
          ...apt,
          service: apt.service
            ? { ...apt.service, price: effectivePrice }
            : apt.service,
        };
      })
    );

    const total = await prisma.appointment.count({ where: { businessId: { in: ids } } });
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = await prisma.appointment.count({
      where: { businessId: { in: ids }, date: { gte: weekAgo } },
    });

    return NextResponse.json({ appointments: enriched, total, thisWeek });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
