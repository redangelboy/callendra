import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: "postgresql://reservify_user:reservify123@localhost:5432/reservify"
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

    const total = await prisma.appointment.count({ where: { businessId } });
    const thisWeek = await prisma.appointment.count({
      where: { businessId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    return NextResponse.json({ appointments, total, thisWeek });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, status } = await req.json();
    const appointment = await prisma.appointment.update({ where: { id }, data: { status } });
    return NextResponse.json(appointment);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
