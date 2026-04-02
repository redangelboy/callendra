import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { effectiveServicePrice } from "@/lib/location-catalog";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: { businessId, date: { gte: today, lte: endOfDay }, status: { not: "cancelled" } },
      include: { staff: true, service: true },
      orderBy: { date: "asc" }
    });

    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const p = await effectiveServicePrice(prisma, apt.serviceId, businessId);
        const effectivePrice = p ?? apt.service?.price ?? 0;
        return {
          ...apt,
          service: apt.service
            ? { ...apt.service, price: effectivePrice }
            : apt.service,
        };
      })
    );

    const total = await prisma.appointment.count({ where: { businessId } });
    const thisWeek = await prisma.appointment.count({
      where: { businessId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    return NextResponse.json({ appointments: enriched, total, thisWeek });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const { id, status } = await req.json();
    const existing = await prisma.appointment.findFirst({
      where: { id, businessId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const appointment = await prisma.appointment.update({ where: { id }, data: { status } });
    return NextResponse.json(appointment);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
