import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BUSINESS_TIMEZONE, businessDayUtcRange, utcFromYmdAndTime } from "@/lib/business-timezone";
import { APPOINTMENT_ACTIVE_DAY_LIST_FILTER, APPOINTMENT_BLOCKING_STATUS_FILTER } from "@/lib/appointment-blocking-status";
import { suggestEarlierStartForAppointment } from "@/lib/staff-day-suggest";
import { findStaffIntervalConflict } from "@/lib/appointment-overlap";
import { DEFAULT_THEME_ID, isValidThemeId } from "@/lib/callendra-themes";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function resolveThemePreset(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { themePreset: true },
  });
  if (b?.themePreset && isValidThemeId(b.themePreset)) return b.themePreset;
  return DEFAULT_THEME_ID;
}

/** Same idea as display API: marca (padre) + nombre de sucursal si aplica. */
async function headerLabelsForBusiness(businessId: string): Promise<{ brandName: string; locationName: string | null }> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, parentSlug: true },
  });
  if (!b) return { brandName: "", locationName: null };
  if (b.parentSlug) {
    const parent = await prisma.business.findFirst({
      where: { slug: b.parentSlug, active: true },
      select: { name: true },
    });
    if (parent) return { brandName: parent.name, locationName: b.name };
  }
  return { brandName: b.name, locationName: null };
}

async function staffFromToken(token: string | null) {
  const t = token?.trim();
  if (!t) return null;
  return prisma.staff.findFirst({
    where: { staffDayViewToken: t, active: true },
    include: {
      business: { select: { id: true, name: true, slug: true } },
      staffAssignments: { where: { active: true }, select: { businessId: true } },
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const locationIds = staff.staffAssignments.map((a) => a.businessId);
    if (locationIds.length === 0) {
      const themePreset = await resolveThemePreset(staff.businessId);
      const { brandName, locationName } = await headerLabelsForBusiness(staff.businessId);
      return NextResponse.json({
        staff: { id: staff.id, name: staff.name, photo: staff.photo },
        brandName,
        locationName,
        themePreset,
        appointments: [],
      });
    }

    const ymd = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat("yyyy-LL-dd");
    const { start: dayStart, end: dayEnd } = businessDayUtcRange(ymd);

    const appointmentsRaw = await prisma.appointment.findMany({
      where: {
        staffId: staff.id,
        businessId: { in: locationIds },
        date: { gte: dayStart, lte: dayEnd },
        ...APPOINTMENT_ACTIVE_DAY_LIST_FILTER,
      },
      include: {
        service: true,
      },
      orderBy: { date: "asc" },
    });

    const themeBusinessId = appointmentsRaw[0]?.businessId ?? locationIds[0];
    const themePreset = await resolveThemePreset(themeBusinessId);
    const { brandName, locationName } = await headerLabelsForBusiness(themeBusinessId);

    const appointments = appointmentsRaw.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      clientName: a.clientName,
      service: a.service
        ? { name: a.service.name, duration: a.service.duration }
        : null,
    }));

    return NextResponse.json({
      staff: { id: staff.id, name: staff.name, photo: staff.photo },
      brandName,
      locationName,
      themePreset,
      appointments,
    });
  } catch (e) {
    console.error("staff-day GET", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token?: string;
      appointmentId?: string;
      action?: string;
      advanceNext?: boolean;
      suggestedStartIso?: string;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
    const action = body.action;
    const advanceNext = body.advanceNext === true;

    if (!token || !appointmentId || (action !== "complete" && action !== "moveNext")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const locationIds = staff.staffAssignments.map((a) => a.businessId);
    if (!locationIds.length) {
      return NextResponse.json({ error: "Staff has no locations" }, { status: 400 });
    }

    if (action === "moveNext") {
      const next = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          staffId: staff.id,
          businessId: { in: locationIds },
          ...APPOINTMENT_ACTIVE_DAY_LIST_FILTER,
        },
        include: { service: true },
      });
      if (!next) {
        return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
      }
      const suggested = await suggestEarlierStartForAppointment(prisma, {
        staffId: staff.id,
        businessId: next.businessId,
        appointmentId: next.id,
        from: new Date(),
      });
      if (!suggested || suggested.getTime() >= next.date.getTime()) {
        return NextResponse.json({ error: "No earlier slot available" }, { status: 400 });
      }
      const sYmd = DateTime.fromJSDate(suggested, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-LL-dd");
      const sHhmm = DateTime.fromJSDate(suggested, { zone: BUSINESS_TIMEZONE }).toFormat("HH:mm");
      const newDate = utcFromYmdAndTime(sYmd, sHhmm);
      const durMin = next.service?.duration ?? 30;
      const endAt = new Date(newDate.getTime() + durMin * 60_000);
      const conflict = await findStaffIntervalConflict(prisma, {
        staffId: staff.id,
        businessId: next.businessId,
        start: newDate,
        end: endAt,
        excludeAppointmentId: next.id,
      });
      if (conflict) {
        return NextResponse.json({ error: "That time is no longer available" }, { status: 409 });
      }
      await prisma.appointment.update({
        where: { id: next.id },
        data: { date: newDate },
      });
      return NextResponse.json({ success: true });
    }

    const existing = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        staffId: staff.id,
        businessId: { in: locationIds },
        ...APPOINTMENT_BLOCKING_STATUS_FILTER,
      },
      include: { service: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Appointment not found or not allowed" }, { status: 404 });
    }

    const now = new Date();
    const durMin = existing.service?.duration ?? 30;
    const endAt = new Date(existing.date.getTime() + durMin * 60_000);
    const inProgress = existing.date <= now && endAt > now;
    if (!inProgress) {
      return NextResponse.json(
        { error: "You can only finish the appointment that is currently in progress." },
        { status: 400 }
      );
    }

    await prisma.appointment.update({
      where: { id: existing.id },
      data: { status: "completed" },
    });

    const ymd = DateTime.fromJSDate(existing.date, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-LL-dd");
    const { end: dayEnd } = businessDayUtcRange(ymd);

    const next = await prisma.appointment.findFirst({
      where: {
        staffId: staff.id,
        businessId: { in: locationIds },
        date: { gt: existing.date, lte: dayEnd },
        ...APPOINTMENT_ACTIVE_DAY_LIST_FILTER,
      },
      orderBy: { date: "asc" },
      include: { service: true, business: { select: { id: true, name: true } } },
    });

    let nextSuggestion: {
      appointmentId: string;
      clientName: string;
      businessName: string;
      currentStartIso: string;
      suggestedStartIso: string;
    } | null = null;

    let nextMoved = false;

    if (next) {
      const suggested = await suggestEarlierStartForAppointment(prisma, {
        staffId: staff.id,
        businessId: next.businessId,
        appointmentId: next.id,
        from: now,
      });
      if (suggested && suggested.getTime() < next.date.getTime()) {
        const sYmd = DateTime.fromJSDate(suggested, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-LL-dd");
        const sHhmm = DateTime.fromJSDate(suggested, { zone: BUSINESS_TIMEZONE }).toFormat("HH:mm");
        nextSuggestion = {
          appointmentId: next.id,
          clientName: next.clientName,
          businessName: next.business.name,
          currentStartIso: next.date.toISOString(),
          suggestedStartIso: utcFromYmdAndTime(sYmd, sHhmm).toISOString(),
        };
        if (advanceNext) {
          await prisma.appointment.update({
            where: { id: next.id },
            data: { date: utcFromYmdAndTime(sYmd, sHhmm) },
          });
          nextMoved = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      nextSuggestion,
      nextMoved,
    });
  } catch (e) {
    console.error("staff-day POST", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
