import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: "postgresql://callendra_user:callendra123@localhost:5432/callendra"
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const schedules = await prisma.schedule.findMany({
      where: { businessId },
      include: { staff: true },
      orderBy: [{ staffId: "asc" }, { dayOfWeek: "asc" }],
    });
    return NextResponse.json(schedules);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { businessId } = JSON.parse(session);
    const { staffId, dayOfWeek, startTime, endTime } = await req.json();
    if (!staffId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    const assigned = await prisma.staffAssignment.findFirst({
      where: { businessId, staffId, active: true },
    });
    if (!assigned) {
      return NextResponse.json(
        { error: "Staff must be assigned to this location before scheduling" },
        { status: 400 }
      );
    }

    const existing = await prisma.schedule.findFirst({
      where: { businessId, staffId, dayOfWeek: parseInt(dayOfWeek) }
    });
    if (existing) {
      const updated = await prisma.schedule.update({
        where: { id: existing.id },
        data: { startTime, endTime, active: true }
      });
      return NextResponse.json(updated);
    }
    const schedule = await prisma.schedule.create({
      data: { businessId, staffId, dayOfWeek: parseInt(dayOfWeek), startTime, endTime, active: true },
    });
    return NextResponse.json(schedule);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await req.json();
    await prisma.schedule.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
