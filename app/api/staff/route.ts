import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner, isOwnerMainBusinessSession } from "@/lib/main-business";

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
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      const staff = await prisma.staff.findMany({
        where: { businessId: mainId, active: true },
        orderBy: { name: "asc" },
        include: {
          staffAssignments: {
            where: { active: true },
            select: { businessId: true },
          },
        },
      });
      return NextResponse.json(
        staff.map((s) => ({
          id: s.id,
          name: s.name,
          photo: s.photo,
          active: s.active,
          businessId: s.businessId,
          assignedLocationIds: s.staffAssignments.map((a) => a.businessId),
        }))
      );
    }

    const assignments = await prisma.staffAssignment.findMany({
      where: { businessId: sessionBusinessId, active: true },
      include: { staff: true },
    });
    const staffList = assignments
      .map((a) => a.staff)
      .filter((s) => s != null && s.active);
    staffList.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(staffList);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId || !isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      return NextResponse.json({ error: "Staff can only be created from the main business" }, { status: 403 });
    }

    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const staff = await prisma.staff.create({
      data: { businessId: mainId, name, active: true },
    });

    await prisma.staffAssignment.create({
      data: { staffId: staff.id, businessId: mainId, active: true },
    });

    return NextResponse.json(staff);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId, businessId: sessionBusinessId } = JSON.parse(session);
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const current = await prisma.business.findUnique({ where: { id: sessionBusinessId } });
    if (!current || current.ownerId !== ownerId || !isOwnerMainBusinessSession(sessionBusinessId, mainId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await req.json();
    const row = await prisma.staff.findFirst({ where: { id, businessId: mainId } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.staffAssignment.updateMany({
      where: { staffId: id },
      data: { active: false },
    });

    await prisma.schedule.updateMany({
      where: { staffId: id },
      data: { active: false },
    });

    await prisma.appointment.updateMany({
      where: { staffId: id, status: "confirmed" },
      data: { status: "cancelled" },
    });

    await prisma.staff.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
