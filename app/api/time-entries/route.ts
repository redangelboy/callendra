import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageBusiness, readSession } from "@/lib/session-auth";
import { BUSINESS_TIMEZONE } from "@/lib/business-timezone";

type GroupedRow = {
  staffId: string;
  staffName: string;
  entries: { id: string; type: string; timestamp: string; selfieUrl: string | null }[];
  pairs: {
    checkIn: string;
    checkOut: string | null;
    hours: number | null;
    checkInSelfie: string | null;
    checkOutSelfie: string | null;
  }[];
  totalHours: number;
};

export async function GET(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!canManageBusiness(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId")?.trim();
    const date = searchParams.get("date")?.trim();
    if (!businessId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "businessId and date are required (YYYY-MM-DD)" }, { status: 400 });
    }

    if (session?.ownerId) {
      const business = await prisma.business.findFirst({
        where: { id: businessId, ownerId: session.ownerId },
        select: { id: true },
      });
      if (!business) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (session?.businessId !== businessId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dayStart = DateTime.fromISO(date, { zone: BUSINESS_TIMEZONE }).startOf("day").toUTC();
    const dayEnd = dayStart.plus({ days: 1 }).minus({ millisecond: 1 });

    const entries = await prisma.timeEntry.findMany({
      where: {
        businessId,
        timestamp: {
          gte: dayStart.toJSDate(),
          lte: dayEnd.toJSDate(),
        },
      },
      include: {
        staff: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "asc" },
    });

    const groupedMap = new Map<string, GroupedRow>();
    for (const e of entries) {
      if (!groupedMap.has(e.staffId)) {
        groupedMap.set(e.staffId, {
          staffId: e.staffId,
          staffName: e.staff.name,
          entries: [],
          pairs: [],
          totalHours: 0,
        });
      }
      const row = groupedMap.get(e.staffId)!;
      row.entries.push({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp.toISOString(),
        selfieUrl: e.selfieUrl ?? null,
      });
    }

    let totalStaffHours = 0;
    for (const row of groupedMap.values()) {
      let openCheckIn: { ts: Date; selfieUrl: string | null } | null = null;
      for (const e of row.entries) {
        const ts = new Date(e.timestamp);
        const kind = (e.type ?? "").toLowerCase();
        if (kind === "break_start" || kind === "break_end") continue;
        if (kind === "checkin") {
          if (openCheckIn) {
            row.pairs.push({
              checkIn: openCheckIn.ts.toISOString(),
              checkOut: null,
              hours: null,
              checkInSelfie: openCheckIn.selfieUrl,
              checkOutSelfie: null,
            });
          }
          openCheckIn = { ts, selfieUrl: e.selfieUrl };
          continue;
        }
        if (kind === "checkout") {
          if (!openCheckIn) continue;
          const hours = Math.max(0, (ts.getTime() - openCheckIn.ts.getTime()) / 3_600_000);
          row.totalHours += hours;
          row.pairs.push({
            checkIn: openCheckIn.ts.toISOString(),
            checkOut: ts.toISOString(),
            hours,
            checkInSelfie: openCheckIn.selfieUrl,
            checkOutSelfie: e.selfieUrl,
          });
          openCheckIn = null;
        }
      }
      if (openCheckIn) {
        row.pairs.push({
          checkIn: openCheckIn.ts.toISOString(),
          checkOut: null,
          hours: null,
          checkInSelfie: openCheckIn.selfieUrl,
          checkOutSelfie: null,
        });
      }
      row.totalHours = Number(row.totalHours.toFixed(2));
      totalStaffHours += row.totalHours;
    }

    const grouped = Array.from(groupedMap.values()).sort((a, b) => a.staffName.localeCompare(b.staffName));

    return NextResponse.json({
      date,
      businessId,
      grouped,
      totalStaffHours: Number(totalStaffHours.toFixed(2)),
    });
  } catch (error) {
    console.error("GET /api/time-entries", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Owner/admin: delete time entries for a location and calendar day (optional: one staff only). Requires business owner's password in JSON body. */
export async function DELETE(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!canManageBusiness(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    let password = "";
    try {
      const body = (await req.json()) as { password?: string };
      password = typeof body.password === "string" ? body.password : "";
    } catch {
      return NextResponse.json({ error: "JSON body with password is required" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Owner account password is required to clear entries" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId")?.trim();
    const date = searchParams.get("date")?.trim();
    const staffId = searchParams.get("staffId")?.trim() || undefined;
    if (!businessId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "businessId and date (YYYY-MM-DD) are required" }, { status: 400 });
    }

    if (session?.ownerId) {
      const business = await prisma.business.findFirst({
        where: { id: businessId, ownerId: session.ownerId },
        select: { id: true, ownerId: true },
      });
      if (!business) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (session?.businessId !== businessId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const businessForOwner = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });
    if (!businessForOwner) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    const owner = await prisma.owner.findUnique({
      where: { id: businessForOwner.ownerId },
      select: { password: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    const passwordOk = await bcrypt.compare(password, owner.password);
    if (!passwordOk) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const dayStart = DateTime.fromISO(date, { zone: BUSINESS_TIMEZONE }).startOf("day").toUTC();
    const dayEnd = dayStart.plus({ days: 1 }).minus({ millisecond: 1 });

    const result = await prisma.timeEntry.deleteMany({
      where: {
        businessId,
        ...(staffId ? { staffId } : {}),
        timestamp: {
          gte: dayStart.toJSDate(),
          lte: dayEnd.toJSDate(),
        },
      },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("DELETE /api/time-entries", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

