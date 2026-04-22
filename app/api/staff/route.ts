import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getMainBusinessIdForOwner, isOwnerMainBusinessSession } from "@/lib/main-business";
import { newStaffDayViewToken } from "@/lib/staff-day-token";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});
const prisma = new PrismaClient({ adapter });

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = JSON.parse(session);
    const { ownerId, staffUserId, businessId: sessionBusinessId } = parsed;

    // StaffUser: devolver staff de su sucursal directamente
    if (staffUserId) {
      const assignments = await prisma.staffAssignment.findMany({
        where: { businessId: sessionBusinessId, active: true },
        include: { staff: true },
      });
      const staffList = assignments.map((a) => a.staff).filter((s) => s != null && s.active);
      staffList.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ staff: staffList.map((s) => ({ id: s.id, name: s.name, photo: s.photo, phone: s.phone, email: s.email })) });
    }

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
          phone: s.phone,
          email: s.email,
          active: s.active,
          businessId: s.businessId,
          assignedLocationIds: s.staffAssignments.map((a) => a.businessId),
          ...(ownerId ? { staffDayViewToken: s.staffDayViewToken } : {}),
        }))
      );
    }

    const assignments = await prisma.staffAssignment.findMany({
      where: { businessId: sessionBusinessId, active: true },
      include: { staff: true },
    });
    const staffList = assignments.map((a) => a.staff).filter((s) => s != null && s.active);
    staffList.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(
      staffList.map((s) => ({
        id: s.id,
        name: s.name,
        photo: s.photo,
        phone: s.phone,
        email: s.email,
        active: s.active,
        businessId: s.businessId,
        ...(ownerId ? { staffDayViewToken: s.staffDayViewToken } : {}),
      }))
    );
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
      data: { businessId: mainId, name, active: true, staffDayViewToken: newStaffDayViewToken() },
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

    await prisma.staffAssignment.updateMany({ where: { staffId: id }, data: { active: false } });
    await prisma.schedule.updateMany({ where: { staffId: id }, data: { active: false } });
    await prisma.appointment.updateMany({ where: { staffId: id, status: "confirmed" }, data: { status: "cancelled" } });
    await prisma.staff.update({ where: { id }, data: { active: false } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ownerId } = JSON.parse(session);
    if (!ownerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const mainId = await getMainBusinessIdForOwner(prisma, ownerId);
    if (!mainId) return NextResponse.json({ error: "No business found" }, { status: 400 });

    const body = await req.json();
    const { id, photo, name, phone, email, action } = body as {
      id?: string;
      photo?: string;
      name?: string;
      phone?: string;
      email?: string;
      action?: string;
    };
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const row = await prisma.staff.findFirst({ where: { id, businessId: mainId } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "regenerateStaffDayViewToken") {
      const staffDayViewToken = newStaffDayViewToken();
      const updated = await prisma.staff.update({ where: { id }, data: { staffDayViewToken } });
      return NextResponse.json(updated);
    }

    const updateData: Record<string, unknown> = {};
    if (photo !== undefined) updateData.photo = photo;
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    const updated = await prisma.staff.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
