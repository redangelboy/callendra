import { DateTime } from "luxon";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BUSINESS_TIMEZONE, businessDayUtcRange } from "@/lib/business-timezone";
import { workBreakStateFromOrderedTypes } from "@/lib/clock-session";
import { staffBreakDateFromYmd } from "@/lib/staff-break-date";

function bearerStaffDayToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

const CLOCK_ACTION_TYPES = new Set(["checkin", "checkout", "break_start", "break_end"]);
const KIOSK_BREAK_LABEL = "Break (kiosk)";

type ScanTxResult =
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "used" }
  | { status: "location" }
  | { status: "sequence_checkin" }
  | { status: "sequence_checkout" }
  | { status: "sequence_checkout_break" }
  | { status: "sequence_break_start" }
  | { status: "sequence_break_end" }
  | { status: "ok"; staffName: string; timestamp: Date };

export async function POST(req: NextRequest) {
  try {
    const staffDayToken = bearerStaffDayToken(req);
    if (!staffDayToken) {
      return NextResponse.json({ error: "Authorization Bearer token required" }, { status: 401 });
    }

    const body = (await req.json()) as { qrToken?: string; type?: string; selfieUrl?: string };
    const qrToken = body.qrToken?.trim();
    const typeRaw = typeof body.type === "string" ? body.type.trim().toLowerCase() : "";
    const selfieUrl = typeof body.selfieUrl === "string" ? body.selfieUrl.trim() : "";
    if (!qrToken || !CLOCK_ACTION_TYPES.has(typeRaw)) {
      return NextResponse.json(
        { error: "qrToken and type (checkin|checkout|break_start|break_end) required" },
        { status: 400 }
      );
    }
    const type = typeRaw;
    const selfieRequired = type === "checkin" || type === "checkout";
    if (
      selfieRequired &&
      (!selfieUrl || !/^https:\/\//i.test(selfieUrl) || selfieUrl.length > 2048)
    ) {
      return NextResponse.json({ error: "selfieUrl required (HTTPS image URL from upload)" }, { status: 400 });
    }

    const staff = await prisma.staff.findFirst({
      where: { staffDayViewToken: staffDayToken, active: true },
      select: { id: true, name: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Invalid staff token" }, { status: 403 });
    }

    const now = new Date();

    const result: ScanTxResult = await prisma.$transaction(async (tx) => {
      const row = await tx.clockQrToken.findUnique({
        where: { token: qrToken },
      });
      if (!row) return { status: "invalid" };
      if (row.expiresAt <= now) return { status: "expired" };
      if (row.usedBy != null) return { status: "used" };

      const assigned = await tx.staffAssignment.findFirst({
        where: { staffId: staff.id, businessId: row.businessId, active: true },
        select: { id: true },
      });
      if (!assigned) return { status: "location" };

      const ymd = DateTime.fromJSDate(now, { zone: BUSINESS_TIMEZONE }).toFormat("yyyy-LL-dd");
      const { start: dayStart, end: dayEnd } = businessDayUtcRange(ymd);
      const todayTypes = await tx.timeEntry.findMany({
        where: {
          staffId: staff.id,
          businessId: row.businessId,
          timestamp: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { timestamp: "asc" },
        select: { type: true },
      });
      const { workOpen, breakOpen } = workBreakStateFromOrderedTypes(todayTypes);
      if (type === "checkin" && workOpen) return { status: "sequence_checkin" };
      if (type === "checkout") {
        if (!workOpen) return { status: "sequence_checkout" };
        if (breakOpen) return { status: "sequence_checkout_break" };
      }
      if (type === "break_start") {
        if (!workOpen || breakOpen) return { status: "sequence_break_start" };
      }
      if (type === "break_end") {
        if (!workOpen || !breakOpen) return { status: "sequence_break_end" };
      }

      await tx.clockQrToken.update({
        where: { id: row.id },
        data: { usedBy: staff.id, usedAt: now },
      });

      const entry = await tx.timeEntry.create({
        data: {
          businessId: row.businessId,
          staffId: staff.id,
          type,
          selfieUrl: selfieRequired ? selfieUrl : null,
        },
        select: { timestamp: true },
      });

      const nowTz = DateTime.fromJSDate(now, { zone: BUSINESS_TIMEZONE });
      if (type === "break_start") {
        const startTime = nowTz.toFormat("HH:mm");
        const minsToEndOfDay = Math.max(1, Math.ceil(nowTz.endOf("day").diff(nowTz, "minutes").minutes));
        await tx.staffBreak.create({
          data: {
            staffId: staff.id,
            businessId: row.businessId,
            date: staffBreakDateFromYmd(ymd),
            startTime,
            duration: minsToEndOfDay,
            label: KIOSK_BREAK_LABEL,
          },
        });
      } else if (type === "break_end") {
        const openBreak = await tx.staffBreak.findFirst({
          where: {
            staffId: staff.id,
            businessId: row.businessId,
            date: staffBreakDateFromYmd(ymd),
            label: KIOSK_BREAK_LABEL,
          },
          orderBy: { createdAt: "desc" },
        });
        if (openBreak) {
          const [h, m] = openBreak.startTime.split(":").map(Number);
          const startTz = nowTz.set({ hour: h || 0, minute: m || 0, second: 0, millisecond: 0 });
          const duration = Math.max(1, Math.ceil(nowTz.diff(startTz, "minutes").minutes));
          await tx.staffBreak.update({
            where: { id: openBreak.id },
            data: { duration },
          });
        }
      }

      return { status: "ok", staffName: staff.name, timestamp: entry.timestamp };
    });

    if (result.status === "invalid") {
      return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
    }
    if (result.status === "expired") {
      return NextResponse.json({ error: "QR code expired" }, { status: 410 });
    }
    if (result.status === "used") {
      return NextResponse.json({ error: "QR code already used" }, { status: 409 });
    }
    if (result.status === "location") {
      return NextResponse.json({ error: "You are not assigned to this location" }, { status: 403 });
    }
    if (result.status === "sequence_checkin") {
      return NextResponse.json(
        {
          error:
            "You are already checked in at this location today. Check out first (e.g. lunch break or end of shift), then you can check in again.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sequence_checkout") {
      return NextResponse.json(
        {
          error: "You are not checked in at this location. Check in first, then check out when you leave.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sequence_checkout_break") {
      return NextResponse.json(
        {
          error: "End your break (Break done) before checking out.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sequence_break_start") {
      return NextResponse.json(
        {
          error: "You must be checked in and not already on a break to start a break.",
        },
        { status: 409 }
      );
    }
    if (result.status === "sequence_break_end") {
      return NextResponse.json(
        {
          error: "No active break to end — start a break first when you are checked in.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      staffName: result.staffName,
      type,
      timestamp: result.timestamp.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/clock-qr/scan", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
