import { DateTime } from "luxon";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";
import { canManageBusiness, readSession } from "@/lib/session-auth";
import { checkAndAutoAssign } from "@/lib/walkin-queue-auto-assign";
import { resolveBusinessForBooking } from "@/lib/booking-business";
import { walkInTokensMatch } from "@/lib/walk-in-token";

function emitQueueEvent(locationSlug: string, event: string, payload: Record<string, unknown>) {
  const io = (global as { io?: { to: (room: string) => { emit: (name: string, data: unknown) => void } } }).io;
  if (!io) return;
  io.to(`display-${locationSlug}`).emit(event, payload);
}

async function locationAllowedForSession(req: NextRequest, locationId: string): Promise<boolean> {
  const session = readSession(req);
  if (!canManageBusiness(session)) return false;
  if (session?.ownerId) {
    const ok = await prisma.business.findFirst({
      where: { id: locationId, ownerId: session.ownerId, active: true },
      select: { id: true },
    });
    return !!ok;
  }
  return session?.businessId === locationId;
}

async function locationAllowedForStaffToken(token: string, locationId: string): Promise<boolean> {
  const staff = await prisma.staff.findFirst({
    where: { staffDayViewToken: token, active: true },
    include: { staffAssignments: { where: { active: true }, select: { businessId: true } } },
  });
  if (!staff) return false;
  return staff.staffAssignments.some((a) => a.businessId === locationId) || staff.businessId === locationId;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let locationId = searchParams.get("locationId")?.trim() ?? "";
    const token = searchParams.get("token")?.trim() ?? "";
    const walkInToken = searchParams.get("walkInToken")?.trim() ?? "";
    const parentSlug = searchParams.get("parentSlug")?.trim() ?? "";
    const locationSegment = searchParams.get("locationSegment")?.trim() ?? "";
    const locationSlug = searchParams.get("locationSlug")?.trim() ?? "";

    if (!locationId) {
      if (!walkInToken || (!parentSlug && !locationSlug)) {
        return NextResponse.json(
          { error: "locationId is required (or parentSlug/locationSlug with walkInToken)" },
          { status: 400 }
        );
      }
      const business = await resolveBusinessForBooking(prisma, {
        parentSlug: parentSlug || undefined,
        locationSlug: locationSegment || undefined,
        slug: !parentSlug ? locationSlug || undefined : undefined,
      });
      if (!business) return NextResponse.json({ error: "Location not found" }, { status: 404 });
      if (!walkInTokensMatch(walkInToken, business.walkInToken)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      locationId = business.id;
    } else {
      const allowed = token
        ? await locationAllowedForStaffToken(token, locationId)
        : await locationAllowedForSession(req, locationId);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.walkInQueue.updateMany({
      where: {
        locationId,
        status: { in: ["waiting", "notified"] },
        createdAt: { lt: DateTime.now().setZone(BUSINESS_TIMEZONE).minus({ minutes: 60 }).toJSDate() },
      },
      data: { status: "expired" },
    });

    await checkAndAutoAssign(locationId);

    const rows = await prisma.walkInQueue.findMany({
      where: { locationId, status: { in: ["waiting", "notified"] } },
      include: { service: { select: { id: true, name: true, duration: true } } },
      orderBy: { createdAt: "asc" },
    });

    const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
    const queue = rows.map((r, idx) => ({
      id: r.id,
      clientName: r.clientName,
      clientEmail: r.clientEmail,
      clientPhone: r.clientPhone,
      serviceId: r.serviceId,
      serviceName: r.service.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
      waitMinutes: Math.max(0, Math.floor(now.diff(DateTime.fromJSDate(r.createdAt), "minutes").minutes)),
      position: idx + 1,
    }));

    return NextResponse.json({ queue, count: queue.length });
  } catch (error) {
    console.error("GET /api/walkin-queue", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      locationSlug?: string;
      parentSlug?: string;
      locationSegment?: string;
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      serviceId?: string;
      smsOptIn?: boolean;
    };
    const locationSlug = (body.locationSlug ?? "").trim();
    const parentSlug = (body.parentSlug ?? "").trim();
    const locationSegment = (body.locationSegment ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    const clientEmail = String(body.clientEmail ?? "").trim();
    const clientPhone = String(body.clientPhone ?? "").trim();
    const serviceId = (body.serviceId ?? "").trim();

    if ((!locationSlug && !parentSlug) || !clientName || !serviceId) {
      return NextResponse.json(
        { error: "locationSlug or parentSlug, plus clientName and serviceId, are required" },
        { status: 400 }
      );
    }
    if (!clientEmail && !clientPhone) {
      return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });
    }

    if (body.smsOptIn !== true) {
      return NextResponse.json(
        { error: "Please agree to receive SMS messages to continue" },
        { status: 400 }
      );
    }

    const location = await (async () => {
      if (parentSlug) {
        return resolveBusinessForBooking(prisma, {
          parentSlug,
          locationSlug: locationSegment || undefined,
        });
      }
      return prisma.business.findFirst({
        where: { slug: locationSlug, active: true },
      });
    })();
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    const serviceLoc = await prisma.serviceLocation.findFirst({
      where: { businessId: location.id, serviceId, active: true, service: { active: true } },
      select: { id: true },
    });
    if (!serviceLoc) {
      return NextResponse.json({ error: "Service not available at this location" }, { status: 400 });
    }

    let businessId = location.id;
    if (location.parentSlug) {
      const parent = await prisma.business.findFirst({
        where: { slug: location.parentSlug, ownerId: location.ownerId, active: true },
        select: { id: true },
      });
      if (parent) businessId = parent.id;
    }

    const row = await prisma.walkInQueue.create({
      data: {
        businessId,
        locationId: location.id,
        clientName,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        smsOptIn: true,
        serviceId,
        status: "waiting",
      },
    });

    emitQueueEvent(location.slug, "queue:new", { queueId: row.id, locationId: location.id });

    await checkAndAutoAssign(location.id);

    const position = await prisma.walkInQueue.count({
      where: {
        locationId: location.id,
        status: { in: ["waiting", "notified"] },
        createdAt: { lte: row.createdAt },
      },
    });
    return NextResponse.json({ success: true, queueId: row.id, position });
  } catch (error) {
    console.error("POST /api/walkin-queue", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
