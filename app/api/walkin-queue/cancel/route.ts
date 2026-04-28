import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageBusiness, readSession } from "@/lib/session-auth";

async function canCancel(req: NextRequest, locationId: string, token: string): Promise<boolean> {
  if (token) {
    const staff = await prisma.staff.findFirst({
      where: { staffDayViewToken: token, active: true },
      include: { staffAssignments: { where: { active: true }, select: { businessId: true } } },
    });
    if (!staff) return false;
    return staff.businessId === locationId || staff.staffAssignments.some((a) => a.businessId === locationId);
  }
  const session = readSession(req);
  if (!canManageBusiness(session)) return false;
  if (session?.ownerId) {
    const loc = await prisma.business.findFirst({
      where: { id: locationId, ownerId: session.ownerId, active: true },
      select: { id: true },
    });
    return !!loc;
  }
  return session?.businessId === locationId;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { queueId?: string; token?: string };
    const queueId = (body.queueId ?? "").trim();
    const token = (body.token ?? "").trim();
    if (!queueId) return NextResponse.json({ error: "queueId is required" }, { status: 400 });

    const row = await prisma.walkInQueue.findUnique({
      where: { id: queueId },
      select: { id: true, locationId: true, status: true },
    });
    if (!row) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });

    const allowed = await canCancel(req, row.locationId, token);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (["taken", "expired", "cancelled"].includes(row.status)) {
      return NextResponse.json({ error: "Queue item can no longer be cancelled" }, { status: 409 });
    }

    await prisma.walkInQueue.update({
      where: { id: row.id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/walkin-queue/cancel", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
