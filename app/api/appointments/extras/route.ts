import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, canManageBusiness } from "@/lib/session-auth";
import { loadLocationCatalog, effectiveServicePrice } from "@/lib/location-catalog";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { appointmentTotalDurationMin } from "@/lib/appointment-duration";
import { APPOINTMENT_ACTIVE_DAY_LIST_FILTER } from "@/lib/appointment-blocking-status";

async function assertCanAccessBusiness(session: NonNullable<ReturnType<typeof readSession>>, businessId: string) {
  if (session.ownerId) {
    const biz = await prisma.business.findFirst({
      where: { id: businessId, ownerId: session.ownerId, active: true },
      select: { id: true },
    });
    return !!biz;
  }
  return session.businessId === businessId;
}

/** Bookable services at a location (for catalog extra picker). */
export async function GET(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!session || !canManageBusiness(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const businessId = new URL(req.url).searchParams.get("businessId")?.trim();
    if (!businessId) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }
    if (!(await assertCanAccessBusiness(session, businessId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { services } = await loadLocationCatalog(prisma, businessId);
    return NextResponse.json({
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        price: s.price,
      })),
    });
  } catch (e) {
    console.error("GET /api/appointments/extras", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

type PostBody = {
  appointmentId?: string;
  mode?: "catalog" | "custom";
  serviceId?: string;
  label?: string;
  price?: number;
  durationMin?: number;
};

export async function POST(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!session || !canManageBusiness(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as PostBody;
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
    if (!appointmentId) {
      return NextResponse.json({ error: "appointmentId required" }, { status: 400 });
    }

    const apt = await prisma.appointment.findFirst({
      where: { id: appointmentId, ...APPOINTMENT_ACTIVE_DAY_LIST_FILTER },
      include: { service: true, extras: true, business: { select: { id: true, slug: true, ownerId: true } } },
    });
    if (!apt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (!(await assertCanAccessBusiness(session, apt.businessId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let extraDurationMin: number;
    let linePrice: number;
    let serviceId: string | null = null;
    let customLabel: string | null = null;

    if (body.mode === "catalog") {
      const sid = typeof body.serviceId === "string" ? body.serviceId.trim() : "";
      if (!sid) {
        return NextResponse.json({ error: "serviceId required for catalog extra" }, { status: 400 });
      }
      const svcLoc = await prisma.serviceLocation.findFirst({
        where: { businessId: apt.businessId, serviceId: sid, active: true },
        include: { service: true },
      });
      if (!svcLoc?.service?.active) {
        return NextResponse.json({ error: "Service not available at this location" }, { status: 400 });
      }
      serviceId = sid;
      extraDurationMin = svcLoc.service.duration ?? 30;
      linePrice =
        (await effectiveServicePrice(prisma, sid, apt.businessId)) ?? svcLoc.price ?? svcLoc.service.price ?? 0;
    } else if (body.mode === "custom") {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      customLabel = label || "Extra service";
      const price = Number(body.price);
      const durationMin = Number(body.durationMin);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Valid price required" }, { status: 400 });
      }
      if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 480) {
        return NextResponse.json({ error: "Duration must be between 5 and 480 minutes" }, { status: 400 });
      }
      linePrice = price;
      extraDurationMin = Math.floor(durationMin);
    } else {
      return NextResponse.json({ error: "mode must be catalog or custom" }, { status: 400 });
    }

    const pendingExtra = { extraDurationMin, linePrice };
    const totalEnd = new Date(
      apt.date.getTime() +
        appointmentTotalDurationMin({
          service: apt.service,
          extras: [...apt.extras, pendingExtra],
        }) *
          60_000
    );

    const conflict = await findStaffIntervalConflict(prisma, {
      staffId: apt.staffId,
      businessId: apt.businessId,
      start: apt.date,
      end: totalEnd,
      excludeAppointmentId: apt.id,
    });
    if (conflict) {
      return NextResponse.json(
        {
          error:
            conflict.kind === "break"
              ? "Adding this time overlaps a staff break."
              : "Adding this time overlaps another appointment for this staff member.",
        },
        { status: 409 }
      );
    }

    const created = await prisma.appointmentExtra.create({
      data: {
        appointmentId: apt.id,
        serviceId,
        customLabel,
        extraDurationMin,
        linePrice,
      },
      include: { service: true },
    });

    const bizRow = await prisma.business.findUnique({
      where: { id: apt.businessId },
      select: { slug: true },
    });
    if (bizRow && (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d?: unknown) => void } } }).io) {
      (global as unknown as { io: { to: (r: string) => { emit: (e: string, d?: unknown) => void } } }).io
        .to(`display-${bizRow.slug}`)
        .emit("new-appointment", { appointmentId: apt.id });
    }

    return NextResponse.json({ success: true, extra: created });
  } catch (e) {
    console.error("POST /api/appointments/extras", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
